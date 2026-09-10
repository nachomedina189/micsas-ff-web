-- L'Historial de cocina.html filtrava per delivery_date (la franja
-- RESERVADA, que per a una comanda per endavant pot ser un dia FUTUR
-- respecte "avui"), contra un rang per defecte "últims 7 dies fins avui".
-- Resultat: una comanda ja marcada com a entregada avui, però reservada
-- per a d'aquí 2-3 dies, queda fora del rang per defecte i sembla que
-- "no hi ha historial" encara que la comanda sí existeixi a Supabase amb
-- status = 'delivered'.
--
-- La columna updated_at es toca automàticament a cada UPDATE (via
-- trigger), així que per a una comanda que ja ha arribat a un estat
-- final (delivered/cancelled) reflecteix el moment REAL en què això va
-- passar — és la data correcta per la qual filtrar/ordenar l'historial,
-- no delivery_date.
alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: les comandes que ja existien no tenen un updated_at real
-- (encara no hi havia la columna). created_at és la millor aproximació
-- disponible — millor que deixar-les totes amb "ara mateix" (el default
-- de la columna), que faria semblar que totes acaben de completar-se.
update public.orders set updated_at = created_at;

create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_orders_set_updated_at on public.orders;
create trigger trg_orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();
