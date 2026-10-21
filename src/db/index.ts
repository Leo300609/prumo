// Conexão com o Postgres (driver `postgres`, sem ORM). As queries de negócio ficam em
// db/queries/*.sql e são as mesmas que db/test/run.sh executa nos testes.
import path from 'node:path';
import postgres from 'postgres';
import { env } from '../lib/env.ts';

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __prumoSql?: Sql };

const QUERIES_DIR = path.join(process.cwd(), 'db', 'queries');

/** Conexão única por processo (sobrevive ao hot reload do `next dev`). */
export function db(): Sql {
  g.__prumoSql ??= postgres(env().DATABASE_URL, {
    max: 5,                 // uso pessoal: poucas conexões bastam
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,         // o pooler do Neon (pgbouncer, modo transação) não garante prepared statements
    onnotice: () => {},
    types: {
      // bigint (centavos) e numeric (taxas) chegam como number em vez de string
      bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
  return g.__prumoSql;
}

/** Executa db/queries/<name>.sql com parâmetros posicionais ($1, $2...). */
export async function q<T = Record<string, unknown>>(name: string, params: unknown[] = []): Promise<T[]> {
  const rows = await db().file(path.join(QUERIES_DIR, `${name}.sql`), params as never[]);
  return rows as unknown as T[];
}

/** Atalho para passar arrays/objetos para parâmetros ::jsonb. */
export const json = (value: unknown) => JSON.stringify(value);
