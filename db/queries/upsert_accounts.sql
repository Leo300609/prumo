-- $1: jsonb array de contas já mapeadas (ver src/pluggy/mapping.ts)
-- $2: uuid da connection
-- A chave é account_key (estável): se o item for recriado após reautorizar,
-- a conta local é reaproveitada e só o provider_account_id/connection_id mudam.
insert into account (
  connection_id, provider_account_id, account_key, kind, name, institution, owner_name, currency,
  balance_cents, credit_limit_cents, available_limit_cents, bill_close_date, bill_due_date, balance_at
)
select $2::uuid, r.provider_account_id, r.account_key, r.kind, r.name, r.institution, r.owner_name, r.currency,
       r.balance_cents, r.credit_limit_cents, r.available_limit_cents, r.bill_close_date, r.bill_due_date, now()
from jsonb_to_recordset($1::jsonb) as r(
  provider_account_id text, account_key text, kind text, name text, institution text, owner_name text,
  currency text, balance_cents bigint, credit_limit_cents bigint, available_limit_cents bigint,
  bill_close_date date, bill_due_date date)
on conflict (account_key) do update set
  connection_id         = excluded.connection_id,
  provider_account_id   = excluded.provider_account_id,
  owner_name            = coalesce(excluded.owner_name, account.owner_name),
  balance_cents         = excluded.balance_cents,
  credit_limit_cents    = excluded.credit_limit_cents,
  available_limit_cents = excluded.available_limit_cents,
  bill_close_date       = excluded.bill_close_date,
  bill_due_date         = excluded.bill_due_date,
  balance_at            = excluded.balance_at
returning id, provider_account_id, kind;
