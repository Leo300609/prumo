// POST /api/webhooks/pluggy — recebe eventos da Pluggy. Não exige sessão (quem chama é a
// Pluggy), mas exige o header secreto registrado em scripts/register-webhook.ts.
import { after } from 'next/server';
import { pgWebhookSink } from '../../../../db/store.ts';
import { handlers } from '../../../../jobs/handlers.ts';
import { drainQueue } from '../../../../jobs/worker.ts';
import { env } from '../../../../lib/env.ts';
import { createPluggyWebhookHandler } from '../../../../pluggy/webhook.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // o job roda depois da resposta (after) e precisa de folga

let handler: ((req: Request) => Promise<Response>) | null = null;

export async function POST(req: Request): Promise<Response> {
  handler ??= createPluggyWebhookHandler({
    secret: env().PLUGGY_WEBHOOK_SECRET,
    sink: pgWebhookSink,
    log: (msg, extra) => console.warn(`[webhook] ${msg}`, extra ?? ''),
  });
  const res = await handler(req);
  // Sem worker contínuo (serverless): responde 202 em milissegundos e processa o job na hora,
  // depois da resposta. Se falhar, o job volta com backoff e o cron diário o retoma.
  if (res.status === 202 && !env().WORKER_ENABLED) after(() => drainQueue(handlers, { budgetMs: 270_000 }));
  return res;
}
