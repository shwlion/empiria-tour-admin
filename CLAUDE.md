# Empiria Tours — admin console

Empiria's own console (Exhibit A **Part B**). One of three separate repositories
sharing one Supabase project, all under `~/Documents/Elevsoft/Empiria Tours/` —
**that path contains a space**, so quote it.

| Repo | Dev port |
| --- | --- |
| `empiria-tour` — public storefront, Stripe webhook, email outbox | 3000 |
| `empiria-tour-admin` — this one | 3001 |
| `empiria-tour-partner` — one operator's own dashboard | 3002 |

Broad project state, the contract, and what is left live in
`empiria-tour/empiria-tour/docs/PROJECT.md`. Read it before planning work.

## Standing rules

- **Never touch the `Empiria-01` Supabase project.** This platform is
  `Empiria-Tours`, id `wnaleobzkoukdzlruouu`.
- **Never accept a secret pasted into a chat.** The service-role key is typed
  into `.env.local` by the user.
- **Migrations live in the storefront repo**, `empiria-tour/empiria-tour/supabase/migrations/`.
  This repo has none. After any migration, regenerate `lib/database.types.ts`
  and copy it into **all three** repos — it has drifted five times.

## Before it runs

`.env.local` needs **four** variables, not two:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_KEY=        # service role — bypasses RLS, never NEXT_PUBLIC_
```

Without the last two the console opens, shows a read-only banner and lists
nothing — which reads as a bug rather than as configuration. An **empty** value
passes a "key present" check and still fails; check lengths, not presence.

The signed-in account needs `users.role` of `admin` or `agent`. The **first
administrator is made by hand**, deliberately — any in-app way to claim that role
is a way for somebody else to claim it:

```sql
update public.users set role = 'admin' where email = '…';
```

## The three foundations

**A privileged client** (`lib/supabase.ts`). Part B needs draft packages, other
people's bookings and the audit trail, and no RLS policy exposes any of them —
migration 0002 declines to write staff policies on purpose. So the console acts
as `service_role`, which makes the role check the only thing between a request
and the whole database. It runs in the dashboard layout **and again inside every
server action**, because a layout guard protects pages and it is the mutations
that matter.

**Capabilities, not roles** (`lib/auth.ts`). `requireCapability('viewFinance')`,
never `if (role === 'admin')`. The agent denials are Exhibit A's and therefore
contractual; expressing them once stops one call site quietly forgetting.

| | packages | pricing | finance | settings | bookings | customers |
| --- | --- | --- | --- | --- | --- | --- |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| agent | ✓ | — | — | — | ✓ | ✓ |
| partner | own | own | own | — | own | — |

**Status is checked separately from role.** A closed account keeps its role so it
can be reopened, so a guard reading only the role lets a deactivated
administrator carry on working.

**An audit trail** (`lib/audit.ts`). A trigger cannot see the person — at
database level every staff edit is `service_role` — so audit rows are written
from the same action as the change, store only fields that differ, and are
best-effort. Losing the record of a change is bad; losing the change is worse.

## Decisions — do not re-litigate

- **Nothing here writes `seats_booked` or `seats_held`.** Those belong to
  `claim_seats` and `confirm_hold_seats`, which hold a row lock. Capacity edits
  are refused below what is already committed.
- **B3 edits almost nothing.** No touching totals, status, seats or price lines.
  An offline payment goes through `record_payment` with `provider: 'manual'` and
  a generated `provider_ref`, so the idempotency key is never null and balance,
  status and seat logic stay in one place.
- **Child collections are reconciled, not replaced.** An extra somebody bought is
  retired, never deleted. A custom field somebody answered cannot be deleted.
- **A required static page has no create button and a read-only slug.** A page
  with no route is unreachable.
- **A disclosure block is retired, not deleted** — `booking_acknowledgements.block_id`
  is `ON DELETE SET NULL`, so deleting would erase what a traveller agreed to.
  An active block with no placements is refused outright.
- **`approve_partner_application` is the only code path that grants
  `role = 'partner'`.** The staff screen deliberately cannot set it. Do not add a
  second door.
- **Guards live in the database** (`set_user_role`, `set_user_status`): nobody
  changes their own role, an active administrator must always remain, a partner
  holding packages cannot be demoted. The screen mirrors those rules so it never
  offers a control the database would refuse — that mirroring is courtesy, the
  database is the enforcement.
- **A nav item that leads to a 404 is worse than an absent one.** `TopNav`'s
  `built: false` entries are listed so the order is decided once, and hidden.
- **`parseTaxRules` is duplicated** with the storefront's `lib/pricing.ts`. That
  is the cost of three repos; keep them in step by hand.
- **Promotion codes are enforced by `check_promotion`, under a lock, in the
  database** (migration 0015). The screen under Settings validates the same
  rules first so it can say what would be refused, but that is courtesy.
  `usage_count` is maintained by a trigger on `bookings` — nothing in any repo
  writes it. A code any booking names is switched off, never deleted:
  `bookings.promotion_id` is `on delete set null`, and deleting would erase
  the discount from the booking's history.

## Working in here

```bash
cd "~/Documents/Elevsoft/Empiria Tours/empiria-tour-admin"
bun install
bun dev                                  # 3001
npx tsc --noEmit && npx eslint . --max-warnings=0
```

`next build` needs network for the Linux swc binary and for Google Fonts; if a
sandbox blocks either, stub `next/font/google` in `app/layout.tsx` for the build
check only — this app uses Geist, the storefront uses Bricolage Grotesque /
Instrument Sans / Space Mono, so a stub written for one will not cover the other.

## Not built

B4 customers; B5 reporting and revenue share (fully specified now — §4.6(b)
gives the formula, blocked only on Empiria entering supplier costs); B6's
remaining pieces — destinations, collections and featured content, policies,
ad placements, receipt template configuration; B3's tail — refunds,
cancellation, amending a booking with recalculation, booking-list CSV, a custom
notification to a departure, and the audit-trail view.

## The showcase postcards

`/dashboard/content/showcase` edits `showcase_cards` — the four illustrative
postcards on the storefront's landing page. They are **content, not
inventory** (migration 0012 gives them no dates, seats or prices; a kicker is
a mood line like "Islands · Slow travel"). Gated on `manageSettings` like the
rest of Content; every action validates the check constraints itself, parses
`link_url` and root-relative `image_url` values rather than pattern-matching
them, refuses to delete a published card, and writes an audit row. Images are
pasted URLs (Supabase storage), as for tours — there is no upload. Links out
to the storefront and previews of root-relative images use
`lib/storefront.ts` (`NEXT_PUBLIC_TOUR_URL`, default the production domain).

