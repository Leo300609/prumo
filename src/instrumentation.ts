// O Next.js chama register() uma vez quando o servidor sobe. Usamos isso para iniciar o
// worker no mesmo processo: um container só para app + webhooks + fila + agendamentos.
// Em hospedagem serverless (sem processo contínuo), defina WORKER_ENABLED=false e rode o worker à parte.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WORKER_ENABLED === 'false') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { startWorker } = await import('./jobs/worker.ts');
  const { handlers, schedules } = await import('./jobs/handlers.ts');
  startWorker({ handlers, schedules });
}
