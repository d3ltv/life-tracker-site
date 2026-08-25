-- Prix réel de l'offre + encaissement réel, remplis par Hermes (agent) au fil de l'eau.
-- Tant que ces champs sont vides, l'API et l'UI doivent afficher un état honnête
-- ("pas encore fixé par Hermes"), jamais un 0 ou une fausse valeur.

alter table public.business_settings
  add column if not exists price_per_deal numeric check (price_per_deal is null or price_per_deal >= 0);

alter table public.business_contacts
  add column if not exists payment_status text not null default 'du'
    check (payment_status in ('du', 'facture', 'encaisse')),
  add column if not exists paid_amount numeric not null default 0 check (paid_amount >= 0),
  add column if not exists paid_at date;

create index if not exists business_contacts_payment_status_idx
  on public.business_contacts (payment_status, paid_at desc);
