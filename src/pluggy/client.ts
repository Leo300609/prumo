// Cliente HTTP da Pluggy, sem SDK: só fetch. Cuida de:
//  • apiKey (2 h): cache em memória, renovação 10 min antes de vencer e em qualquer 401
//  • 429: espera RateLimit-Reset (ou Retry-After) e tenta de novo
//  • 5xx e falha de rede: até 3 tentativas com espera crescente
//  • paginação: cursor (/v2/transactions, campo `next`) e numerada (/investments)
import type {
  CursorPage, NumberedPage, PluggyAccount, PluggyInvestment, PluggyInvestmentTransaction,
  PluggyItem, PluggyTransaction,
} from './types.ts';

export class PluggyError extends Error {
  status: number;
  code: string | null;
  body: unknown;
  constructor(status: number, message: string, code: string | null, body: unknown) {
    super(message);
    this.name = 'PluggyError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export type PluggyClientOptions = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

const API_KEY_TTL_MS = 2 * 60 * 60_000;
const RENEW_BEFORE_MS = 10 * 60_000;

export function createPluggyClient(opts: PluggyClientOptions) {
  const baseUrl = (opts.baseUrl ?? 'https://api.pluggy.ai').replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = opts.timeoutMs ?? 20_000;

  let apiKey: { value: string; expiresAt: number } | null = null;
  let inflightAuth: Promise<string> | null = null;

  async function authenticate(): Promise<string> {
    const res = await doFetch(`${baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: opts.clientId, clientSecret: opts.clientSecret }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => null) as { apiKey?: string; message?: string } | null;
    if (!res.ok || !body?.apiKey) {
      throw new PluggyError(res.status, `falha ao autenticar na Pluggy: ${body?.message ?? res.statusText}`, null, body);
    }
    apiKey = { value: body.apiKey, expiresAt: now() + API_KEY_TTL_MS };
    return body.apiKey;
  }

  async function getApiKey(force = false): Promise<string> {
    if (!force && apiKey && now() < apiKey.expiresAt - RENEW_BEFORE_MS) return apiKey.value;
    // várias chamadas simultâneas compartilham a mesma autenticação
    inflightAuth ??= authenticate().finally(() => { inflightAuth = null; });
    return inflightAuth;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let authRetried = false;
    for (let attempt = 1; ; attempt++) {
      const key = await getApiKey();
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}${path}`, {
          method,
          headers: { 'X-API-KEY': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (attempt >= 3) throw err;
        await sleep(1000 * attempt ** 2);
        continue;
      }

      if (res.status === 401 && !authRetried) {
        authRetried = true;
        await getApiKey(true);
        continue;
      }
      if (res.status === 429 && attempt < 4) {
        const reset = Number(res.headers.get('RateLimit-Reset') ?? res.headers.get('Retry-After') ?? 60);
        await sleep(Math.min(Math.max(reset, 1), 60) * 1000);
        continue;
      }
      if (res.status >= 500 && attempt < 3) {
        await sleep(1000 * attempt ** 2);
        continue;
      }

      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) {
        const d = data as { message?: string; codeDescription?: string; code?: unknown } | null;
        throw new PluggyError(res.status, d?.message ?? `HTTP ${res.status} em ${method} ${path}`,
          d?.codeDescription ?? (typeof d?.code === 'string' ? d.code : null), data);
      }
      return data as T;
    }
  }

  async function* cursorPages<T>(path: string, query: Record<string, string | undefined>): AsyncGenerator<T[]> {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][]);
    let next: string | null = `?${qs}`;
    while (next) {
      const page: CursorPage<T> = await request<CursorPage<T>>('GET', `${path}${next}`);
      if (page.results.length) yield page.results;
      next = page.next;
    }
  }

  async function allNumberedPages<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const qs = new URLSearchParams({ ...query, page: String(page), pageSize: '500' });
      const res = await request<NumberedPage<T>>('GET', `${path}?${qs}`);
      out.push(...res.results);
      if (page >= (res.totalPages ?? 1)) return out;
    }
  }

  return {
    /** Token de 30 min, escopo restrito, que vai para o navegador abrir o widget Pluggy Connect. */
    async createConnectToken(input: { itemId?: string; clientUserId: string }): Promise<string> {
      const res = await request<{ accessToken: string }>('POST', '/connect_token', {
        ...(input.itemId ? { itemId: input.itemId } : {}),
        options: { clientUserId: input.clientUserId, avoidDuplicates: true },
      });
      return res.accessToken;
    },

    getItem: (itemId: string) => request<PluggyItem>('GET', `/items/${encodeURIComponent(itemId)}`),
    deleteItem: (itemId: string) => request<unknown>('DELETE', `/items/${encodeURIComponent(itemId)}`),

    async listAccounts(itemId: string): Promise<PluggyAccount[]> {
      const res = await request<{ results: PluggyAccount[] }>('GET', `/accounts?itemId=${encodeURIComponent(itemId)}`);
      return res.results;
    },

    /** Páginas de até 500 transações. Use dateFrom OU createdAtFrom (a API não aceita os dois). */
    transactionPages(q: { accountId: string; dateFrom?: string; createdAtFrom?: string }) {
      return cursorPages<PluggyTransaction>('/v2/transactions', {
        accountId: q.accountId, dateFrom: q.dateFrom, createdAtFrom: q.createdAtFrom,
      });
    },

    /** Busca transações específicas (webhook transactions/updated), em lotes de 500 ids. */
    async transactionsByIds(accountId: string, ids: string[]): Promise<PluggyTransaction[]> {
      const out: PluggyTransaction[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        for await (const page of cursorPages<PluggyTransaction>('/v2/transactions', {
          accountId, ids: ids.slice(i, i + 500).join(','),
        })) out.push(...page);
      }
      return out;
    },

    listInvestments: (itemId: string) => allNumberedPages<PluggyInvestment>('/investments', { itemId }),
    listInvestmentTransactions: (investmentId: string) =>
      allNumberedPages<PluggyInvestmentTransaction>(`/investments/${encodeURIComponent(investmentId)}/transactions`, {}),

    // webhooks (registrados uma vez pelo script scripts/register-webhook.ts)
    listWebhooks: () => request<{ results: { id: string; url: string; event: string }[] }>('GET', '/webhooks'),
    createWebhook: (w: { url: string; event: string; headers?: Record<string, string> }) =>
      request<{ id: string; url: string; event: string }>('POST', '/webhooks', w),
    deleteWebhook: (id: string) => request<unknown>('DELETE', `/webhooks/${encodeURIComponent(id)}`),
  };
}

export type PluggyClient = ReturnType<typeof createPluggyClient>;

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 300) }; }
}
