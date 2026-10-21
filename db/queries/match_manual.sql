-- Conciliação simples: lançamento que você digitou à mão e que depois chegou pelo banco.
-- Sugere pares (manual ↔ banco) com o mesmo valor, na mesma conta, com até 3 dias de diferença.
select m.id as manual_id, b.id as bank_id, m.description as manual_description,
       b.description as bank_description, b.date, b.amount_cents, a.name as account_name
from transaction m
join transaction b
  on b.account_id = m.account_id
 and b.amount_cents = m.amount_cents
 and abs(b.date - m.date) <= 3
 and b.source = 'pluggy' and b.deleted_at is null
join account a on a.id = m.account_id
where m.source = 'manual' and m.deleted_at is null
  and m.date >= current_date - 45
order by b.date desc
limit 20;
