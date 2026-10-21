-- Auto-categorização em cascata para transações sem categoria.
-- 1) regras (do usuário primeiro, depois o dicionário de sistema), por prioridade
-- 2) histórico: a transação já classificada mais parecida (pg_trgm), mesmo sinal, similaridade >= 0,55
-- $1: date — só olha transações a partir desta data (limita o custo)
with candidates as (
  select t.id, t.account_id, t.amount_cents, t.description_norm
  from transaction t
  where t.category_id is null and t.categorized_by = 'none'
    and t.deleted_at is null and t.date >= $1::date
),
by_rule as (
  select distinct on (c.id) c.id as tx_id, r.id as rule_id, r.category_id
  from candidates c
  join rule r
    on c.description_norm ~* r.pattern
   and (r.direction is null
        or (r.direction = 'in'  and c.amount_cents > 0)
        or (r.direction = 'out' and c.amount_cents < 0))
   and (r.min_cents  is null or abs(c.amount_cents) >= r.min_cents)
   and (r.max_cents  is null or abs(c.amount_cents) <= r.max_cents)
   and (r.account_id is null or r.account_id = c.account_id)
  order by c.id, r.is_system, r.priority, r.id
),
by_history as (
  select distinct on (c.id) c.id as tx_id, h.category_id
  from candidates c
  join lateral (
    select t2.category_id, similarity(t2.description_norm, c.description_norm) as score
    from transaction t2
    where t2.categorized_by in ('user','rule')
      and t2.category_id is not null
      and t2.deleted_at is null
      and sign(t2.amount_cents) = sign(c.amount_cents)
      and t2.description_norm % c.description_norm
    order by score desc
    limit 1
  ) h on h.score >= 0.55
  where c.id not in (select tx_id from by_rule)
  order by c.id
),
decided as (
  select tx_id, category_id, 'rule' as how from by_rule
  union all
  select tx_id, category_id, 'history' from by_history
),
bump as (
  update rule set hits = hits + x.n
  from (select rule_id, count(*) as n from by_rule group by rule_id) x
  where rule.id = x.rule_id
)
update transaction t
set category_id    = d.category_id,
    categorized_by = d.how,
    kind = case
             when t.transfer_pair_id is not null then 'transfer'
             when cat.kind = 'transfer'   then 'transfer'
             when cat.kind = 'investment' then 'investment'
             when cat.kind = 'income'     then 'income'
             else 'expense'
           end
from decided d
join category cat on cat.id = d.category_id
where t.id = d.tx_id
returning t.id, d.how;
