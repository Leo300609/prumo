// Aplica db/migrations/*.sql em ordem (cada uma uma vez) e depois o seed idempotente.
// Uso: DATABASE_URL=... node scripts/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('defina DATABASE_URL');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

try {
  await sql`create table if not exists schema_migration (version text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ version: string }[]>`select version from schema_migration`).map((r) => r.version));
  const files = (await readdir(path.join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const body = await readFile(path.join(root, 'migrations', file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migration (version) values (${version}) on conflict do nothing`;
    });
    console.log(`✔ migração ${version}`);
  }
  await sql.unsafe(await readFile(path.join(root, 'seed.sql'), 'utf8'));
  console.log('✔ seed aplicado');
} finally {
  await sql.end();
}
