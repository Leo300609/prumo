// POST /api/pluggy/connect-token — gera um connect token (30 min, escopo restrito) para o widget.
// Corpo opcional { itemId } para reconectar/atualizar um item existente em vez de criar outro.
import { db } from '../../../../db/index.ts';
import { pluggy } from '../../../../jobs/handlers.ts';
import { sessionOr401 } from '../../../../lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const denied = await sessionOr401();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown };
  const itemId = typeof body.itemId === 'string' ? body.itemId : undefined;
  if (itemId) {
    const [known] = await db()`select 1 from connection where item_id = ${itemId}`;
    if (!known) return Response.json({ error: 'item desconhecido' }, { status: 404 });
  }

  const accessToken = await pluggy().createConnectToken({ itemId, clientUserId: 'prumo-owner' });
  return Response.json({ accessToken }, { headers: { 'Cache-Control': 'no-store' } });
}
