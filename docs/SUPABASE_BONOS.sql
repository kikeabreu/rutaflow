-- RutaFlow bonuses table
-- Run this in the Supabase SQL editor before enabling bonus capture in production.

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'uber',
  bonus_type text not null default 'racha',
  amount numeric not null default 0,
  status text not null default 'active',
  required_trips integer,
  completed_trips integer default 0,
  extra_km numeric default 0,
  extra_min numeric default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bonuses_status_check check (status in ('active', 'earned', 'paid', 'lost'))
);

alter table public.bonuses add column if not exists starts_at timestamptz;
alter table public.bonuses add column if not exists expires_at timestamptz;

create index if not exists bonuses_user_created_idx
  on public.bonuses (user_id, created_at desc);

create index if not exists bonuses_user_status_idx
  on public.bonuses (user_id, status);

alter table public.bonuses enable row level security;

drop policy if exists "Users can read their bonuses" on public.bonuses;
create policy "Users can read their bonuses"
  on public.bonuses for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their bonuses" on public.bonuses;
create policy "Users can create their bonuses"
  on public.bonuses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their bonuses" on public.bonuses;
create policy "Users can update their bonuses"
  on public.bonuses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
