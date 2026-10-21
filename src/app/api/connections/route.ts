// POST /api/connections — chamado pelo onSuccess do widget com o itemId criado/atualizado.
// Grava a conexão e enfileira a primeira sincronização; o webhook item/created também
// enfileiraria, e o dedupe_key garante que vira um job só.
import { db } from '../../../db/index.ts';
import { enqueue } from '../../../db/store.ts';
import { sessionOr401 } from '../../../lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const denied = await sessionOr401();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  if (typeof body.itemId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.itemId)) {
    return Response.json({ error: 'itemId inválido' }, { status: 400 });
  }
  await db()`insert into connection (provider, item_id, status) values ('pluggy', ${body.itemId}, 'syncing')
             on conflict (item_id) do update set status = 'syncing'`;
  await enqueue('sync_item', { itemId: body.itemId, trigger: 'user' }, `sync_item:${body.itemId}`);
  return Response.json({ ok: true }, { status: 201 });
}
