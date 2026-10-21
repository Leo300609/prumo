// POST /api/import — importa extrato OFX ou CSV (multipart: file, accountId, invertSign).
// Para bancos fora do Open Finance (ex.: Revolut) ou para trazer histórico antigo.
import { createHash } from 'node:crypto';
import { db, json, q } from '../../../db/index.ts';
import { parseStatementCsv } from '../../../domain/csv.ts';
import { decodeOfx, parseOfx } from '../../../domain/ofx.ts';
import { sessionOr401 } from '../../../lib/session.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request): Promise<Response> {
  const denied = await sessionOr401();
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get('file');
  const accountId = String(form.get('accountId') ?? '');
  if (!(file instanceof File)) return Response.json({ error: 'envie um arquivo' }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: 'arquivo maior que 5 MB' }, { status: 413 });

  const [account] = await db()<{ id: string }[]>`select id from account where id = ${accountId} and not archived`;
  if (!account) return Response.json({ error: 'conta inválida' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const isOfx = /\.ofx$/i.test(file.name) || /OFXHEADER|<OFX>/i.test(new TextDecoder('latin1').decode(bytes.subarray(0, 400)));

  let rows: { extKey: string; date: string; amountCents: number; description: string }[];
  try {
    rows = isOfx
      ? parseOfx(decodeOfx(bytes)).transactions
      : parseStatementCsv(new TextDecoder('utf-8').decode(bytes), { invertSign: form.get('invertSign') === 'on' });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'arquivo inválido' }, { status: 422 });
  }

  const [batch] = await db()<{ id: string }[]>`
    insert into import_batch (account_id, format, sha256, rows_total, rows_new)
    values (${account.id}, ${isOfx ? 'ofx' : 'csv'}, ${sha256}, ${rows.length}, 0)
    on conflict (account_id, sha256) do nothing returning id`;
  if (!batch) return Response.json({ error: 'este arquivo já foi importado nesta conta' }, { status: 409 });

  // reaproveita o upsert do Open Finance; ext_key 'ofx:'/'csv:' evita colidir com as chaves da Pluggy
  const mapped = rows.map((r) => ({
    account_id: account.id, provider_tx_id: null, ext_key: r.extKey, status: 'posted', date: r.date,
    amount_cents: r.amountCents, currency: 'BRL', description: r.description, merchant: null,
    provider_category: null, installment_number: null, installment_total: null,
  }));
  let inserted = 0;
  for (let i = 0; i < mapped.length; i += 500) {
    const res = await q<{ inserted: boolean }>('upsert_transactions', [json(mapped.slice(i, i + 500))]);
    inserted += res.filter((r) => r.inserted).length;
  }
  const sourceKind = isOfx ? 'ofx' : 'csv';
  await db()`update transaction set source = ${sourceKind}, import_batch_id = ${batch.id}
             where account_id = ${account.id} and ext_key like ${sourceKind + ':%'} and import_batch_id is null`;
  await db()`update import_batch set rows_new = ${inserted} where id = ${batch.id}`;
  const since = rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0]?.date ?? '2100-01-01');
  await q('categorize', [since]);
  await q('pair_transfers', [since]);

  return Response.json({ total: rows.length, inserted });
}
