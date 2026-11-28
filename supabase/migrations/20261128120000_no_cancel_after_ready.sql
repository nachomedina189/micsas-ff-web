-- Una comanda que ja ha arribat al repartidor (Llest, En repartiment o
-- Entregat) s'ha d'entregar: no es pot passar a cancel·lada des de cap lloc.
create or replace function public.prevent_cancel_after_ready()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status in ('ready', 'out_for_delivery', 'delivered') then
    raise exception 'La comanda ja és al repartiment i no es pot cancel·lar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_no_cancel_after_ready on public.orders;
create trigger trg_orders_no_cancel_after_ready
  before update of status on public.orders
  for each row execute function public.prevent_cancel_after_ready();
