-- ============================================================
-- AI Farms Tracker — Supabase setup
-- Run ONCE in your Supabase project:
--   Dashboard -> SQL Editor -> New query -> paste all -> Run
-- ============================================================

-- One row per user. The whole tracker state lives in `state` as JSON,
-- which keeps sync simple and means app updates don't need database
-- migrations.
create table if not exists public.farm_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.farm_state enable row level security;

-- ------------------------------------------------------------
-- SECURITY
-- ------------------------------------------------------------
-- Every row is tied to a signed-in user. These policies mean the
-- database will only ever return or accept rows belonging to whoever
-- is logged in — even though the anon key is public in the app bundle,
-- it cannot read anyone's data without a valid login.
-- ------------------------------------------------------------

drop policy if exists "farm_state_select_own" on public.farm_state;
drop policy if exists "farm_state_insert_own" on public.farm_state;
drop policy if exists "farm_state_update_own" on public.farm_state;
drop policy if exists "farm_state_delete_own" on public.farm_state;

-- (removes the older, less safe anon-access policy if you ran v1 of this file)
drop policy if exists "farm_state_anon_access" on public.farm_state;

create policy "farm_state_select_own"
  on public.farm_state for select
  to authenticated
  using (auth.uid() = user_id);

create policy "farm_state_insert_own"
  on public.farm_state for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "farm_state_update_own"
  on public.farm_state for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "farm_state_delete_own"
  on public.farm_state for delete
  to authenticated
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Keep updated_at accurate even if a client forgets to send it.
-- ------------------------------------------------------------
create or replace function public.touch_farm_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists farm_state_touch on public.farm_state;

create trigger farm_state_touch
  before update on public.farm_state
  for each row
  execute function public.touch_farm_state();

-- ------------------------------------------------------------
-- Snapshot history, so a bad sync can be rolled back.
-- ------------------------------------------------------------
create table if not exists public.farm_state_history (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  state     jsonb not null,
  saved_at  timestamptz not null default now()
);

alter table public.farm_state_history enable row level security;

drop policy if exists "farm_history_anon_access" on public.farm_state_history;
drop policy if exists "farm_history_own" on public.farm_state_history;

create policy "farm_history_own"
  on public.farm_state_history for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists farm_state_history_user_idx
  on public.farm_state_history (user_id, saved_at desc);

-- Keep a snapshot every time the state is replaced.
create or replace function public.snapshot_farm_state()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.farm_state_history (user_id, state)
  values (old.user_id, old.state);
  return new;
end;
$$;

drop trigger if exists farm_state_snapshot on public.farm_state;

create trigger farm_state_snapshot
  before update on public.farm_state
  for each row
  execute function public.snapshot_farm_state();

-- ============================================================
-- AFTER RUNNING THIS:
--
-- 1. Go to Authentication -> Providers -> Email and make sure
--    Email is enabled.
-- 2. For a private farm app, go to Authentication -> Sign In / Up
--    and turn OFF "Allow new users to sign up" once you have
--    created your own account. That stops strangers registering.
-- 3. If you don't want to deal with confirmation emails, turn OFF
--    "Confirm email" under Authentication -> Sign In / Up.
--    You'll then be signed in immediately after creating an account.
-- ============================================================
