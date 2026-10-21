-- Pega o próximo job pronto. SKIP LOCKED permite mais de um worker sem disputa.
-- Um job travado há mais de 10 min (worker morreu no meio) volta para a fila.
-- $1: identificador do worker
update job
set locked_at = now(), locked_by = $1, attempts = attempts + 1
where id = (
  select id from job
  where done_at is null
    and run_at <= now()
    and attempts < max_attempts
    and (locked_at is null or locked_at < now() - interval '10 minutes')
  order by run_at, id
  for update skip locked
  limit 1
)
returning id, kind, payload, attempts, max_attempts;
