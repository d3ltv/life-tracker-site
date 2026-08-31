-- Heartbeat singleton pour le dashboard Hermès (visibilité agent).
-- Exécuter une fois dans Supabase SQL Editor.

create table if not exists public.hermes_heartbeat (
  id integer primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_hermes_heartbeat_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hermes_heartbeat_touch on public.hermes_heartbeat;
create trigger hermes_heartbeat_touch
before update on public.hermes_heartbeat
for each row execute function public.touch_hermes_heartbeat_updated_at();

alter table public.hermes_heartbeat enable row level security;

-- Pas de policy publique : lecture/écriture uniquement via service-role (API serveur).
