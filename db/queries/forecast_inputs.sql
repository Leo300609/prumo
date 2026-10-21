-- Entradas da projeção de caixa (o cálculo em si fica em src/domain/forecast.ts).
-- $1: date — primeiro dia do mês corrente
-- Devolve: saldo disponível hoje, futuros já conhecidos por mês (parcelas e agendamentos que a
-- Pluggy devolve como PENDING com data futura) e o resultado variável dos últimos 12 meses fechados
-- (receitas e despesas sem transferências).
select
  (select coalesce(sum(balance_cents), 0) from account
     where not archived and kind in ('checking','savings','cash','wallet'))::bigint as available_cents,
  (select coalesce(json_agg(json_build_object('month', m, 'cents', c) order by m), '[]')
     from (select date_trunc('month', date)::date as m, sum(amount_cents)::bigint as c
           from transaction
           where deleted_at is null and status = 'pending' and date >= current_date
             and kind in ('income','expense')
           group by 1) x)                                                        as known_future,
  (select coalesce(json_agg(json_build_object('month', m, 'cents', c) order by m), '[]')
     from (select date_trunc('month', date)::date as m, sum(amount_cents)::bigint as c
           from transaction
           where deleted_at is null and status = 'posted' and kind in ('income','expense')
             and date >= $1::date - interval '12 months' and date < $1::date
           group by 1) y)                                                        as history;
