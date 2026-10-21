-- Pareia transferências entre contas próprias: mesma quantia com sinal oposto,
-- em contas diferentes, com até 3 dias de diferença. Para evitar falsos positivos
-- (pagar R$ 100 a alguém e receber R$ 100 de outra pessoa no mesmo dia), exige que:
--   • a saída seja de conta e a entrada seja no cartão (pagamento de fatura), ou
--   • entre contas (sem cartão), uma das descrições traga o primeiro nome do titular
--     (Pix/TED para si mesmo) ou indique aplicação/resgate.
-- Lançamentos classificados à mão pelo usuário nunca são tocados.
-- $1: date — só olha transações a partir desta data
with own as (
  select a.id, a.kind,
         nullif(split_part(normalize_desc(coalesce(a.owner_name, '')), ' ', 1), '') as first_name
  from account a
),
outflow as (
  select t.id, t.account_id, t.amount_cents, t.date, t.description_norm, own.kind, own.first_name
  from transaction t join own on own.id = t.account_id
  where t.amount_cents < 0 and t.transfer_pair_id is null and t.deleted_at is null
    and t.date >= $1::date and t.categorized_by <> 'user'
),
inflow as (
  select t.id, t.account_id, t.amount_cents, t.date, t.description_norm, own.kind, own.first_name
  from transaction t join own on own.id = t.account_id
  where t.amount_cents > 0 and t.transfer_pair_id is null and t.deleted_at is null
    and t.date >= $1::date - 3 and t.categorized_by <> 'user'
),
candidates as (
  select o.id as out_id, i.id as in_id, abs(o.date - i.date) as gap,
         (i.kind = 'credit_card' and o.kind <> 'credit_card') as is_bill
  from outflow o
  join inflow i
    on i.amount_cents = -o.amount_cents
   and i.account_id <> o.account_id
   and abs(o.date - i.date) <= 3
  where (i.kind = 'credit_card' and o.kind <> 'credit_card')   -- conta paga a fatura do cartão
     or (o.kind <> 'credit_card' and i.kind <> 'credit_card' and (
            (o.first_name is not null and o.description_norm like '%' || o.first_name || '%')
         or (i.first_name is not null and i.description_norm like '%' || i.first_name || '%')
         or o.description_norm ~ '\m(APLICACAO|APLIC|RESGATE|RESG)\M'
         or i.description_norm ~ '\m(APLICACAO|APLIC|RESGATE|RESG)\M'))
),
best_out as (                     -- cada saída fica com a entrada mais próxima
  select distinct on (out_id) * from candidates order by out_id, gap, in_id
),
pairs as (                        -- e cada entrada só pode ser usada uma vez
  select distinct on (in_id) * from best_out order by in_id, gap, out_id
),
cats as (
  select
    (select id from category where name = 'Pagamento de fatura') as bill,
    (select id from category where name = 'Entre minhas contas') as own_transfer
)
update transaction t
set transfer_pair_id = case when t.id = p.out_id then p.in_id else p.out_id end,
    kind = 'transfer',
    category_id = case when p.is_bill then cats.bill else cats.own_transfer end,
    categorized_by = 'rule'
from pairs p, cats
where t.id in (p.out_id, p.in_id)
returning t.id, t.transfer_pair_id;
