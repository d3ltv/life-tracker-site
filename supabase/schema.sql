-- LifeOS / Business OS — schéma Supabase
-- À exécuter dans Supabase SQL Editor.
-- RLS est activé : l'API serveur utilise la service role key côté serveur.

create extension if not exists pgcrypto;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  text text not null check (char_length(trim(text)) between 1 and 5000),
  category text not null default 'libre',
  source text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists journal_entries_date_idx
  on public.journal_entries (date desc, created_at desc);

create table if not exists public.advice_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  diagnosis text not null check (char_length(trim(diagnosis)) between 1 and 2000),
  lever text not null default '',
  action text not null check (char_length(trim(action)) between 1 and 1000),
  domain text not null default 'business',
  priority text not null default 'normal',
  source text not null default 'hermes',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists advice_entries_date_idx
  on public.advice_entries (date desc, created_at desc);

create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal_type text not null default 'custom',
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  calories numeric not null default 0 check (calories >= 0),
  quality text not null default 'non précisée',
  source text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meal_entries_date_idx
  on public.meal_entries (date desc, created_at desc);

create table if not exists public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  status text not null default 'prospect'
    check (status in ('prospect', 'rdv', 'proposition', 'client', 'perdu')),
  value numeric not null default 0 check (value >= 0),
  next_action text not null default '',
  next_action_at date,
  note text not null default '',
  source text not null default 'web',
  -- Encaissement réel, distinct du statut CRM : un client "signé" n'a pas forcément payé.
  payment_status text not null default 'du'
    check (payment_status in ('du', 'facture', 'encaisse')),
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  paid_at date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_contacts_status_idx
  on public.business_contacts (status, updated_at desc);
create index if not exists business_contacts_payment_status_idx
  on public.business_contacts (payment_status, paid_at desc);

create table if not exists public.business_processes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  status text not null default 'brouillon'
    check (status in ('brouillon', 'actif', 'a_revoir', 'archive')),
  source text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id boolean primary key default true check (id),
  revenue_target numeric not null default 10000 check (revenue_target >= 0),
  savings_target numeric not null default 2000 check (savings_target >= 0),
  savings numeric not null default 0 check (savings >= 0),
  -- Prix réel d'une offre (vidéo / pack). Nul jusqu'à ce que Hermes le tranche.
  price_per_deal numeric check (price_per_deal is null or price_per_deal >= 0),
  updated_at timestamptz not null default now()
);

insert into public.business_settings (id)
values (true)
on conflict (id) do nothing;

-- Sources de prospection (Apify, LinkedIn, recommandation, etc.)
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

-- Activités de prospection (appels, visites, emails, messages)
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

-- RLS : aucune lecture/écriture publique directe.
-- Les opérations passent par l'API serveur avec SUPABASE_SERVICE_ROLE_KEY.
alter table public.journal_entries enable row level security;
alter table public.advice_entries enable row level security;
alter table public.meal_entries enable row level security;
alter table public.business_contacts enable row level security;
alter table public.business_processes enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_sources enable row level security;
alter table public.prospecting_activities enable row level security;

-- Vérification utile après exécution :
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'journal_entries', 'advice_entries', 'meal_entries',
    'business_contacts', 'business_processes', 'business_settings',
    'business_sources', 'prospecting_activities'
  )
order by table_name;
