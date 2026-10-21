#!/usr/bin/env bash
# Roda o schema, o seed e o cenário de testes num banco descartável.
# Uso: DATABASE_URL=postgres://user:pass@localhost:5432/postgres ./db/test/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

ADMIN_URL="${DATABASE_URL:?defina DATABASE_URL apontando para um Postgres onde você possa criar bancos}"
TEST_DB="prumo_test_$$"
psql "$ADMIN_URL" -qAt -c "create database $TEST_DB" >/dev/null
trap 'psql "$ADMIN_URL" -qAt -c "drop database if exists $TEST_DB with (force)" >/dev/null' EXIT
TEST_URL="${ADMIN_URL%/*}/$TEST_DB"

{
  echo '\set ON_ERROR_STOP on'
  # simula scripts/migrate.ts: tabela de controle criada antes da migração
  echo 'create table if not exists schema_migration (version text primary key, applied_at timestamptz not null default now());'
  cat db/migrations/*.sql
  cat db/seed.sql
  cat db/seed.sql   # o seed roda a cada deploy: precisa ser idempotente
  # cada arquivo de db/queries vira um prepared statement q_<nome>, exatamente como o app usa
  for f in db/queries/*.sql; do
    name="$(basename "$f" .sql)"
    printf 'PREPARE q_%s AS\n' "$name"
    sed -e '$a\' "$f"
  done
  cat db/test/scenario.sql
} | psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -X

echo "✔ testes do banco passaram"
