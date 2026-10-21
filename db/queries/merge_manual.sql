-- Junta um lançamento manual ao lançamento do banco equivalente:
-- o do banco fica (é a fonte da verdade); categoria e nota do manual são herdadas se o banco não tiver.
-- $1: manual_id   $2: bank_id
with m as (
  update transaction set deleted_at = now()
  where id = $1::uuid and source = 'manual' and deleted_at is null
  returning category_id, note
)
update transaction b
set category_id    = coalesce(case when b.categorized_by = 'user' then b.category_id end, m.category_id, b.category_id),
    categorized_by = case when m.category_id is not null and b.categorized_by <> 'user' then 'user' else b.categorized_by end,
    note           = coalesce(b.note, m.note),
    reviewed       = true
from m
where b.id = $2::uuid
returning b.id;
