-- Detecta lançamentos recorrentes sem cadastro manual: mesma "assinatura" de descrição
-- (3 primeiras palavras normalizadas), mesmo sinal, presente em pelo menos 3 dos últimos 4 meses
-- fechados, com variação de valor de até 15% em torno da mediana.
-- $1: date — primeiro dia do mês corrente
with base as (
  select array_to_string((string_to_array(description_norm, ' '))[1:3], ' ') as sig,
         sign(amount_cents) as dir,
         date_trunc('month', date)::date as month,
         sum(amount_cents) as month_total,
         max(extract(day from date))::int as day
  from transaction
  where deleted_at is null and kind in ('income','expense')
    and date >= $1::date - interval '4 months' and date < $1::date
    and description_norm <> ''
  group by 1, 2, 3
), agg as (
  select sig, dir, count(*) as months,
         percentile_cont(0.5) within group (order by month_total) as median_cents,
         min(month_total) as min_cents, max(month_total) as max_cents,
         round(avg(day))::int as typical_day
  from base
  group by sig, dir
)
select sig as description, dir::int as direction, months::int,
       round(median_cents)::bigint as expected_cents, typical_day
from agg
where months >= 3
  and abs(max_cents - min_cents) <= abs(median_cents) * 0.15 * 2
order by abs(median_cents) desc;
