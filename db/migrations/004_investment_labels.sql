-- Identificação dos investimentos: instituição vinda da Pluggy e apelido/grupo escolhidos por você
-- (ex.: grupo "Nubank", apelido "Reserva de emergência"). Nunca sobrescritos pela sincronização.
alter table investment add column if not exists institution text;
alter table investment add column if not exists nickname    text;
alter table investment add column if not exists group_label text;
