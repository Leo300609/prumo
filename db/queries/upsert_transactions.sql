-- $1: jsonb array de transações já mapeadas (sinal local: + entra, − sai)
-- Chave: (account_id, ext_key). ext_key = providerId do Open Finance quando existe
-- (estável entre items e entre exclusão/recriação na Pluggy) ou o id da Pluggy.
-- Categoria, nota e "conferido" escolhidos pelo usuário nunca são sobrescritos.
insert into transaction (
  account_id, source, provider_tx_id, ext_key, status, kind, date, amount_cents, currency,
  description, merchant, provider_category, installment_number, installment_total
)
select r.account_id, 'pluggy', r.provider_tx_id, r.ext_key, r.status,
       case when r.amount_cents > 0 then 'income' else 'expense' end,
       r.date, r.amount_cents, r.currency, r.description, r.merchant, r.provider_category,
       r.installment_number, r.installment_total
from jsonb_to_recordset($1::jsonb) as r(
  account_id uuid, provider_tx_id text, ext_key text, status text, date date, amount_cents bigint,
  currency text, description text, merchant text, provider_category text,
  installment_number int, installment_total int)
on conflict (account_id, ext_key) do update set
  provider_tx_id     = excluded.provider_tx_id,
  status             = excluded.status,
  date               = excluded.date,
  amount_cents       = excluded.amount_cents,
  description        = excluded.description,
  merchant           = coalesce(excluded.merchant, transaction.merchant),
  provider_category  = excluded.provider_category,
  installment_number = excluded.installment_number,
  installment_total  = excluded.installment_total,
  deleted_at         = null,
  -- se o valor mudou de sinal, a categoria automática deixa de valer
  category_id    = case when transaction.categorized_by in ('rule','history')
                         and sign(transaction.amount_cents) <> sign(excluded.amount_cents)
                        then null else transaction.category_id end,
  categorized_by = case when transaction.categorized_by in ('rule','history')
                         and sign(transaction.amount_cents) <> sign(excluded.amount_cents)
                        then 'none' else transaction.categorized_by end
where (transaction.provider_tx_id, transaction.status, transaction.date, transaction.amount_cents,
       transaction.description, transaction.deleted_at is null)
      is distinct from
      (excluded.provider_tx_id, excluded.status, excluded.date, excluded.amount_cents,
       excluded.description, true)
returning id, (xmax = 0) as inserted;
