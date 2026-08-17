-- ============================================================================
-- Ping Location attendance (teacher pings → students within radius get marked)
-- Run this in Supabase SQL Editor.
-- ============================================================================

-- ─── LOCATION PINGS ─────────────────────────────────────────────────────────
create table if not exists location_pings (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null,
  session_id  uuid not null references attendance_sessions(id),
  lat         double precision not null,
  lng         double precision not null,
  radius_m    integer not null default 40,
  started_at  timestamptz default now(),
  expires_at  timestamptz not null,
  is_active   boolean default true
);

create index if not exists idx_location_pings_teacher_active
  on location_pings(teacher_id, is_active)
  where is_active = true;

create index if not exists idx_location_pings_session on location_pings(session_id);

-- ─── RLS (backend writes via service_role; teachers manage their own) ──────
alter table location_pings enable row level security;

drop policy if exists "Teachers insert their own pings" on location_pings;
create policy "Teachers insert their own pings"
  on location_pings for insert
  with check (teacher_id = auth.uid());

drop policy if exists "Teachers view their own pings" on location_pings;
create policy "Teachers view their own pings"
  on location_pings for select
  using (teacher_id = auth.uid());

-- ─── DEFAULT PING RADIUS SETTING ────────────────────────────────────────────
insert into settings (key, value)
select 'pingRadius', '40'
where not exists (select 1 from settings where key = 'pingRadius');
