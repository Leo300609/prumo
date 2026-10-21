-- $1: jsonb array com ids da Pluggy (webhook transactions/deleted), ex.: '["id1","id2"]'
-- Exclusão lógica: a Pluggy avisa que um lançamento sumido pode reaparecer
-- numa sincronização seguinte; se reaparecer, o upsert limpa deleted_at.
update transaction
set deleted_at = now()
where provider_tx_id in (select jsonb_array_elements_text($1::jsonb))
  and deleted_at is null
returning id;
