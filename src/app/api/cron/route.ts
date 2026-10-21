// GET /api/cron — reserva diária (vercel.json). Dispara as rotinas agendadas (sync de todos os
// itens, taxas CDI/IPCA, limpeza) e esvazia a fila, inclusive jobs de webhook que falharam.
// A Vercel envia "Authorization: Bearer $CRON_SECRET" quando CRON_SECRET existe no projeto.
import { timingSafeEqual } from 'node:crypto';
import { handlers, schedules } from '../../../jobs/handlers.ts';
import { drainQueue, tickSchedules } from '../../../jobs/worker.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response(null, { status: 401 });
  await tickSchedules(schedules);
  // o loop pega também os sync_item que o sync_all enfileira no meio do caminho
  const ran = await drainQueue(handlers, { budgetMs: 270_000 });
  return Response.json({ ok: true, ran });
}
