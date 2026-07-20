/**
 * Sample data for the admin dashboard design shell.
 *
 * Renders WITHOUT a database. Once Supabase (+ Supabase Auth, admin role) is
 * wired up, replace with real platform-wide queries. Shapes mirror the admin
 * app's actions, retargeted events → tours.
 */

export const CURRENCY = 'cad';

// ── Platform KPIs ───────────────────────────────────────────────────────────
export const KPIS = {
  totalRevenue: 1284500,
  netPlatformRevenue: 96340,
  totalOrders: 8421,
  ticketsSold: 21760,
  totalUsers: 12904,
  totalTours: 486,
  platformFees: 128450,
  organizerPayouts: 1156050,
};

// ── Daily revenue series (deterministic, ~90 days) ──────────────────────────
export interface DailyPoint { date: string; value: number }

function buildDaily(): DailyPoint[] {
  // Seeded LCG so server and client produce identical points (no hydration drift).
  let seed = 20260720;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out: DailyPoint[] = [];
  const today = new Date('2026-07-19T00:00:00Z');
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const trend = 9000 + (89 - i) * 90;      // gentle upward drift
    const wobble = (rand() - 0.5) * 4200;     // daily noise
    const weekend = [0, 6].includes(d.getUTCDay()) ? 2600 : 0; // weekend lift
    out.push({ date: d.toISOString().slice(0, 10), value: Math.max(1500, Math.round(trend + wobble + weekend)) });
  }
  return out;
}

export const DAILY: DailyPoint[] = buildDaily();

function sum(points: DailyPoint[]) { return points.reduce((a, p) => a + p.value, 0); }

function periodStat(days: number | 'ytd' | 'all') {
  let slice: DailyPoint[];
  if (days === 'all') slice = DAILY;
  else if (days === 'ytd') slice = DAILY.filter((d) => d.date >= '2026-01-01');
  else slice = DAILY.slice(-days);
  const revenue = sum(slice);
  const orders = Math.round(revenue / 152); // ~avg order value
  return { revenue, orders, platformFees: Math.round(revenue * 0.1) };
}

export const PERIODS = {
  today: periodStat(1),
  '7d': periodStat(7),
  '30d': periodStat(30),
  '90d': periodStat(90),
  ytd: periodStat('ytd'),
  all: periodStat('all'),
} as const;

export type PeriodKey = keyof typeof PERIODS;

// ── Recent activity ─────────────────────────────────────────────────────────
export const RECENT_ORDERS = [
  { id: 'EMP-90412', buyer: 'Priya Anand', tour: 'Kyoto Tea Houses & Hidden Gardens', amount: 264, status: 'completed', date: '2026-07-19' },
  { id: 'EMP-90411', buyer: 'Marco Ferreira', tour: 'Lisbon Fado Nights: Alfama Quarter', amount: 118, status: 'completed', date: '2026-07-19' },
  { id: 'EMP-90408', buyer: 'Yuki Tanaka', tour: 'Old Montréal After Dark', amount: 96, status: 'refunded', date: '2026-07-18' },
  { id: 'EMP-90405', buyer: 'Amina Diallo', tour: 'Marrakech Medina: Artisans & Riads', amount: 210, status: 'completed', date: '2026-07-18' },
  { id: 'EMP-90401', buyer: 'Liam O’Connor', tour: 'Reykjavík Coastline & Folklore', amount: 175, status: 'pending', date: '2026-07-17' },
];

export const RECENT_TOURS = [
  { title: 'Old Montréal After Dark: Lantern Walk', organizer: 'Atlas Journeys Co.', city: 'Montréal', sold: 142, status: 'published' },
  { title: 'Kyoto Tea Houses & Hidden Gardens', organizer: 'Sakura Trails', city: 'Kyoto', sold: 38, status: 'published' },
  { title: 'Oaxaca Market & Mezcal Tasting', organizer: 'Ruta del Sur', city: 'Oaxaca', sold: 0, status: 'draft' },
  { title: 'Marrakech Medina: Artisans & Riads', organizer: 'Atlas Journeys Co.', city: 'Marrakech', sold: 54, status: 'published' },
  { title: 'Lisbon Fado Nights: Alfama Quarter', organizer: 'Tejo Cultura', city: 'Lisbon', sold: 76, status: 'published' },
];
