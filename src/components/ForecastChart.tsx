import type { ForecastPoint } from '../domain/forecast.ts';
import { formatBRL } from '../lib/money.ts';

/** Faixa P10–P90 e mediana do saldo projetado. SVG puro, renderizado no servidor. */
export function ForecastChart({ start, points, labels }: { start: number; points: ForecastPoint[]; labels: string[] }) {
  const W = 340, H = 170, padL = 8, padR = 8, padT = 12, padB = 24;
  const all = [start, 0, ...points.flatMap((p) => [p.p10, p.p90])];
  const min = Math.min(...all), max = Math.max(...all);
  const x = (i: number) => padL + (i / points.length) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const band = [
    `${x(0)},${y(start)}`, ...points.map((p, i) => `${x(i + 1)},${y(p.p90)}`),
    ...points.map((p, i) => `${x(points.length - i)},${y(points[points.length - 1 - i].p10)}`),
  ].join(' ');
  const median = [`${x(0)},${y(start)}`, ...points.map((p, i) => `${x(i + 1)},${y(p.p50)}`)].join(' ');
  const last = points.at(-1)!;

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Saldo projetado em ${points.length} meses: entre ${formatBRL(last.p10)} e ${formatBRL(last.p90)}, mediana ${formatBRL(last.p50)}`}>
        {min < 0 && <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="var(--neg)" strokeDasharray="4 4" strokeWidth="1" />}
        <polygon points={band} fill="var(--brass)" fillOpacity="0.22" />
        <polyline points={median} fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinejoin="round" />
        {labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1) && (
          <text key={l + i} x={x(i + 1)} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--text-2)">{l}</text>
        ))}
      </svg>
      <figcaption className="muted" style={{ fontSize: 13 }}>
        Linha: cenário mais provável. Faixa: 8 em cada 10 cenários caem aqui.
      </figcaption>
    </figure>
  );
}
