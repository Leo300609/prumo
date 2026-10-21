import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPluggyClient, PluggyError } from '../src/pluggy/client.ts';
import { accountKey, itemHealth, mapAccount, mapTransaction, signedCents, transactionDate } from '../src/pluggy/mapping.ts';
import { createPluggyWebhookHandler, routeEvent, WEBHOOK_SECRET_HEADER } from '../src/pluggy/webhook.ts';
import { syncItem } from '../src/pluggy/sync.ts';
import type { SyncStore } from '../src/pluggy/store.ts';
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../src/pluggy/types.ts';

// ───────────── mapeamento ─────────────

const checking: PluggyAccount = { id: 'a1', itemId: 'i1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', number: '12345-6',
  name: 'Conta Corrente', owner: 'Leonardo Almeida Canto', balance: 3500.1, currencyCode: 'BRL' };
const card: PluggyAccount = { id: 'a2', itemId: 'i1', type: 'CREDIT', subtype: 'CREDIT_CARD', number: '4321',
  name: 'Mastercard', marketingName: 'Nubank Mastercard Gold', balance: 1200, currencyCode: 'BRL',
  creditData: { creditLimit: 5000, availableCreditLimit: 3800, balanceDueDate: '2026-11-10' } };

test('sinais: conta usa type, cartão inverte o amount', () => {
  assert.equal(signedCents({ amount: -45.9, type: 'DEBIT' }, 'checking'), -4590);
  assert.equal(signedCents({ amount: 45.9, type: 'DEBIT' }, 'checking'), -4590); // defensivo: type manda
  assert.equal(signedCents({ amount: 5000, type: 'CREDIT' }, 'checking'), 500000);
  assert.equal(signedCents({ amount: 120, type: 'DEBIT' }, 'credit_card'), -12000);   // compra
  assert.equal(signedCents({ amount: -500, type: 'CREDIT' }, 'credit_card'), 50000);  // pagamento
});

test('datas: meia-noite UTC é o próprio dia; com horário vira São Paulo', () => {
  assert.equal(transactionDate('2026-10-05T00:00:00.000Z'), '2026-10-05');
  assert.equal(transactionDate('2026-10-05T01:30:00.000Z'), '2026-10-04');
  assert.equal(transactionDate('2026-10-05T18:00:00.000Z'), '2026-10-05');
});

test('conta: chave estável, cartão com limite e vencimento', () => {
  assert.equal(accountKey(card), 'credit_card:4321:nubank mastercard gold');
  const row = mapAccount(card, 'MeuPluggy');
  assert.equal(row.kind, 'credit_card');
  assert.equal(row.balance_cents, 120000);
  assert.equal(row.available_limit_cents, 380000);
  assert.equal(row.bill_due_date, '2026-11-10');
  assert.equal(mapAccount(checking, null).owner_name, 'Leonardo Almeida Canto');
});

test('transação: providerId vira chave estável; zerada é descartada', () => {
  const t: PluggyTransaction = { id: 'p1', accountId: 'a2', date: '2026-11-08T00:00:00.000Z', description: 'LOJA X',
    amount: 150, currencyCode: 'BRL', type: 'DEBIT', status: 'PENDING', providerId: 'OF-77',
    creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 } };
  const row = mapTransaction(t, 'local-card', 'credit_card');
  assert.deepEqual(
    row && [row.ext_key, row.status, row.amount_cents, row.installment_number, row.installment_total],
    ['of:OF-77', 'pending', -15000, 2, 3]);
  assert.equal(mapTransaction({ ...t, amount: 0 }, 'x', 'credit_card'), null);
  assert.equal(mapTransaction({ ...t, providerId: null }, 'x', 'credit_card')?.ext_key, 'pluggy:p1');
});

test('saúde do item', () => {
  const base: PluggyItem = { id: 'i1', status: 'UPDATED', executionStatus: 'SUCCESS' };
  const now = new Date('2026-10-21T12:00:00Z');
  assert.equal(itemHealth(base, now).status, 'active');
  const expired = itemHealth({ ...base, consentExpiresAt: '2026-10-01T00:00:00Z' }, now);
  assert.deepEqual([expired.status, expired.canRead, expired.errorCode], ['needs_reauth', false, 'USER_AUTHORIZATION_EXPIRED']);
  assert.equal(itemHealth({ ...base, status: 'LOGIN_ERROR', error: { code: 'INVALID_CREDENTIALS' } }, now).status, 'needs_reauth');
  assert.equal(itemHealth({ ...base, status: 'OUTDATED', executionStatus: 'SITE_NOT_AVAILABLE' }, now).status, 'error');
  assert.equal(itemHealth({ ...base, status: 'UPDATED', executionStatus: 'USER_AUTHORIZATION_PENDING' }, now).status, 'needs_action');
  assert.equal(itemHealth({ ...base, status: 'UPDATING' }, now).status, 'syncing');
});

// ───────────── cliente HTTP (fetch falso) ─────────────

type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

function fakeFetch(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const c: Call = {
      method: init?.method ?? 'GET', url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    return handler(c);
  }) as typeof fetch;
  return { f, calls };
}

test('cliente: autentica uma vez e reaproveita a apiKey por quase 2 h', async () => {
  let clock = 0;
  const { f, calls } = fakeFetch((c) => c.url.endsWith('/auth')
    ? Response.json({ apiKey: `key-${calls.filter((x) => x.url.endsWith('/auth')).length}` })
    : Response.json({ results: [] }));
  const p = createPluggyClient({ clientId: 'id', clientSecret: 's', fetch: f, now: () => clock });
  await Promise.all([p.listAccounts('i1'), p.listAccounts('i1'), p.listAccounts('i1')]);
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 1, 'chamadas simultâneas dividem a autenticação');
  clock = 105 * 60_000; // 1h45: ainda vale
  await p.listAccounts('i1');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 1);
  clock = 111 * 60_000; // 1h51: renova antes de vencer
  await p.listAccounts('i1');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 2);
  assert.equal(calls.at(-1)?.headers['x-api-key'], 'key-2');
});

test('cliente: 401 renova a chave e repete; 429 espera RateLimit-Reset', async () => {
  let accountsCalls = 0;
  const slept: number[] = [];
  const { f } = fakeFetch((c) => {
    if (c.url.endsWith('/auth')) return Response.json({ apiKey: 'k' });
    accountsCalls++;
    if (accountsCalls === 1) return new Response('{}', { status: 401 });
    if (accountsCalls === 2) return new Response('{"code":429}', { status: 429, headers: { 'RateLimit-Reset': '7' } });
    return Response.json({ results: [checking] });
  });
  const p = createPluggyClient({ clientId: 'id', clientSecret: 's', fetch: f, sleep: async (ms) => { slept.push(ms); } });
  const res = await p.listAccounts('i1');
  assert.equal(res.length, 1);
  assert.deepEqual(slept, [7000]);
});

test('cliente: erro 4xx vira PluggyError com codeDescription', async () => {
  const { f } = fakeFetch((c) => c.url.endsWith('/auth') ? Response.json({ apiKey: 'k' })
    : Response.json({ code: 400, codeDescription: 'ITEM_USER_ALREADY_EXISTS', message: 'já existe' }, { status: 400 }));
  const p = createPluggyClient({ clientId: 'id', clientSecret: 's', fetch: f });
  await assert.rejects(() => p.createConnectToken({ clientUserId: 'me' }),
    (e: unknown) => e instanceof PluggyError && e.status === 400 && e.code === 'ITEM_USER_ALREADY_EXISTS');
});

test('cliente: paginação por cursor segue `next` até null', async () => {
  const { f, calls } = fakeFetch((c) => {
    if (c.url.endsWith('/auth')) return Response.json({ apiKey: 'k' });
    if (!c.url.includes('after=')) return Response.json({ results: [{ id: 't1' }], next: '?accountId=a1&after=CUR1' });
    return Response.json({ results: [{ id: 't2' }], next: null });
  });
  const p = createPluggyClient({ clientId: 'id', clientSecret: 's', fetch: f });
  const ids: string[] = [];
  for await (const page of p.transactionPages({ accountId: 'a1', dateFrom: '2026-01-01' })) ids.push(...page.map((t) => t.id));
  assert.deepEqual(ids, ['t1', 't2']);
  assert.match(calls[1].url, /\/v2\/transactions\?accountId=a1&dateFrom=2026-01-01$/);
  assert.match(calls[2].url, /\/v2\/transactions\?accountId=a1&after=CUR1$/);
});

test('cliente: ids em lotes de 500', async () => {
  const { f, calls } = fakeFetch((c) => c.url.endsWith('/auth') ? Response.json({ apiKey: 'k' })
    : Response.json({ results: [], next: null }));
  const p = createPluggyClient({ clientId: 'id', clientSecret: 's', fetch: f });
  await p.transactionsByIds('a1', Array.from({ length: 1001 }, (_, i) => `id${i}`));
  assert.equal(calls.filter((c) => c.url.includes('/v2/transactions')).length, 3);
});

// ───────────── webhook ─────────────

const SECRET = 'x'.repeat(40);

function memorySink() {
  const seen = new Set<string>();
  const jobs: { kind: string; payload: unknown; dedupe: string | null }[] = [];
  return {
    jobs,
    sink: {
      async accept(e: { eventId: string }, job: { kind: string; payload: unknown; dedupe: string | null } | null) {
        if (seen.has(e.eventId)) return 'duplicate' as const;
        seen.add(e.eventId);
        if (job) jobs.push(job);
        return 'new' as const;
      },
    },
  };
}

const post = (body: unknown, secret = SECRET) => new Request('https://app/api/webhooks/pluggy', {
  method: 'POST', headers: { 'content-type': 'application/json', [WEBHOOK_SECRET_HEADER]: secret },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('webhook: segredo errado = 401, JSON ruim = 400', async () => {
  const { sink } = memorySink();
  const h = createPluggyWebhookHandler({ secret: SECRET, sink });
  assert.equal((await h(post({ event: 'item/updated', eventId: 'e1', itemId: 'i1' }, 'errado'))).status, 401);
  assert.equal((await h(post('{nope'))).status, 400);
  assert.equal((await h(post({ foo: 1 }))).status, 400);
});

test('webhook: enfileira, deduplica por eventId e devolve 202', async () => {
  const { sink, jobs } = memorySink();
  const h = createPluggyWebhookHandler({ secret: SECRET, sink });
  const ev = { event: 'item/updated', eventId: 'e1', itemId: 'i1', triggeredBy: 'SYNC' };
  assert.equal((await h(post(ev))).status, 202);
  assert.equal((await h(post(ev))).status, 200); // reentrega do mesmo evento
  assert.deepEqual(jobs, [{ kind: 'sync_item', payload: { itemId: 'i1' }, dedupe: 'sync_item:i1' }]);
});

test('webhook: erro no banco = 500 (a Pluggy reenvia)', async () => {
  const h = createPluggyWebhookHandler({ secret: SECRET, sink: {
    async accept() { throw new Error('db down'); } } });
  assert.equal((await h(post({ event: 'item/updated', eventId: 'e9', itemId: 'i1' }))).status, 500);
});

test('roteamento de eventos', () => {
  assert.equal(routeEvent({ event: 'item/error', itemId: 'i1' })?.kind, 'refresh_item');
  assert.deepEqual(routeEvent({ event: 'transactions/deleted', transactionIds: ['a', 'b'] })?.payload, { ids: ['a', 'b'] });
  assert.equal(routeEvent({ event: 'transactions/created', itemId: 'i1', accountId: 'a1',
    transactionsCreatedAtFrom: '2026-10-21T10:00:00Z' })?.kind, 'tx_created');
  assert.equal(routeEvent({ event: 'connector/status_updated', connectorId: '201' }), null);
});

// ───────────── sync com store em memória ─────────────

function memoryStore(lastSyncedAt: Date | null = null) {
  const state = {
    health: [] as { status: string; errorCode: string | null }[],
    accounts: [] as { id: string; provider_account_id: string; kind: 'checking' | 'savings' | 'credit_card' }[],
    tx: new Map<string, { amount_cents: number; date: string }>(),
    logs: [] as string[], postProcessed: [] as string[], synced: 0,
  };
  const store: SyncStore = {
    async ensureConnection(itemId) { return { id: 'c1', itemId, status: 'active', lastSyncedAt }; },
    async setConnectionHealth(_id, h) { state.health.push(h); },
    async markSynced() { state.synced++; },
    async upsertAccounts(_c, rows) {
      state.accounts = rows.map((r, i) => ({ id: `local-${i}`, provider_account_id: r.provider_account_id, kind: r.kind }));
      return state.accounts;
    },
    async findAccountByProviderId(pid) { return state.accounts.find((a) => a.provider_account_id === pid) ?? null; },
    async upsertTransactions(rows) { for (const r of rows) state.tx.set(`${r.account_id}|${r.ext_key}`, r); return rows.length; },
    async deleteTransactions(ids) { return ids.length; },
    async upsertInvestments() { return []; },
    async upsertInvestmentFlows() {},
    async snapshotInvestments() {},
    async postProcess(since) { state.postProcessed.push(since); },
    async startLog() { return 1; },
    async finishLog(_id, result, _n, error) { state.logs.push(error ? `${result}:${error}` : result); },
  };
  return { store, state };
}

function fakePluggy(item: PluggyItem, accounts: PluggyAccount[], tx: Record<string, PluggyTransaction[]>) {
  return {
    getItem: async () => item,
    listAccounts: async () => accounts,
    async *transactionPages(q: { accountId: string }) { yield tx[q.accountId] ?? []; },
    listInvestments: async () => { throw new PluggyError(403, 'sem produto', null, null); },
    listInvestmentTransactions: async () => [],
  } as unknown as Parameters<typeof syncItem>[2]['pluggy'];
}

test('sync: grava contas e transações, pós-processa e marca sincronizado', async () => {
  const { store, state } = memoryStore();
  const pluggy = fakePluggy({ id: 'i1', status: 'UPDATED', executionStatus: 'SUCCESS', connector: { name: 'MeuPluggy' } },
    [checking, card], {
      a1: [{ id: 't1', accountId: 'a1', date: '2026-10-05T00:00:00.000Z', description: 'SALARIO', amount: 5000,
             currencyCode: 'BRL', type: 'CREDIT', status: 'POSTED', providerId: 'OF-1' }],
      a2: [{ id: 't2', accountId: 'a2', date: '2026-10-08T00:00:00.000Z', description: 'CARREFOUR', amount: 120,
             currencyCode: 'BRL', type: 'DEBIT', status: 'POSTED', providerId: 'OF-2' }],
    });
  const r = await syncItem('i1', 'test', { pluggy, store, now: () => new Date('2026-10-21T12:00:00Z') });
  assert.deepEqual(r, { result: 'success', accounts: 2, transactions: 2 });
  assert.equal(state.tx.get('local-0|of:OF-1')?.amount_cents, 500000);
  assert.equal(state.tx.get('local-1|of:OF-2')?.amount_cents, -12000);
  assert.equal(state.synced, 1);
  assert.deepEqual(state.postProcessed, ['2025-09-13']); // primeira sync: 400 dias + 3 de folga
});

test('sync: autorização vencida não lê nada e não apaga nada', async () => {
  const { store, state } = memoryStore(new Date('2026-10-20T12:00:00Z'));
  let read = false;
  const pluggy = { ...fakePluggy({ id: 'i1', status: 'UPDATED', consentExpiresAt: '2026-10-01T00:00:00Z' }, [], {}),
    listAccounts: async () => { read = true; return []; } } as unknown as Parameters<typeof syncItem>[2]['pluggy'];
  const r = await syncItem('i1', 'test', { pluggy, store, now: () => new Date('2026-10-21T12:00:00Z') });
  assert.deepEqual(r, { result: 'skipped', reason: 'USER_AUTHORIZATION_EXPIRED' });
  assert.equal(read, false);
  assert.equal(state.health[0].status, 'needs_reauth');
  assert.equal(state.synced, 0);
});

test('sync incremental volta 7 dias desde a última sincronização', async () => {
  const { store, state } = memoryStore(new Date('2026-10-20T12:00:00Z'));
  const seen: string[] = [];
  const pluggy = { ...fakePluggy({ id: 'i1', status: 'UPDATED' }, [checking], {}),
    async *transactionPages(q: { dateFrom?: string }) { seen.push(q.dateFrom ?? ''); yield []; },
  } as unknown as Parameters<typeof syncItem>[2]['pluggy'];
  await syncItem('i1', 'test', { pluggy, store, now: () => new Date('2026-10-21T12:00:00Z') });
  assert.deepEqual(seen, ['2026-10-13']);
  assert.deepEqual(state.postProcessed, ['2026-10-10']);
});

test('webhook: falha na 1ª entrega não perde o evento na reentrega', async () => {
  const { sink, jobs } = memorySink();
  let fail = true;
  const flaky = { accept: async (e: { eventId: string }, j: Parameters<typeof sink.accept>[1]) => {
    if (fail) { fail = false; throw new Error('db caiu no meio'); } // transação inteira desfeita
    return sink.accept(e, j);
  } };
  const h = createPluggyWebhookHandler({ secret: SECRET, sink: flaky });
  const ev = { event: 'transactions/deleted', eventId: 'e-flaky', itemId: 'i1', accountId: 'a1', transactionIds: ['t9'] };
  assert.equal((await h(post(ev))).status, 500);   // a Pluggy reenvia
  assert.equal((await h(post(ev))).status, 202);   // reentrega processa normalmente
  assert.deepEqual(jobs.map((j) => j.kind), ['tx_deleted']);
});
