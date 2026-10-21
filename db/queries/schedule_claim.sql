-- Marca um agendamento como executado para o horário $2, só se ainda não tiver rodado.
-- Atômico: dois workers no mesmo segundo não disparam a rotina duas vezes.
-- $1 nome   $2 horário previsto (timestamptz)
insert into schedule (name, last_run_at) values ($1, $2::timestamptz)
on conflict (name) do update set last_run_at = excluded.last_run_at
where schedule.last_run_at < excluded.last_run_at
returning name;
