-- Contactes que demanen avís quan tornen a obrir les comandes després d'un
-- sold out (pantalla de sold out de pre-pedido.html). La web només hi pot
-- escriure; la llista es consulta des del panell de Supabase.
create table if not exists public.soldout_alerts (
  id uuid primary key default gen_random_uuid(),
  contact text not null check (char_length(contact) between 5 and 120),
  delivery_date date,
  created_at timestamptz not null default now()
);

alter table public.soldout_alerts enable row level security;

drop policy if exists "soldout_alerts_insert" on public.soldout_alerts;
create policy "soldout_alerts_insert" on public.soldout_alerts
  for insert to anon, authenticated
  with check (char_length(contact) between 5 and 120);
