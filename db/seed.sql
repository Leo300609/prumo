-- Categorias padrão e dicionário de estabelecimentos (regras de sistema).
-- Idempotente: pode rodar mais de uma vez.

insert into category (name, kind, dre_group, icon, sort) values
  ('Receitas',        'income',     'revenue',        'arrow-down-left', 10),
  ('Moradia',         'expense',    'fixed_cost',     'home',            20),
  ('Alimentação',     'expense',    'variable_cost',  'utensils',        30),
  ('Transporte',      'expense',    'variable_cost',  'car',             40),
  ('Saúde',           'expense',    'fixed_cost',     'heart',           50),
  ('Educação',        'expense',    'fixed_cost',     'book',            60),
  ('Assinaturas',     'expense',    'fixed_cost',     'repeat',          70),
  ('Lazer',           'expense',    'variable_cost',  'smile',           80),
  ('Compras',         'expense',    'variable_cost',  'bag',             90),
  ('Impostos',        'expense',    'deduction',      'landmark',       100),
  ('Taxas e juros',   'expense',    'financial_expense','percent',      110),
  ('Transferências',  'transfer',   'non_operating',  'arrows',         120),
  ('Investimentos',   'investment', 'non_operating',  'trending-up',    130)
on conflict (parent_id, name) do nothing;

with p as (select id, name, kind, dre_group from category where parent_id is null)
insert into category (parent_id, name, kind, dre_group, sort)
select p.id, c.name, p.kind, coalesce(c.dre_group, p.dre_group), c.sort
from p join (values
  ('Receitas',       'Salário',            null::text,         1),
  ('Receitas',       'Freelance e vendas', null,               2),
  ('Receitas',       'Rendimentos',        'financial_income', 3),
  ('Receitas',       'Reembolsos',         null,               4),
  ('Receitas',       'Outras receitas',    null,               5),
  ('Moradia',        'Aluguel',            null,               1),
  ('Moradia',        'Condomínio',         null,               2),
  ('Moradia',        'Luz, água e gás',    null,               3),
  ('Moradia',        'Internet e celular', null,               4),
  ('Alimentação',    'Mercado',            null,               1),
  ('Alimentação',    'Restaurantes',       null,               2),
  ('Alimentação',    'Delivery',           null,               3),
  ('Transporte',     'Combustível',        null,               1),
  ('Transporte',     'App de transporte',  null,               2),
  ('Transporte',     'Transporte público', null,               3),
  ('Transporte',     'Estacionamento',     null,               4),
  ('Saúde',          'Farmácia',           'variable_cost',    1),
  ('Saúde',          'Plano de saúde',     null,               2),
  ('Saúde',          'Academia',           null,               3),
  ('Taxas e juros',  'Tarifas bancárias',  null,               1),
  ('Taxas e juros',  'Juros e IOF',        null,               2),
  ('Transferências', 'Entre minhas contas',null,               1),
  ('Transferências', 'Pagamento de fatura',null,               2),
  ('Investimentos',  'Aplicação',          null,               1),
  ('Investimentos',  'Resgate',            null,               2)
) as c(parent, name, dre_group, sort) on c.parent = p.name
on conflict (parent_id, name) do nothing;

-- Dicionário embutido. Regex sobre description_norm (já sem acentos, em maiúsculas).
-- Regras criadas pelo usuário (is_system = false) sempre são avaliadas antes destas.
with c as (select id, name from category)
insert into rule (priority, pattern, direction, category_id, is_system)
select r.priority, r.pattern, r.direction, c.id, true
from (values
  (10, '\m(PAGAMENTO|PAGTO|PAG) (DE )?FATURA\M|\mPAGAMENTO RECEBIDO\M', null,  'Pagamento de fatura'),
  (20, '\mIFOOD\M|\mRAPPI\M|\mZE DELIVERY\M',                       'out', 'Delivery'),
  (20, '\mUBER\M|\m99 ?(APP|POP|TAXI)\M|\mCABIFY\M',               'out', 'App de transporte'),
  (20, '\mNETFLIX\M|\mSPOTIFY\M|\mDISNEY\M|\mYOUTUBE ?PREMIUM\M|\mAMAZON ?PRIME\M|\mHBO ?MAX\M|\mGLOBOPLAY\M|\mDEEZER\M', 'out', 'Assinaturas'),
  (20, '\mPOSTO\M|\mSHELL\M|\mIPIRANGA\M|\mPETROBRAS\M|\mBR MANIA\M', 'out', 'Combustível'),
  (20, '\m(DROGA ?RAIA|DROGASIL|PAGUE MENOS|DROGARIA|FARMACIA)\M',  'out', 'Farmácia'),
  (20, '\m(CARREFOUR|ASSAI|ATACADAO|PAO DE ACUCAR|EXTRA|SUPERMERCADO|MERCADO|HORTIFRUTI)\M', 'out', 'Mercado'),
  (20, '\m(SMART ?FIT|BLUEFIT|BODYTECH|ACADEMIA)\M',                 'out', 'Academia'),
  (20, '\m(ESTACIONAMENTO|ESTAPAR|ZUL DIGITAL|SEM PARAR|CONECTCAR|VELOE)\M', 'out', 'Estacionamento'),
  (30, '\m(RENDIMENTO|REMUNERACAO|JUROS RECEBIDOS)\M',               'in',  'Rendimentos'),
  (30, '\m(SALARIO|FOLHA|PROVENTOS SALARIO)\M',                      'in',  'Salário'),
  (30, '\m(TARIFA|ANUIDADE|CESTA DE SERVICOS)\M',                    'out', 'Tarifas bancárias'),
  (30, '\m(IOF|JUROS|ENCARGOS|MULTA)\M',                             'out', 'Juros e IOF'),
  (40, '\m(APLICACAO|APLIC|COMPRA TESOURO|COMPRA CDB|INVEST)\M',     'out', 'Aplicação'),
  (40, '\m(RESGATE|RESG)\M',                                         'in',  'Resgate')
) as r(priority, pattern, direction, cat)
join c on c.name = r.cat
where not exists (select 1 from rule x where x.is_system and x.pattern = r.pattern);
