-- $1 id  $2 erro (null = sucesso)
-- Falha: backoff exponencial (1, 2, 4, 8, 16, 32 min) até max_attempts; depois o job fica
-- registrado com last_error e done_at nulo, visível na tela de status.
update job
set done_at    = case when $2::text is null then now() end,
    last_error = $2::text,
    locked_at  = null,
    locked_by  = null,
    run_at     = case when $2::text is null then run_at
                      else now() + make_interval(mins => least(power(2, attempts - 1)::int, 60)) end
where id = $1::bigint
returning id, done_at is not null as done;
