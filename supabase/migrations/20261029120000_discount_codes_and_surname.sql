-- Nom i cognoms per separat al checkout de pedido.html. customers.name es
-- continua desant amb el nom complet ("Nom Cognoms"), així cocina.html, els
-- correus i l'informe del pase no canvien; aquestes dues columnes guarden
-- cada part per separat.
alter table public.customers add column if not exists first_name text;
alter table public.customers add column if not exists last_name  text;

-- Codis de descompte. Es gestionen des del Table Editor de Supabase:
--   code         el que escriu el client (es compara en majúscules)
--   kind         'percent' (value = % sobre el subtotal) o 'fixed' (value = €)
--   active       si està apagat, no es pot fer servir
--   starts_at / expires_at  finestra de validesa (buit = sense límit)
--   min_subtotal subtotal mínim de la comanda (sense propina)
--   max_uses     cops que es pot fer servir en total (buit = il·limitat)
-- El descompte s'aplica només al subtotal (pizzes i begudes), mai a la
-- propina. Només el llegeixen les edge functions (service_role): RLS activat
-- i cap política, així ningú pot llistar els codis des del navegador.
create table if not exists public.discount_codes (
  code          text primary key check (code = upper(code) and length(code) between 3 and 30),
  kind          text not null check (kind in ('percent', 'fixed')),
  value         numeric(8,2) not null check (value > 0 and (kind <> 'percent' or value <= 100)),
  active        boolean not null default true,
  starts_at     timestamptz,
  expires_at    timestamptz,
  min_subtotal  numeric(8,2) not null default 0,
  max_uses      integer check (max_uses is null or max_uses > 0),
  description   text,
  created_at    timestamptz not null default now()
);
alter table public.discount_codes enable row level security;

-- Codi i import descomptat de cada comanda. orders.total ja és l'import amb
-- el descompte aplicat (el que es cobra a Stripe o al repartidor).
alter table public.orders add column if not exists discount_code   text;
alter table public.orders add column if not exists discount_amount numeric(8,2) not null default 0;

-- Codi triat per nacho el 29/10/2026: MICSAS10, 10 % de descompte, sense
-- caducitat ni límit d'usos. Per apagar-lo, posa active = false.
insert into public.discount_codes (code, kind, value, active, description)
values ('MICSAS10', 'percent', 10, true, '10 % de descompte')
on conflict (code) do nothing;
