-- $1: jsonb array de investimentos mapeados   $2: uuid da connection
insert into investment (connection_id, provider_investment_id, name, type, subtype, code,
                        balance_cents, amount_original_cents, status, institution,
                        rate_type, rate, fixed_rate, issue_date, due_date, updated_at)
select $2::uuid, r.provider_investment_id, r.name, r.type, r.subtype, r.code,
       r.balance_cents, r.amount_original_cents, r.status, r.institution,
       r.rate_type, r.rate, r.fixed_rate, r.issue_date, r.due_date, now()
from jsonb_to_recordset($1::jsonb) as r(
  provider_investment_id text, name text, type text, subtype text, code text,
  balance_cents bigint, amount_original_cents bigint, status text, institution text,
  rate_type text, rate numeric, fixed_rate numeric, issue_date date, due_date date)
on conflict (provider_investment_id) do update set
  connection_id         = excluded.connection_id,
  name                  = excluded.name,
  balance_cents         = excluded.balance_cents,
  amount_original_cents = excluded.amount_original_cents,
  status                = excluded.status,
  institution           = coalesce(excluded.institution, investment.institution),
  rate_type             = excluded.rate_type,
  rate                  = excluded.rate,
  fixed_rate            = excluded.fixed_rate,
  issue_date            = excluded.issue_date,
  due_date              = excluded.due_date,
  updated_at            = now()
returning id, provider_investment_id;
