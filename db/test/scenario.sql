-- Cenário de ponta a ponta do banco. Qualquer asserção falha aborta com erro.
create function pg_temp.assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FALHOU: %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- ── seed idempotente (run.sh aplica o seed duas vezes) ──
select pg_temp.assert('seed duas vezes não duplica categorias',
  (select count(*) from category) = 38 and (select count(*) from category where name = 'Delivery') = 1);
select pg_temp.assert('seed duas vezes não duplica regras', (select count(*) from rule where is_system) = 15);

-- ── normalize_desc ──
select pg_temp.assert('normaliza acentos, prefixos e números',
  normalize_desc('PIX ENVIADO  Padaria São João 12/05 *1234567') = 'PADARIA SAO JOAO');
select pg_temp.assert('normaliza compra no cartão',
  normalize_desc('COMPRA CARTAO DEB IFOOD*Restaurante') = 'IFOOD RESTAURANTE');

-- ── conexão e contas ──
insert into connection (id, provider, item_id, connector_name, status)
values ('11111111-1111-1111-1111-111111111111', 'pluggy', 'item-A', 'MeuPluggy', 'active');

execute q_upsert_accounts('[
  {"provider_account_id":"acc-chk","account_key":"checking_account:12345-6:conta corrente","kind":"checking",
   "name":"Conta Corrente","institution":"Nubank","owner_name":"Leonardo Almeida Canto","currency":"BRL","balance_cents":350000},
  {"provider_account_id":"acc-sav","account_key":"savings_account:99-1:poupanca","kind":"savings",
   "name":"Poupança","institution":"Inter","owner_name":"Leonardo Almeida Canto","currency":"BRL","balance_cents":100000},
  {"provider_account_id":"acc-card","account_key":"credit_card:4321:nubank mastercard","kind":"credit_card",
   "name":"Nubank Mastercard","institution":"Nubank","currency":"BRL","balance_cents":120000,
   "credit_limit_cents":500000,"available_limit_cents":380000,"bill_due_date":"2026-11-10"}
]', '11111111-1111-1111-1111-111111111111');

select pg_temp.assert('3 contas criadas', (select count(*) from account) = 3);

select (select id from account where provider_account_id = 'acc-chk')  as chk,
       (select id from account where provider_account_id = 'acc-sav')  as sav,
       (select id from account where provider_account_id = 'acc-card') as card
\gset

-- ── lote 1 (sinal local: + entra, − sai) ──
select jsonb_build_array(
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p1','ext_key','of-1','status','posted',
    'date','2026-10-05','amount_cents', 500000,'currency','BRL','description','SALARIO ACME LTDA'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p2','ext_key','of-2','status','posted',
    'date','2026-10-06','amount_cents', -4590,'currency','BRL','description','COMPRA CARTAO DEB IFOOD*Restaurante'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p3','ext_key','of-3','status','posted',
    'date','2026-10-07','amount_cents', -2300,'currency','BRL','description','UBER *TRIP'),
  jsonb_build_object('account_id', :'card', 'provider_tx_id','p4','ext_key','of-4','status','posted',
    'date','2026-10-08','amount_cents', -12000,'currency','BRL','description','CARREFOUR HIPER 123'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p5','ext_key','of-5','status','posted',
    'date','2026-10-10','amount_cents', -50000,'currency','BRL','description','PAGAMENTO DE FATURA'),
  jsonb_build_object('account_id', :'card', 'provider_tx_id','p6','ext_key','of-6','status','posted',
    'date','2026-10-10','amount_cents', 50000,'currency','BRL','description','Pagamento recebido'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p7','ext_key','of-7','status','posted',
    'date','2026-10-11','amount_cents', -20000,'currency','BRL','description','PIX ENVIADO LEONARDO A CANTO'),
  jsonb_build_object('account_id', :'sav', 'provider_tx_id','p8','ext_key','of-8','status','posted',
    'date','2026-10-11','amount_cents', 20000,'currency','BRL','description','PIX RECEBIDO LEONARDO A CANTO'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p9','ext_key','of-9','status','posted',
    'date','2026-10-12','amount_cents', -10000,'currency','BRL','description','PIX ENVIADO JOAO SILVA'),
  jsonb_build_object('account_id', :'sav', 'provider_tx_id','p10','ext_key','of-10','status','posted',
    'date','2026-10-12','amount_cents', 10000,'currency','BRL','description','PIX RECEBIDO MARIA SOUZA'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p11','ext_key','of-11','status','posted',
    'date','2026-10-13','amount_cents', -1850,'currency','BRL','description','PADARIA DO ZE'),
  jsonb_build_object('account_id', :'card', 'provider_tx_id','p12','ext_key','of-12','status','pending',
    'date','2026-11-08','amount_cents', -15000,'currency','BRL','description','LOJA X PARC 2/3',
    'installment_number',2,'installment_total',3),
  jsonb_build_object('account_id', :'card', 'provider_tx_id','p13','ext_key','of-13','status','posted',
    'date','2026-10-14','amount_cents', -3000,'currency','BRL','description','LIVRARIA CULTURA'),
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p14','ext_key','of-14','status','posted',
    'date','2026-10-14','amount_cents', 3000,'currency','BRL','description','REEMBOLSO ALUGUEL CARRO')
)::text as batch1 \gset

execute q_upsert_transactions(:'batch1');
select pg_temp.assert('14 transações inseridas', (select count(*) from transaction) = 14);

-- upsert idempotente: o mesmo lote de novo não cria nem altera nada
execute q_upsert_transactions(:'batch1');
select pg_temp.assert('reenviar o mesmo lote não duplica', (select count(*) from transaction) = 14);

-- ── categorização ──
execute q_categorize('2026-09-01');
select pg_temp.assert('IFOOD → Delivery',
  (select c.name from transaction t join category c on c.id = t.category_id where t.provider_tx_id = 'p2') = 'Delivery');
select pg_temp.assert('UBER → App de transporte',
  (select c.name from transaction t join category c on c.id = t.category_id where t.provider_tx_id = 'p3') = 'App de transporte');
select pg_temp.assert('CARREFOUR → Mercado',
  (select c.name from transaction t join category c on c.id = t.category_id where t.provider_tx_id = 'p4') = 'Mercado');
select pg_temp.assert('SALARIO → Salário (kind income)',
  (select c.name || '/' || t.kind from transaction t join category c on c.id = t.category_id where t.provider_tx_id = 'p1') = 'Salário/income');
select pg_temp.assert('PAGAMENTO DE FATURA vira transferência',
  (select t.kind from transaction t where t.provider_tx_id = 'p5') = 'transfer');
select pg_temp.assert('regra de sistema conta acertos',
  (select hits from rule r join category c on c.id = r.category_id where c.name = 'Delivery') = 1);

-- ── transferências ──
execute q_pair_transfers('2026-09-01');
select pg_temp.assert('fatura: conta ↔ cartão pareados',
  (select transfer_pair_id from transaction where provider_tx_id = 'p5') =
  (select id from transaction where provider_tx_id = 'p6'));
select pg_temp.assert('Pix para mim mesmo pareado',
  (select transfer_pair_id from transaction where provider_tx_id = 'p7') =
  (select id from transaction where provider_tx_id = 'p8'));
select pg_temp.assert('Pix para João e de Maria NÃO são pareados',
  (select count(*) from transaction where provider_tx_id in ('p9','p10') and transfer_pair_id is not null) = 0);
select pg_temp.assert('compra no cartão + reembolso na conta NÃO são pareados',
  (select count(*) from transaction where provider_tx_id in ('p13','p14') and transfer_pair_id is not null) = 0);

-- ── histórico: o usuário classifica uma vez, a próxima parecida vem sozinha ──
update transaction set category_id = (select id from category where name = 'Restaurantes'),
                       categorized_by = 'user', kind = 'expense'
where provider_tx_id = 'p11';

select jsonb_build_array(
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','p15','ext_key','of-15','status','posted',
    'date','2026-10-15','amount_cents', -2200,'currency','BRL','description','PADARIA DO ZE LTDA')
)::text as batch2 \gset
execute q_upsert_transactions(:'batch2');
execute q_categorize('2026-09-01');
select pg_temp.assert('histórico: PADARIA DO ZE LTDA → Restaurantes',
  (select c.name || '/' || t.categorized_by from transaction t join category c on c.id = t.category_id
   where t.provider_tx_id = 'p15') = 'Restaurantes/history');

-- ── reautorização: item novo, ids novos, mesmo providerId → nada duplica ──
insert into connection (id, provider, item_id, connector_name, status)
values ('22222222-2222-2222-2222-222222222222', 'pluggy', 'item-B', 'MeuPluggy', 'active');
execute q_upsert_accounts('[
  {"provider_account_id":"acc-chk-NEW","account_key":"checking_account:12345-6:conta corrente","kind":"checking",
   "name":"Conta Corrente","institution":"Nubank","currency":"BRL","balance_cents":349000}
]', '22222222-2222-2222-2222-222222222222');
select pg_temp.assert('conta reaproveitada após reautorizar',
  (select count(*) from account) = 3
  and (select connection_id from account where id = :'chk') = '22222222-2222-2222-2222-222222222222'
  and (select owner_name from account where id = :'chk') = 'Leonardo Almeida Canto');

select jsonb_build_array(
  jsonb_build_object('account_id', :'chk', 'provider_tx_id','NEW-p2','ext_key','of-2','status','posted',
    'date','2026-10-06','amount_cents', -4590,'currency','BRL','description','COMPRA CARTAO DEB IFOOD*Restaurante')
)::text as batch3 \gset
execute q_upsert_transactions(:'batch3');
select pg_temp.assert('mesma transação com id novo não duplica e mantém categoria',
  (select count(*) from transaction where ext_key = 'of-2') = 1
  and (select provider_tx_id from transaction where ext_key = 'of-2') = 'NEW-p2'
  and (select c.name from transaction t join category c on c.id = t.category_id where t.ext_key = 'of-2') = 'Delivery');

-- ── exclusão lógica e reaparecimento ──
execute q_delete_transactions('["p3"]');
select pg_temp.assert('transactions/deleted marca deleted_at',
  (select deleted_at is not null from transaction where provider_tx_id = 'p3'));
execute q_upsert_transactions(:'batch1');
select pg_temp.assert('transação que reaparece é restaurada',
  (select deleted_at is null from transaction where provider_tx_id = 'p3'));

-- ── DRE de outubro ──
-- receitas: salário 5.000,00 | variáveis: 45,90 + 23,00 + 120,00 + 18,50 + 22,00 = 229,40
-- não classificado: +30 +100 −100 −30 = 0 | transferências e a parcela de novembro ficam fora
execute q_dre_month('2026-10-01', '2026-11-01') \gset dre_
select pg_temp.assert('DRE receita bruta',     :dre_receita_bruta = 500000);
select pg_temp.assert('DRE custos variáveis',  :dre_custos_variaveis = -22940);
select pg_temp.assert('DRE não classificado',  :dre_nao_classificado = 0);
select pg_temp.assert('DRE lucro líquido',     :dre_lucro_liquido = 477060);
select pg_temp.assert('DRE margem líquida',    :dre_margem_liquida = 0.9541);

-- ── tela inicial e balanço ──
execute q_home_summary('2026-10-01') \gset home_
select pg_temp.assert('disponível = corrente + poupança', :home_available_cents = 449000);
select pg_temp.assert('fatura aberta do cartão',         :home_card_bills_cents = 120000);
select pg_temp.assert('receitas do mês sem transferências', :home_month_income_cents = 513000);
select pg_temp.assert('a classificar = 4',               :home_to_review = 4);

execute q_net_worth \gset nw_
select pg_temp.assert('patrimônio líquido = 449.000 − 120.000', :nw_patrimonio_liquido_cents = 329000);

-- ── lista com busca e cursor ──
execute q_list_transactions('all', 'padaria', null, null, 1) \gset lst_
select pg_temp.assert('busca por "padaria" acha a mais recente primeiro', :'lst_description' = 'PADARIA DO ZE LTDA');

-- ── conciliação manual ↔ banco ──
insert into transaction (account_id, source, kind, date, amount_cents, description, category_id, categorized_by, note)
values (:'chk', 'manual', 'expense', '2026-10-14', -1850, 'pão e café',
        (select id from category where name = 'Restaurantes'), 'user', 'café com Ana');
execute q_match_manual \gset mm_
select pg_temp.assert('sugere juntar manual com o do banco',
  :'mm_bank_id' = (select id::text from transaction where provider_tx_id = 'p11'));
execute q_merge_manual(:'mm_manual_id', :'mm_bank_id');
select pg_temp.assert('manual removido e nota herdada',
  (select deleted_at is not null from transaction where id = :'mm_manual_id')
  and (select note from transaction where id = :'mm_bank_id') = 'café com Ana');

-- ── fila de jobs ──
execute q_job_enqueue('sync_item', '{"itemId":"item-A"}', null, 'sync:item-A');
execute q_job_enqueue('sync_item', '{"itemId":"item-A"}', null, 'sync:item-A');
select pg_temp.assert('dedupe: dois webhooks do mesmo item = 1 job', (select count(*) from job) = 1);
execute q_job_claim('w1') \gset job_
select pg_temp.assert('job reivindicado', :'job_kind' = 'sync_item' and :job_attempts = 1);
execute q_job_finish(:job_id, 'timeout na Pluggy');
select pg_temp.assert('falha reagenda com backoff',
  (select run_at > now() and done_at is null and locked_at is null from job where id = :job_id));
select pg_temp.assert('nada pronto para rodar agora', not exists (
  select 1 from job where done_at is null and run_at <= now()));
update job set run_at = now() where id = :job_id;
execute q_job_claim('w1') \gset job2_
execute q_job_finish(:job2_id, null);
select pg_temp.assert('sucesso marca done_at', (select done_at is not null from job where id = :job_id));
execute q_job_enqueue('sync_item', '{"itemId":"item-A"}', null, 'sync:item-A');
select pg_temp.assert('após concluir, mesma chave pode entrar de novo', (select count(*) from job) = 2);

-- ── agendamento sem execução dupla ──
execute q_schedule_claim('daily_sync', '2026-10-21 10:30:00+00');
execute q_schedule_claim('daily_sync', '2026-10-21 10:30:00+00');
select pg_temp.assert('agendamento registrado uma vez',
  (select last_run_at from schedule where name = 'daily_sync') = '2026-10-21 10:30:00+00');

-- ── TWR ──
-- dia 1: 1.000,00 | dia 2: 1.010,00 (+1%) | dia 3: aporte de 500,00 e valor 1.520,00 → (1520−500)/1010 − 1 = 0,99%
insert into investment_snapshot (date, market_value_cents, net_flow_cents) values
  ('2026-10-01', 100000, 0), ('2026-10-02', 101000, 0), ('2026-10-03', 152000, 50000);
insert into index_rate (index, date, value) values
  ('CDI','2026-10-01',0.0005), ('CDI','2026-10-02',0.0005), ('CDI','2026-10-03',0.0005);
execute q_portfolio_returns('2026-10-01', '2026-10-03') \gset pr_
select pg_temp.assert('TWR encadeado = 2,0%', :pr_twr = 0.020000);
select pg_temp.assert('CDI acumulado de 3 dias', :pr_cdi = 0.001501);

-- ── recorrências: aluguel em 3 dos últimos 4 meses ──
insert into transaction (account_id, source, kind, date, amount_cents, description)
select :'chk', 'manual', 'expense', d, -180000, 'ALUGUEL APTO 42'
from unnest(array['2026-07-05','2026-08-05','2026-09-05']::date[]) d;
execute q_recurring('2026-10-01') \gset rec_
select pg_temp.assert('aluguel detectado como recorrente',
  :'rec_description' = 'ALUGUEL APTO 42' and :rec_expected_cents = -180000 and :rec_typical_day = 5);

-- ── investimentos, índices e entradas da projeção ──
execute q_upsert_investments('[{"provider_investment_id":"inv-1","name":"CDB Banco X","type":"FIXED_INCOME",
  "subtype":"CDB","balance_cents":250000,"amount_original_cents":200000,"status":"ATIVO"}]',
  '11111111-1111-1111-1111-111111111111') \gset inv_
select jsonb_build_array(jsonb_build_object('provider_tx_id','it-1','investment_id', :'inv_id',
  'date','2026-10-21','type','BUY','amount_cents',50000))::text as flows \gset
execute q_upsert_investment_flows(:'flows');
execute q_snapshot_investments('2026-10-21') \gset snap_
select pg_temp.assert('snapshot do dia com aporte como fluxo externo',
  :snap_market_value_cents = 250000 and :snap_net_flow_cents = 50000);
execute q_upsert_index_rates('[{"index":"IPCA","date":"2026-09-01","value":0.0044}]');
select pg_temp.assert('IPCA gravado', (select value from index_rate where index = 'IPCA') = 0.0044);
execute q_forecast_inputs('2026-10-01') \gset fi_
select pg_temp.assert('entradas da projeção: disponível e histórico',
  :fi_available_cents = 449000 and jsonb_array_length(:'fi_history'::jsonb) = 3);
