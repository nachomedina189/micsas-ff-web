-- El formulari "Demana pressupost" de micsas-events.html crida a la
-- edge function event-request, que intenta desar cada petició a
-- public.event_requests — però aquesta taula mai s'havia creat, així
-- que TOTA petició fallava amb un error i el client no arribava enlloc
-- (ni es desava ni s'enviava l'avís per email, perquè la inserció fa
-- throw abans d'arribar al pas de l'email).
create table if not exists public.event_requests (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  telefon     text not null,
  email       text not null,
  data_event  date,
  convidats   integer,
  detalls     text,
  created_at  timestamptz not null default now()
);

alter table public.event_requests enable row level security;

-- Només l'edge function (service_role, salta l'RLS) hi escriu. Cap
-- policy per a anon/authenticated: ni es pot llegir ni escriure
-- directament des del client — evita que qualsevol pugui consultar
-- dades de contacte d'altres peticions.
