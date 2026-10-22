-- Condições do investimento (o que distingue dois CDBs do mesmo emissor): taxa, aplicação e vencimento.
alter table investment add column if not exists rate_type  text;     -- CDI, PRE, IPCA…
alter table investment add column if not exists rate       numeric;  -- 103 = 103% do CDI
alter table investment add column if not exists fixed_rate numeric;  -- taxa prefixada a.a., quando houver
alter table investment add column if not exists issue_date date;
alter table investment add column if not exists due_date   date;
