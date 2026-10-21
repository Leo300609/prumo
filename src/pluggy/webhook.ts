// Handler de webhook da Pluggy no formato Web (Request → Response), que é exatamente
// o que um Route Handler do Next.js usa. Regras da Pluggy que moldam o código:
//  • responder 2xx em até 10 s (por isso só gravamos e enfileiramos)
//  • 400/401/403/404/405 NÃO são reenviados; 5xx e timeout são (até 3 vezes)
//  • não há assinatura HMAC: autenticamos por um header secreto definido no cadastro do webhook
import { timingSafeEqual } from 'node:crypto';
import type { RoutedJob, WebhookSink } from './store.ts';

export const WEBHOOK_SECRET_HEADER = 'x-prumo-webhook-secret';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type Routed = RoutedJob | null;

/** Decide qual job cada evento gera. Eventos repetidos do mesmo item colapsam num job só. */
export function routeEvent(e: Record<string, unknown>): Routed {
  const event = String(e.event ?? '');
  const itemId = typeof e.itemId === 'string' ? e.itemId : null;
  switch (event) {
    case 'item/created':
    case 'item/updated':
      return itemId ? { kind: 'sync_item', payload: { itemId }, dedupe: `sync_item:${itemId}` } : null;
    case 'item/error':
    case 'item/waiting_user_input':
    case 'item/waiting_user_action':
    case 'item/login_succeeded':
      return itemId ? { kind: 'refresh_item', payload: { itemId }, dedupe: `refresh_item:${itemId}` } : null;
    case 'item/deleted':
      return itemId ? { kind: 'item_deleted', payload: { itemId }, dedupe: `item_deleted:${itemId}` } : null;
    case 'transactions/created': {
      const accountId = typeof e.accountId === 'string' ? e.accountId : null;
      const from = typeof e.transactionsCreatedAtFrom === 'string' ? e.transactionsCreatedAtFrom : null;
      if (!accountId || !from) return itemId ? { kind: 'sync_item', payload: { itemId }, dedupe: `sync_item:${itemId}` } : null;
      return { kind: 'tx_created', payload: { accountId, createdAtFrom: from }, dedupe: `tx_created:${accountId}:${from}` };
    }
    case 'transactions/updated': {
      const ids = Array.isArray(e.transactionIds) ? e.transactionIds.filter((x) => typeof x === 'string') : [];
      return typeof e.accountId === 'string' && ids.length
        ? { kind: 'tx_updated', payload: { accountId: e.accountId, ids }, dedupe: null } : null;
    }
    case 'transactions/deleted': {
      const ids = Array.isArray(e.transactionIds) ? e.transactionIds.filter((x) => typeof x === 'string') : [];
      return ids.length ? { kind: 'tx_deleted', payload: { ids }, dedupe: null } : null;
    }
    default:
      return null; // connector/status_updated e eventos de pagamento: só registramos
  }
}

export function createPluggyWebhookHandler(deps: { secret: string; sink: WebhookSink; log?: (msg: string, extra?: unknown) => void }) {
  const log = deps.log ?? (() => {});
  if (deps.secret.length < 32) throw new Error('PLUGGY_WEBHOOK_SECRET precisa ter pelo menos 32 caracteres');

  return async function POST(req: Request): Promise<Response> {
    const provided = req.headers.get(WEBHOOK_SECRET_HEADER) ?? '';
    if (!safeEqual(provided, deps.secret)) {
      log('webhook recusado: segredo inválido');
      return new Response(null, { status: 401 }); // 401: a Pluggy não reenvia, que é o certo aqui
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { eventId?: unknown }).eventId !== 'string'
          || typeof (parsed as { event?: unknown }).event !== 'string') {
        return Response.json({ error: 'payload sem event/eventId' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return Response.json({ error: 'JSON inválido' }, { status: 400 });
    }

    try {
      const job = routeEvent(body);
      const result = await deps.sink.accept({
        eventId: body.eventId as string, event: body.event as string,
        itemId: typeof body.itemId === 'string' ? body.itemId : null, payload: body,
      }, job);
      if (result === 'duplicate') return Response.json({ status: 'duplicate' }, { status: 200 });
      return Response.json({ status: 'queued', job: job?.kind ?? null }, { status: 202 });
    } catch (err) {
      // erro nosso (banco fora do ar etc.): 500 faz a Pluggy tentar de novo em ~15 min e ~2 h
      log('webhook: erro ao gravar', err);
      return Response.json({ error: 'temporário' }, { status: 500 });
    }
  };
}
