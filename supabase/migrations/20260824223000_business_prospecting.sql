-- Business OS prospecting sources and activities
create extension if not exists pgcrypto;

create table if not exists public.business_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  type text not null check (type in ('apify', 'linkedin', 'referral', 'cold', 'autre')),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_run_at timestamptz,
  runs_count integer not null default 0,
  total_leads integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_sources_type_idx
  on public.business_sources (type, is_active);

create table if not exists public.prospecting_activities (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  source_id uuid references public.business_sources(id) on delete set null,
  contact_id uuid references public.business_contacts(id) on delete set null,
  channel text not null check (channel in ('appel', 'visite', 'email', 'linkedin', 'sms', 'autre')),
  outcome text not null check (outcome in ('pas_de_reponse', 'refus', 'rdv', 'devis_envoye', 'signe', 'perdu', 'a_relancer')),
  duration_min integer,
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists prospecting_activities_date_idx
  on public.prospecting_activities (date desc, created_at desc);
create index if not exists prospecting_activities_source_idx
  on public.prospecting_activities (source_id, date desc);
create index if not exists prospecting_activities_contact_idx
  on public.prospecting_activities (contact_id, date desc);

alter table public.business_sources enable row level security;
alter table public.prospecting_activities enable row level security;
