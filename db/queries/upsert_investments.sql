-- $1: jsonb array de investimentos mapeados   $2: uuid da connection
insert into investment (connection_id, provider_investment_id, name, type, subtype, code,
                        balance_cents, amount_original_cents, status, updated_at)
select $2::uuid, r.provider_investment_id, r.name, r.type, r.subtype, r.code,
       r.balance_cents, r.amount_original_cents, r.status, now()
from jsonb_to_recordset($1::jsonb) as r(
  provider_investment_id text, name text, type text, subtype text, code text,
  balance_cents bigint, amount_original_cents bigint, status text)
on conflict (provider_investment_id) do update set
  connection_id         = excluded.connection_id,
  name                  = excluded.name,
  balance_cents         = excluded.balance_cents,
  amount_original_cents = excluded.amount_original_cents,
  status                = excluded.status,
  updated_at            = now()
returning id, provider_investment_id;
