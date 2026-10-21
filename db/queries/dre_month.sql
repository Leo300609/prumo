-- DRE mensal. Valores com sinal: receitas positivas, despesas negativas.
-- Transferências e investimentos (kind transfer/investment) ficam fora do resultado.
-- $1: date início (inclusive)   $2: date fim (exclusivo)
with tx as (
  select date_trunc('month', t.date)::date as month,
         coalesce(c.dre_group, 'uncategorized') as grp,
         t.amount_cents as v
  from transaction t
  left join category c on c.id = t.category_id
  where t.deleted_at is null
    and t.kind in ('income', 'expense')
    and t.date >= $1::date and t.date < $2::date
)
select month,
  coalesce(sum(v) filter (where grp = 'revenue'), 0)::bigint                                   as receita_bruta,
  coalesce(sum(v) filter (where grp = 'deduction'), 0)::bigint                                 as deducoes,
  coalesce(sum(v) filter (where grp in ('revenue','deduction')), 0)::bigint                    as receita_liquida,
  coalesce(sum(v) filter (where grp = 'fixed_cost'), 0)::bigint                                as custos_fixos,
  coalesce(sum(v) filter (where grp = 'variable_cost'), 0)::bigint                             as custos_variaveis,
  coalesce(sum(v) filter (where grp = 'uncategorized'), 0)::bigint                             as nao_classificado,
  coalesce(sum(v) filter (where grp in ('revenue','deduction','fixed_cost','variable_cost','uncategorized')), 0)::bigint
                                                                                               as resultado_operacional,
  coalesce(sum(v) filter (where grp in ('financial_income','financial_expense')), 0)::bigint   as resultado_financeiro,
  coalesce(sum(v) filter (where grp <> 'non_operating'), 0)::bigint                            as lucro_liquido,
  round(sum(v) filter (where grp <> 'non_operating')::numeric
        / nullif(sum(v) filter (where grp in ('revenue','deduction')), 0), 4)                   as margem_liquida
from tx
group by month
order by month;
