-- Jours LifeOS poussés en live depuis habit-track.
-- À exécuter une fois dans Supabase SQL Editor.

create table if not exists public.lifeos_days (
  date date primary key,
  day jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now()
);

alter table public.lifeos_days enable row level security;
