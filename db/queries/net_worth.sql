-- Balanço patrimonial agora.
-- Cartão: balance_cents é o saldo devedor (positivo = deve). Saldo negativo de conta corrente
-- (cheque especial) entra como passivo.
with caixa as (
  select coalesce(sum(greatest(balance_cents, 0)), 0) as v from account
  where not archived and kind in ('checking','savings','cash','wallet')
), cheque_especial as (
  select coalesce(sum(-least(balance_cents, 0)), 0) as v from account
  where not archived and kind in ('checking','savings')
), investimentos as (
  select coalesce(sum(balance_cents), 0) as v from investment
  where coalesce(status, 'ATIVO') <> 'RETIRADA_TOTAL'
), cartoes as (
  select coalesce(sum(greatest(balance_cents, 0)), 0) as v from account
  where not archived and kind = 'credit_card'
)
select caixa.v::bigint                                   as caixa_cents,
       investimentos.v::bigint                           as investimentos_cents,
       (caixa.v + investimentos.v)::bigint               as ativo_cents,
       (cartoes.v + cheque_especial.v)::bigint           as passivo_cents,
       (caixa.v + investimentos.v - cartoes.v - cheque_especial.v)::bigint as patrimonio_liquido_cents
from caixa, cheque_especial, investimentos, cartoes;
