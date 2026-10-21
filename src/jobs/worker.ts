// Worker de fila no próprio Postgres (sem Redis): pega um job por vez com SKIP LOCKED,
// executa, marca sucesso ou reagenda com backoff. Também dispara as rotinas diárias.
// Com WORKER_ENABLED=true roda dentro do processo do Next.js (ver src/instrumentation.ts);
// em hospedagem serverless (Vercel) o webhook e o cron chamam drainQueue() diretamente.
import { randomUUID } from 'node:crypto';
import { q } from '../db/index.ts';
import { enqueue } from '../db/store.ts';
import { lastScheduledInstant } from '../lib/time.ts';

export type Job = { id: number; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
export type Handler = (payload: Record<string, unknown>, job: Job) => Promise<void>;
export type Schedule = { name: string; hour: number; minute: number; kind: string; payload?: unknown };
type Log = (msg: string, extra?: unknown) => void;

const defaultLog: Log = (m, e) => console.log(`[worker] ${m}`, e ?? '');

/** Enfileira as rotinas agendadas cujo horário já passou e que ainda não rodaram hoje. */
export async function tickSchedules(schedules: Schedule[], log: Log = defaultLog) {
  for (const s of schedules) {
    const due = lastScheduledInstant(s.hour, s.minute);
    const claimed = await q('schedule_claim', [s.name, due.toISOString()]);
    if (claimed.length) {
      await enqueue(s.kind, s.payload ?? {}, `${s.kind}:${due.toISOString()}`);
      log(`agendamento ${s.name} disparado (${due.toISOString()})`);
    }
  }
}

/** Pega e executa um job. Devolve false quando não há nenhum pronto. */
async function runNextJob(handlers: Record<string, Handler>, workerId: string, log: Log): Promise<boolean> {
  const [job] = await q<Job>('job_claim', [workerId]);
  if (!job) return false;
  try {
    const handler = handlers[job.kind];
    if (!handler) throw new Error(`sem handler para ${job.kind}`);
    await handler(job.payload, job);
    await q('job_finish', [job.id, null]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await q('job_finish', [job.id, msg.slice(0, 1000)]);
    log(`job ${job.kind}#${job.id} falhou (tentativa ${job.attempts}/${job.max_attempts}): ${msg}`);
  }
  return true;
}

/**
 * Executa os jobs prontos até a fila esvaziar ou o orçamento de tempo acabar (serverless:
 * a função tem limite de duração). Job que falha volta com backoff e é pego na próxima chamada.
 */
export async function drainQueue(handlers: Record<string, Handler>, opts: { budgetMs?: number; log?: Log } = {}) {
  const log = opts.log ?? defaultLog;
  const workerId = `s-${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  let ran = 0;
  while (Date.now() < deadline && (await runNextJob(handlers, workerId, log))) ran++;
  return ran;
}

export function startWorker(opts: {
  handlers: Record<string, Handler>;
  schedules: Schedule[];
  pollMs?: number;
  log?: Log;
}) {
  const workerId = `w-${randomUUID().slice(0, 8)}`;
  const pollMs = opts.pollMs ?? 2000;
  const log = opts.log ?? defaultLog;
  let running = true;
  let lastScheduleTick = 0;

  async function loop() {
    while (running) {
      try {
        if (Date.now() - lastScheduleTick > 30_000) {
          lastScheduleTick = Date.now();
          await tickSchedules(opts.schedules, log);
        }
        if (!(await runNextJob(opts.handlers, workerId, log))) await new Promise((r) => setTimeout(r, pollMs));
      } catch (err) {
        // banco indisponível etc.: espera e tenta de novo, sem derrubar o processo
        log('erro no loop do worker', err);
        await new Promise((r) => setTimeout(r, 10_000));
      }
    }
  }

  void loop();
  log(`iniciado (${workerId})`);
  return { stop: () => { running = false; } };
}
