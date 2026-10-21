-- Prumo — schema inicial (PostgreSQL 16+)
-- Uso pessoal: um único usuário, sem workspaces. Valores monetários em centavos (bigint),
-- com sinal: positivo = dinheiro entrando na conta, negativo = saindo. Vale para todas as contas,
-- inclusive cartão de crédito (compra = negativo, pagamento da fatura = positivo).

create extension if not exists pg_trgm;
create extension if not exists pgcrypto; -- gen_random_uuid() já é nativo no PG13+, pgcrypto fica para digest()

-- ───────────────────────── utilitários ─────────────────────────

-- Normaliza descrições de extrato para comparação e regras:
-- remove acentos, prefixos de meio de pagamento, datas, números longos e pontuação.
create or replace function normalize_desc(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          upper(translate(coalesce(t, ''),
            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
          '\m(PIX|TED|DOC)\s+(ENVIADO|RECEBIDO|ENV|REC|TRANSF)\M', ' ', 'g'),
        '\m(COMPRA|PAGTO|PAG|DEB|CRED)(\s+(CARTAO|DEBITO|CREDITO|DEB|CRED|ELO|VISA|MASTER|MASTERCARD|NACIONAL|INTERNACIONAL))+\M', ' ', 'g'),
      '\m\d{2}/\d{2}(/\d{2,4})?\M|\m\d{4,}\M|[^A-Z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────── autenticação ─────────────────────────

create table app_user (
  id               int primary key default 1 check (id = 1), -- só existe um usuário
  email            text not null unique,
  password_hash    text not null,          -- scrypt$N$r$p$salt$hash (ver src/lib/password.ts)
  totp_secret_enc  bytea,                  -- segredo TOTP cifrado com AES-256-GCM
  totp_enabled     boolean not null default false,
  created_at       timestamptz not null default now()
);

create table session (
  id           uuid primary key default gen_random_uuid(),
  token_hash   bytea not null unique,       -- sha256 do token do cookie; o token em si nunca é gravado
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index session_expires on session (expires_at);

create table login_attempt (
  id     bigserial primary key,
  ip     text not null,
  ok     boolean not null,
  at     timestamptz not null default now()
);
create index login_attempt_ip_at on login_attempt (ip, at desc);

-- ───────────────────────── conexões e contas ─────────────────────────

create table connection (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null check (provider in ('pluggy')),
  item_id            text not null unique,            -- itemId da Pluggy
  connector_name     text,
  status             text not null default 'syncing'
                     check (status in ('syncing','active','needs_reauth','needs_action','error','revoked')),
  error_code         text,
  consent_expires_at timestamptz,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger connection_touch before update on connection for each row execute function touch_updated_at();

create table account (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid references connection(id) on delete set null, -- null = conta manual
  provider_account_id   text unique,          -- id da conta na Pluggy (muda se o item for recriado)
  account_key           text unique,          -- identidade estável: sobrevive à reautorização
  kind                  text not null check (kind in ('checking','savings','credit_card','cash','wallet','investment')),
  name                  text not null,
  institution           text,
  owner_name            text,                 -- titular; usado para reconhecer Pix entre contas próprias
  currency              char(3) not null default 'BRL',
  balance_cents         bigint not null default 0,  -- cartão: saldo devedor da fatura aberta, positivo
  credit_limit_cents    bigint,
  available_limit_cents bigint,
  bill_close_date       date,
  bill_due_date         date,
  balance_at            timestamptz,
  hidden                boolean not null default false,
  archived              boolean not null default false,
  sort                  int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger account_touch before update on account for each row execute function touch_updated_at();

-- ───────────────────────── categorias e regras ─────────────────────────

create table category (
  id        serial primary key,
  parent_id int references category(id) on delete cascade,
  name      text not null,
  kind      text not null check (kind in ('income','expense','transfer','investment')),
  dre_group text not null check (dre_group in
              ('revenue','deduction','fixed_cost','variable_cost',
               'financial_income','financial_expense','non_operating')),
  icon      text,
  sort      int not null default 0,
  unique nulls not distinct (parent_id, name)
);

create table rule (
  id          serial primary key,
  priority    int not null default 100,           -- menor roda primeiro
  pattern     text not null,                      -- regex (case-insensitive) sobre description_norm
  direction   text check (direction in ('in','out')), -- null = qualquer sinal
  min_cents   bigint,                             -- faixa de valor absoluto (opcional)
  max_cents   bigint,
  account_id  uuid references account(id) on delete cascade,
  category_id int not null references category(id) on delete cascade,
  is_system   boolean not null default false,     -- dicionário embutido; regras do usuário vêm antes
  hits        int not null default 0,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── transações ─────────────────────────

create table transaction (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references account(id) on delete cascade,
  source             text not null check (source in ('pluggy','manual','ofx','csv')),
  provider_tx_id     text unique,       -- id da transação na Pluggy (pode mudar)
  ext_key            text,              -- providerId (estável entre items) ou o id da Pluggy
  status             text not null default 'posted' check (status in ('pending','posted')),
  kind               text not null check (kind in ('income','expense','transfer','investment','adjustment')),
  date               date not null,
  amount_cents       bigint not null check (amount_cents <> 0),
  currency           char(3) not null default 'BRL',
  description        text not null,
  description_norm   text generated always as (normalize_desc(description)) stored,
  merchant           text,
  provider_category  text,
  category_id        int references category(id) on delete set null,
  categorized_by     text not null default 'none' check (categorized_by in ('rule','history','user','none')),
  reviewed           boolean not null default false,   -- "conferido" na conciliação
  transfer_pair_id   uuid,
  installment_number int,
  installment_total  int,
  import_batch_id    uuid,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (account_id, ext_key)
);
create trigger transaction_touch before update on transaction for each row execute function touch_updated_at();
create index tx_live_date on transaction (date desc) where deleted_at is null;
create index tx_account_amount_date on transaction (account_id, amount_cents, date) where deleted_at is null;
create index tx_uncategorized on transaction (date desc) where category_id is null and deleted_at is null;
create index tx_desc_trgm on transaction using gin (description_norm gin_trgm_ops);

create table import_batch (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references account(id) on delete cascade,
  format      text not null check (format in ('ofx','csv')),
  sha256      text not null,
  rows_total  int not null,
  rows_new    int not null,
  created_at  timestamptz not null default now(),
  unique (account_id, sha256)          -- o mesmo arquivo não entra duas vezes
);

-- ───────────────────────── investimentos ─────────────────────────

create table investment (
  id                     uuid primary key default gen_random_uuid(),
  connection_id          uuid references connection(id) on delete set null,
  provider_investment_id text unique,
  name                   text not null,
  type                   text not null,      -- FIXED_INCOME, EQUITY, MUTUAL_FUND, SECURITY, ETF, COE, MANUAL
  subtype                text,
  code                   text,
  balance_cents          bigint not null,    -- valor líquido atual
  amount_original_cents  bigint,
  status                 text,
  updated_at             timestamptz not null default now()
);

create table investment_flow (               -- aportes (+) e resgates (−) da carteira
  provider_tx_id text primary key,
  investment_id  uuid not null references investment(id) on delete cascade,
  date           date not null,
  type           text not null,
  amount_cents   bigint not null
);
create index investment_flow_date on investment_flow (date);

create table investment_snapshot (           -- valor da carteira no fim de cada dia
  date               date primary key,
  market_value_cents bigint not null,
  net_flow_cents     bigint not null default 0
);

create table index_rate (                    -- CDI diário e IPCA mensal (SGS/BCB), em fração
  index text not null check (index in ('CDI','IPCA','SELIC')),
  date  date not null,
  value numeric(18,10) not null,
  primary key (index, date)
);

-- ───────────────────────── orçamento e metas ─────────────────────────

create table budget (
  month       date not null check (extract(day from month) = 1),
  category_id int not null references category(id) on delete cascade,
  limit_cents bigint not null check (limit_cents > 0),
  primary key (month, category_id)
);

create table goal (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  target_cents bigint not null check (target_cents > 0),
  target_date  date,
  account_ids  uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ───────────────────────── webhooks, fila e agendamentos ─────────────────────────

create table webhook_event (
  id           bigserial primary key,
  event_id     text not null unique,          -- idempotência: o mesmo evento pode chegar 2x
  event        text not null,
  item_id      text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

create table job (
  id           bigserial primary key,
  kind         text not null,
  payload      jsonb not null default '{}',
  dedupe_key   text,
  run_at       timestamptz not null default now(),
  attempts     int not null default 0,
  max_attempts int not null default 6,
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create unique index job_dedupe_pending on job (dedupe_key) where done_at is null;
create index job_ready on job (run_at) where done_at is null;

create table schedule (
  name        text primary key,
  last_run_at timestamptz not null default '1970-01-01'
);

create table sync_log (
  id            bigserial primary key,
  connection_id uuid references connection(id) on delete cascade,
  trigger       text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  result        text not null default 'running' check (result in ('running','success','skipped','failed')),
  tx_upserted   int not null default 0,
  error         text
);

create table if not exists schema_migration (
  version    text primary key,
  applied_at timestamptz not null default now()
);
insert into schema_migration (version) values ('001_init') on conflict do nothing;
