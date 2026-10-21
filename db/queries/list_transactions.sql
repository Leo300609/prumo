-- Lista para a tela de lançamentos (paginação por cursor: data + id).
-- $1: filtro ('all' | 'review' | 'pending')   $2: busca (texto ou '')
-- $3: cursor_date (date ou null)              $4: cursor_id (uuid ou null)    $5: limite
select t.id, to_char(t.date, 'YYYY-MM-DD') as date, t.amount_cents, t.description, t.status, t.kind, t.reviewed,
       t.installment_number, t.installment_total, t.transfer_pair_id is not null as is_transfer,
       a.name as account_name, a.kind as account_kind,
       c.id as category_id, c.name as category_name, c.icon as category_icon,
       pc.name as parent_category_name
from transaction t
join account a on a.id = t.account_id
left join category c on c.id = t.category_id
left join category pc on pc.id = c.parent_id
where t.deleted_at is null
  and ($1 = 'all'
       or ($1 = 'review'  and t.category_id is null)
       or ($1 = 'pending' and t.status = 'pending'))
  and ($2 = '' or t.description_norm like '%' || normalize_desc($2) || '%')
  and ($3::date is null or (t.date, t.id) < ($3::date, $4::uuid))
order by t.date desc, t.id desc
limit $5::int;
