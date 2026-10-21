-- $1: jsonb array [{provider_tx_id, investment_id, date, type, amount_cents}]
-- amount_cents: + aporte (dinheiro entrando na carteira), − resgate
insert into investment_flow (provider_tx_id, investment_id, date, type, amount_cents)
select r.provider_tx_id, r.investment_id, r.date, r.type, r.amount_cents
from jsonb_to_recordset($1::jsonb) as r(provider_tx_id text, investment_id uuid, date date, type text, amount_cents bigint)
on conflict (provider_tx_id) do update set
  date = excluded.date, type = excluded.type, amount_cents = excluded.amount_cents
returning provider_tx_id;
