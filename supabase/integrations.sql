-- Intégrations locales synchronisées vers Life Tracker.
-- À exécuter une fois dans Supabase SQL Editor.

create table if not exists public.integration_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('gmail', 'calendar', 'activitywatch')),
  snapshot_date date not null,
  summary jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, snapshot_date)
);

create index if not exists integration_snapshots_date_idx
  on public.integration_snapshots (snapshot_date desc, source);

alter table public.integration_snapshots enable row level security;

-- Aucune policy publique : accès uniquement via l'API serveur service-role.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'integration_snapshots';
