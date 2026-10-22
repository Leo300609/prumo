import Link from 'next/link';
import type { TxListRow } from '../db/read.ts';
import { Amount } from './Amount.tsx';
import { Icon } from './Icon.tsx';

const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Hoje';
  const y = new Date(Date.parse(today + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  if (iso === y) return 'Ontem';
  return dayFmt.format(new Date(iso + 'T00:00:00Z'));
}

/** Lista agrupada por dia. Cada linha abre o detalhe, onde se classifica e confere. */
export function TxList({ rows, today, grouped = true, from }: { rows: TxListRow[]; today: string; grouped?: boolean; from?: string }) {
  if (rows.length === 0) return <p className="empty">Nenhum lançamento por aqui.</p>;
  const groups = new Map<string, TxListRow[]>();
  for (const r of rows) {
    const key = grouped ? r.date : 'all'; // já vem como "YYYY-MM-DD" (to_char na query)
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return (
    <>
      {[...groups.entries()].map(([day, items]) => (
        <section key={day}>
          {grouped && <h3 className="day-header">{dayLabel(day, today)}</h3>}
          <ul className="tx-list">
            {items.map((t) => (
              <li key={t.id} id={`tx-${t.id}`}>
                {/* from: a página (com filtro e "carregar mais") de onde você veio, para o Voltar levar de volta a ela */}
                <Link href={`/lancamentos/${t.id}${from ? `?from=${encodeURIComponent(from)}` : ''}`} className="tx-row">
                  <span className="tx-icon"><Icon name={t.category_icon ?? (t.is_transfer ? 'arrows' : 'question')} size={20} /></span>
                  <span className="tx-main">
                    <span className="tx-desc">{t.description}</span>
                    <span className="tx-meta">
                      {t.category_name ?? <span className="badge warn">A classificar</span>}
                      {' · '}{t.account_name}
                      {t.status === 'pending' && <> · <span className="badge">pendente</span></>}
                      {t.installment_total ? <> · {t.installment_number}/{t.installment_total}</> : null}
                    </span>
                  </span>
                  <span className="tx-amount"><Amount cents={t.amount_cents} signed /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
