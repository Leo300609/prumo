-- TWR da carteira entre $1 e $2, encadeando retornos diários:
--   r_t = (V_t − F_t) / V_{t−1} − 1   onde F_t = aportes − resgates do dia
-- e CDI acumulado no mesmo período para mostrar "% do CDI".
with s as (
  select date, market_value_cents::numeric as v, net_flow_cents::numeric as f,
         lag(market_value_cents::numeric) over (order by date) as v_prev
  from investment_snapshot
  where date between $1::date and $2::date
), r as (
  select date, (v - f) / v_prev as growth
  from s
  where v_prev > 0 and v - f > 0
), twr as (
  select exp(sum(ln(growth))) - 1 as twr,
         max(date) - min(date) + 1 as days
  from r
), cdi as (
  select exp(sum(ln(1 + value))) - 1 as cdi
  from index_rate
  where index = 'CDI' and date between $1::date and $2::date
)
select round(twr.twr, 6)                                                as twr,
       round(power(1 + twr.twr, 365.0 / nullif(twr.days, 0)) - 1, 6)    as twr_aa,
       twr.days,
       round(cdi.cdi, 6)                                                as cdi,
       round(twr.twr / nullif(cdi.cdi, 0), 4)                           as pct_cdi
from twr, cdi;
