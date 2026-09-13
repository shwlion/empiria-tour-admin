/**
 * B5's two charts, as plain SVG from the server.
 *
 * One series each, so one hue — the brand orange on the card surface — and no
 * legend: the title names the series. Bars are thin with a rounded data end
 * and a square baseline, gridlines are hairlines, every mark carries a
 * native tooltip (<title>) with its exact value, and the tables beside the
 * charts are the accessible view of the same numbers. No library: a chart
 * that is two dozen rectangles does not need one.
 */

const INK = 'var(--foreground)';
const MUTED = 'var(--muted-foreground)';
const GRID = 'var(--border)';
const SERIES = 'var(--primary)';

function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) out.push(v);
  return out;
}

const compact = (cents: number) => {
  const v = cents / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(0);
};

/** A column chart of money by day (or by week, when the period is long). */
export function ColumnChart({
  points,
  currency,
  format,
}: {
  points: { label: string; valueCents: number; detail: string }[];
  currency: string;
  format: (cents: number) => string;
}) {
  const W = 720;
  const H = 220;
  const L = 44;
  const R = 8;
  const T = 12;
  const B = 28;
  const max = Math.max(0, ...points.map((p) => p.valueCents));
  const scale = ticks(max);
  const top = scale[scale.length - 1] || 1;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const slot = plotW / Math.max(1, points.length);
  const thick = Math.min(24, Math.max(3, slot - 2));
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const every = Math.ceil(points.length / 8);

  if (max === 0) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground">No money moved in this period.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Payments received by ${points.length > 62 ? 'week' : 'day'}, in ${currency}`}>
      {scale.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
          <text x={L - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill={MUTED}>{compact(v)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = L + i * slot + (slot - thick) / 2;
        const h = Math.max(0, y(0) - y(p.valueCents));
        const r = Math.min(4, thick / 2, h);
        const path = h === 0 ? '' : `M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${thick - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
        return (
          <g key={p.label}>
            {h > 0 && <path d={path} fill={SERIES}><title>{`${p.detail}: ${format(p.valueCents)}`}</title></path>}
            {h === 0 && <rect x={x} y={y(0) - 1} width={thick} height={1} fill={GRID}><title>{`${p.detail}: ${format(0)}`}</title></rect>}
            {i % every === 0 && (
              <text x={x + thick / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={MUTED}>{p.label}</text>
            )}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={INK} strokeOpacity={0.35} strokeWidth={1} />
    </svg>
  );
}

/** Horizontal bars: magnitude by name, largest first, labelled directly. */
export function BarChart({
  rows,
  format,
}: {
  rows: { label: string; valueCents: number; count: number }[];
  format: (cents: number) => string;
}) {
  const W = 720;
  const rowH = 30;
  const L = 200;
  const R = 90;
  const H = rows.length * rowH + 8;
  const max = Math.max(0, ...rows.map((r) => r.valueCents)) || 1;
  const plotW = W - L - R;

  if (rows.length === 0) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground">No bookings in this period.</p>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Gross bookings by tour">
      {rows.map((r, i) => {
        const yy = 4 + i * rowH + (rowH - 18) / 2;
        const w = (r.valueCents / max) * plotW;
        const rr = Math.min(4, w / 2);
        const path = w <= 0 ? '' : `M${L},${yy} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${18 - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`;
        const name = r.label.length > 30 ? `${r.label.slice(0, 29)}…` : r.label;
        return (
          <g key={r.label}>
            <text x={L - 10} y={yy + 13} textAnchor="end" fontSize={12} fill={INK}>{name}</text>
            {w > 0 && <path d={path} fill={SERIES}><title>{`${r.label}: ${format(r.valueCents)} across ${r.count} ${r.count === 1 ? 'booking' : 'bookings'}`}</title></path>}
            <text x={L + Math.max(w, 0) + 8} y={yy + 13} fontSize={11} fill={MUTED}>
              {format(r.valueCents)} · {r.count}
            </text>
          </g>
        );
      })}
      <line x1={L} x2={L} y1={2} y2={H - 2} stroke={INK} strokeOpacity={0.35} strokeWidth={1} />
    </svg>
  );
}
