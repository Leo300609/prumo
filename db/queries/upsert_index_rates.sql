-- $1: jsonb array [{index, date, value}] — value em fração (0,055131% ao dia → 0.00055131)
insert into index_rate (index, date, value)
select r.index, r.date, r.value
from jsonb_to_recordset($1::jsonb) as r(index text, date date, value numeric)
on conflict (index, date) do update set value = excluded.value
returning index, date;
