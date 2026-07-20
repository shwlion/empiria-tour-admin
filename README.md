# Empiria Tour — Admin

Platform admin dashboard for **Empiria Tour**. Standalone app — it does **not**
share auth/cookies with the other Empiria apps and will use **Supabase Auth**.
Design system is ported from `empiria-admin` (warm parchment palette, large
radius, brand orange `#F15A29`, Geist, glassy TopNav), retargeted events → tours.

```bash
bun install
bun --bun next dev   # http://localhost:3000  → redirects to /dashboard
```

## What's here (design shell)

- `app/globals.css` — admin warm design tokens + TopNav pill-strip styles
- `app/dashboard/` — TopNav layout + designed **Platform Overview** (8 KPI cards,
  glassy revenue overview, recent orders + tours) rendered from `lib/sample.ts`
- `components/` — `TopNav`, `KpiCard`, `RevenueOverview` (inline-SVG area chart)

## TODO

- [ ] Wire **Supabase Auth**; gate `/dashboard` by the admin role on `users`
- [ ] Replace `lib/sample.ts` with real platform-wide Supabase queries
- [ ] Build out Tours / Orders / Users / Revenue / Categories / Settings
