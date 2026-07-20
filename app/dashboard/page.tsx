import {
  DollarSign,
  Wallet,
  ShoppingBag,
  Ticket,
  Users,
  MapPinned,
  Percent,
  HandCoins,
} from 'lucide-react';
import KpiCard from '@/components/KpiCard';
import RevenueOverview from '@/components/RevenueOverview';
import { formatCurrency } from '@/lib/utils';
import { KPIS, CURRENCY, RECENT_ORDERS, RECENT_TOURS } from '@/lib/sample';

const orderStatusStyles: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  refunded: 'bg-red-100 text-red-600',
  pending: 'bg-amber-100 text-amber-700',
};

const tourStatusStyles: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-black/10 text-foreground/60',
};

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Platform Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Revenue, orders, tours, and users across Empiria Tour.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Revenue" value={formatCurrency(KPIS.totalRevenue, CURRENCY)} subtitle="Gross bookings" icon={DollarSign} trend={{ value: '8.2%', positive: true }} />
        <KpiCard title="Net Platform Revenue" value={formatCurrency(KPIS.netPlatformRevenue, CURRENCY)} subtitle="After payouts" icon={Wallet} trend={{ value: '5.1%', positive: true }} />
        <KpiCard title="Total Orders" value={KPIS.totalOrders.toLocaleString()} subtitle="Completed payments" icon={ShoppingBag} trend={{ value: '3.4%', positive: true }} />
        <KpiCard title="Tickets Sold" value={KPIS.ticketsSold.toLocaleString()} subtitle="All tours" icon={Ticket} trend={{ value: '6.9%', positive: true }} />
        <KpiCard title="Total Users" value={KPIS.totalUsers.toLocaleString()} subtitle="Registered accounts" icon={Users} trend={{ value: '2.2%', positive: true }} />
        <KpiCard title="Active Tours" value={KPIS.totalTours.toLocaleString()} subtitle="Published & upcoming" icon={MapPinned} />
        <KpiCard title="Platform Fees" value={formatCurrency(KPIS.platformFees, CURRENCY)} subtitle="Collected" icon={Percent} trend={{ value: '7.8%', positive: true }} />
        <KpiCard title="Organizer Payouts" value={formatCurrency(KPIS.organizerPayouts, CURRENCY)} subtitle="Paid to partners" icon={HandCoins} />
      </div>

      {/* Revenue overview */}
      <RevenueOverview />

      {/* Recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent Orders</h2>
            <span className="text-xs text-muted-foreground">Last 5</span>
          </div>
          <div className="space-y-1">
            {RECENT_ORDERS.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[0.03]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{o.buyer}</p>
                  <p className="truncate text-xs text-muted-foreground">{o.tour}</p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${orderStatusStyles[o.status]}`}>
                    {o.status}
                  </span>
                  <span className="w-16 text-right text-sm font-semibold text-foreground">
                    {formatCurrency(o.amount, CURRENCY)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tours */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recent Tours</h2>
            <span className="text-xs text-muted-foreground">Last 5</span>
          </div>
          <div className="space-y-1">
            {RECENT_TOURS.map((t) => (
              <div key={t.title} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-black/[0.03]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.organizer} · {t.city}</p>
                </div>
                <div className="ml-4 flex flex-shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tourStatusStyles[t.status]}`}>
                    {t.status}
                  </span>
                  <span className="w-14 text-right text-sm font-semibold text-foreground">{t.sold} sold</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
