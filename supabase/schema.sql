-- ===========================================================================
-- Empiria Tour — auth foundation
-- ===========================================================================
-- Run this ONCE in the SQL Editor of the NEW tour Supabase project (the one
-- that is separate from Empiria-01, which backs shop/organizer/admin).
--
-- This creates the profile table that the role guard reads:
--   requireRole() runs: select role from public.users where id = <auth uuid>
--
-- The tour/ticketing tables (events, occurrences, ticket_tiers, categories,
-- orders) are a separate, larger schema — not included here.
-- ===========================================================================

-- ── Profile table, keyed to the Supabase auth user ─────────────────────────
create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'customer'
             check (role in ('customer', 'partner', 'admin')),
  created_at timestamptz not null default now()
);

comment on table public.users is
  'Profile + role for each Supabase auth user. `id` IS the auth UUID (the replacement for the shop''s auth0_id).';

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table public.users enable row level security;

-- A signed-in user may read their own profile. This is all the role guard needs.
drop policy if exists "read own profile" on public.users;
create policy "read own profile" on public.users
  for select
  using (auth.uid() = id);

-- A signed-in user may update their own profile, but NOT their own role
-- (role changes are done with the service_role key / SQL editor only).
drop policy if exists "update own profile" on public.users;
create policy "update own profile" on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id AND role = (select role from public.users where id = auth.uid()));

-- ── Auto-create a profile row whenever someone signs up ────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Backfill any users that already exist ──────────────────────────────────
insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ===========================================================================
-- After running this: create a user (Auth → Users, or via /login), then grant
-- the role that unlocks each dashboard:
--
--   update public.users set role = 'admin'   where email = 'you@empiria.com';
--   update public.users set role = 'partner' where email = 'partner@atlas.com';
--
-- Check it worked:
--   select id, email, role from public.users order by created_at desc;
-- ===========================================================================
