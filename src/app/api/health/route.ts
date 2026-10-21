// GET /api/health — para o healthcheck da hospedagem. Não expõe dados.
import { db } from '../../../db/index.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await db()`select 1`;
    const [{ pending }] = await db()<{ pending: number }[]>`
      select count(*)::int as pending from job where done_at is null and attempts >= max_attempts`;
    return Response.json({ ok: true, stuckJobs: pending });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
