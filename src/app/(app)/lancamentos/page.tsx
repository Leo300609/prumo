import Link from 'next/link';
import { q } from '../../../db/index.ts';
import type { TxListRow } from '../../../db/read.ts';
import { TxList } from '../../../components/TxList.tsx';
import { localDate } from '../../../lib/time.ts';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'review', label: 'A classificar' },
  { key: 'pending', label: 'Pendentes' },
] as const;
const PAGE = 50;

export default async function LancamentosPage({ searchParams }: {
  searchParams: Promise<{ f?: string; q?: string; cd?: string; ci?: string }>;
}) {
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp.f) ? sp.f! : 'all';
  const search = (sp.q ?? '').slice(0, 60);
  const cursorDate = sp.cd && /^\d{4}-\d{2}-\d{2}$/.test(sp.cd) ? sp.cd : null;
  const cursorId = cursorDate && sp.ci && /^[0-9a-f-]{36}$/i.test(sp.ci) ? sp.ci : null;

  const rows = await q<TxListRow>('list_transactions', [filter, search, cursorId ? cursorDate : null, cursorId, PAGE + 1]);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  const link = (f: string) => `/lancamentos?f=${f}${search ? `&q=${encodeURIComponent(search)}` : ''}`;
  const here = cursorId ? `${link(filter)}&cd=${cursorDate}&ci=${cursorId}` : link(filter);

  return (
    <>
      <header className="topbar"><h1>Lançamentos</h1></header>

      <form role="search" action="/lancamentos" className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="q" className="sr-only">Buscar</label>
        <input id="q" name="q" type="search" placeholder="Buscar descrição" defaultValue={search}
          enterKeyHint="search" autoComplete="off" />
        <input type="hidden" name="f" value={filter} />
      </form>

      <nav className="filters" aria-label="Filtros">
        {FILTERS.map((f) => (
          <Link key={f.key} href={link(f.key)} className={`chip${f.key === filter ? ' active' : ''}`}
            aria-current={f.key === filter ? 'true' : undefined}>{f.label}</Link>
        ))}
      </nav>

      <TxList rows={page} today={localDate()} from={here} />

      {hasMore && last && (
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="btn" href={`${link(filter)}&cd=${last.date}&ci=${last.id}`}>Carregar mais</Link>
        </p>
      )}
    </>
  );
}
