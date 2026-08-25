-- ============================================================
-- AI Farms Tracker — migrate old table to the new auth-based schema
--
-- Run this INSTEAD of supabase-setup.sql if you already created
-- farm_state before (the version keyed by farm_id). This safely
-- drops the old table and recreates everything correctly.
--
-- Your farm data isn't lost by this — nothing was successfully
-- synced yet (that's the error you're seeing), so there's nothing
-- to carry over. Once this runs, sync from the app as normal.
-- ============================================================

drop table if exists public.farm_state_history cascade;
drop table if exists public.farm_state cascade;

-- ---- now recreate with the correct, per-user schema ----

create table public.farm_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  state       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.farm_state enable row level security;

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

create or replace function public.touch_farm_state()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger farm_state_touch
  before update on public.farm_state
  for each row
  execute function public.touch_farm_state();

create table public.farm_state_history (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  state     jsonb not null,
  saved_at  timestamptz not null default now()
);

alter table public.farm_state_history enable row level security;

create policy "farm_history_own"
  on public.farm_state_history for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index farm_state_history_user_idx
  on public.farm_state_history (user_id, saved_at desc);

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

create trigger farm_state_snapshot
  before update on public.farm_state
  for each row
  execute function public.snapshot_farm_state();

-- ============================================================
-- After running this: go back to the app and tap "Sync now".
-- It will find no cloud copy yet and push your current on-device
-- data up as the first save.
-- ============================================================
