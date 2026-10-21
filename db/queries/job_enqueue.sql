-- $1 kind  $2 payload jsonb  $3 run_at timestamptz  $4 dedupe_key (ou null)
-- Com dedupe_key, um job igual ainda pendente absorve o novo (ex.: 5 webhooks do mesmo item = 1 sync).
insert into job (kind, payload, run_at, dedupe_key)
values ($1, $2::jsonb, coalesce($3::timestamptz, now()), $4)
on conflict (dedupe_key) where done_at is null do nothing
returning id;
