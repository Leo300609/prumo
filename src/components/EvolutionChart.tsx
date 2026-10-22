import { formatBRL } from '../lib/money.ts';

/** Evolução do valor da carteira (um ponto por dia). SVG puro, renderizado no servidor. */
export function EvolutionChart({ points }: { points: { date: string; cents: number }[] }) {
  if (points.length < 2) return null;
  const W = 340, H = 150, padL = 8, padR = 8, padT = 12, padB = 24;
  const vals = points.map((p) => p.cents);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const line = points.map((p, i) => `${x(i)},${y(p.cents)}`).join(' ');
  const area = `${x(0)},${H - padB} ${line} ${x(points.length - 1)},${H - padB}`;
  const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  const label = (i: number) => fmt.format(new Date(points[i].date + 'T00:00:00Z'));
  const first = points[0], last = points[points.length - 1];

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Carteira de ${label(0)} a ${label(points.length - 1)}: de ${formatBRL(first.cents)} para ${formatBRL(last.cents)}`}>
        <polygon points={area} fill="var(--brass)" fillOpacity="0.2" />
        <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(last.cents)} r="4" fill="var(--text)" />
        <text x={padL} y={H - 6} fontSize="11" fill="var(--text-2)">{label(0)}</text>
        <text x={W - padR} y={H - 6} fontSize="11" textAnchor="end" fill="var(--text-2)">{label(points.length - 1)}</text>
      </svg>
    </figure>
  );
}
