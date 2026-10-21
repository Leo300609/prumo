-- Grava o valor da carteira no dia $1 e o fluxo externo daquele dia (base do TWR).
insert into investment_snapshot (date, market_value_cents, net_flow_cents)
select $1::date,
       coalesce((select sum(balance_cents) from investment
                 where coalesce(status, 'ATIVO') <> 'RETIRADA_TOTAL'), 0),
       coalesce((select sum(amount_cents) from investment_flow where date = $1::date), 0)
on conflict (date) do update set
  market_value_cents = excluded.market_value_cents,
  net_flow_cents     = excluded.net_flow_cents
returning date, market_value_cents, net_flow_cents;
