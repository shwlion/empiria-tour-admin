'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { DAILY, PERIODS, CURRENCY, type PeriodKey, type DailyPoint } from '@/lib/sample';

const W = 720;
const H = 220;
const PAD_T = 10;
const PAD_B = 8;

const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All time' },
];

function seriesForPeriod(period: PeriodKey): DailyPoint[] {
  switch (period) {
    case 'today':
    case '7d':
      return DAILY.slice(-7);
    case '30d':
      return DAILY.slice(-30);
    case '90d':
      return DAILY.slice(-90);
    case 'ytd':
      return DAILY.filter((d) => d.date >= '2026-01-01');
    case 'all':
    default:
      return DAILY;
  }
}

function buildPath(pts: { x: number; y: number }[]) {
  if (!pts.length) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const midX = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${midX} ${pts[i - 1].y}, ${midX} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function RevenueOverview() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const stat = PERIODS[period];
  const avgOrder = stat.orders > 0 ? stat.revenue / stat.orders : 0;
  const periodLabel = PERIOD_TABS.find((p) => p.key === period)!.label;

  const { areaPath, linePath, xTicks } = useMemo(() => {
    const data = seriesForPeriod(period);
    const values = data.map((d) => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const n = data.length;
    const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);
    const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
    const line = buildPath(pts);
    const area = pts.length ? `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z` : '';

    // ~5 evenly spaced date ticks
    const ticks: string[] = [];
    const step = Math.max(1, Math.floor((n - 1) / 4));
    for (let i = 0; i < n; i += step) ticks.push(fmtDate(data[i].date));
    return { areaPath: area, linePath: line, xTicks: ticks };
  }, [period]);

  const subStats = [
    { label: 'Orders', value: stat.orders.toLocaleString() },
    { label: 'Platform fees', value: formatCurrency(stat.platformFees, CURRENCY) },
    { label: 'Avg. order', value: formatCurrency(avgOrder, CURRENCY) },
  ];

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.68)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        borderRadius: 22,
        padding: '1.5rem 1.6rem',
        border: '1px solid rgba(255,255,255,0.88)',
        boxShadow: '0 2px 20px rgba(200,110,30,0.07)',
      }}
    >
      {/* Header + timeframe tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px] font-semibold text-[#444]">Sales Revenue</span>
        <div className="flex gap-0.5 rounded-full bg-black/5 p-[3px]">
          {PERIOD_TABS.map(({ key, label }) => {
            const active = key === period;
            return (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] transition-all ${
                  active
                    ? 'bg-white font-bold text-[#1a1209] shadow-[0_1px_4px_rgba(0,0,0,0.08)]'
                    : 'font-medium text-gray-500'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Headline figure */}
      <div>
        <div className="text-[44px] font-bold leading-[1.05] tracking-[-0.045em] text-[#1a1209]">
          {formatCurrency(stat.revenue, CURRENCY)}
        </div>
        <div className="mt-1 text-[12.5px] text-gray-500">
          {periodLabel === 'All time' ? 'All-time' : periodLabel} sales revenue
        </div>
      </div>

      {/* Sub-stats */}
      <div className="my-5 flex gap-7">
        {subStats.map(({ label, value }) => (
          <div key={label}>
            <div className="text-[17px] font-bold text-[#1a1209]">{value}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="h-[220px] w-full">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="adminRevGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#F15A29" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#F15A29" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#adminRevGradient)" />
          <path
            d={linePath}
            fill="none"
            stroke="#F15A29"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-gray-400">
        {xTicks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
