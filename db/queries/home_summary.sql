-- Tela inicial: uma ida ao banco devolve tudo o que aparece acima da dobra.
-- $1: date — primeiro dia do mês corrente (fuso de São Paulo, calculado no app)
select
  coalesce((select sum(balance_cents) from account
            where not archived and kind in ('checking','savings','cash','wallet')), 0)::bigint  as available_cents,
  coalesce((select sum(balance_cents) from account
            where not archived and kind = 'credit_card'), 0)::bigint                             as card_bills_cents,
  coalesce((select sum(balance_cents) from investment), 0)::bigint                               as invested_cents,
  coalesce((select sum(amount_cents) from transaction
            where deleted_at is null and kind = 'income'
              and date >= $1::date and date < ($1::date + interval '1 month')), 0)::bigint       as month_income_cents,
  coalesce((select sum(amount_cents) from transaction
            where deleted_at is null and kind = 'expense'
              and date >= $1::date and date < ($1::date + interval '1 month')), 0)::bigint       as month_expense_cents,
  (select count(*) from transaction
     where deleted_at is null and category_id is null
       and date >= $1::date - interval '60 days' and date <= current_date)::int                as to_review,
  (select count(*) from connection
     where status in ('needs_reauth','needs_action','error'))::int                              as connections_with_issue,
  (select min(consent_expires_at) from connection where status <> 'revoked')                    as next_consent_expiry,
  (select max(last_synced_at) from connection)                                                  as last_synced_at;
