-- pre-pedido.html i pedido.html intenten mostrar en gris (no clicable)
-- les franges ja completes, consultant directament la taula "orders"
-- amb la clau anon. Però les polítiques RLS d'"orders" només deixen
-- veure comandes al personal o al propietari de la comanda — per a un
-- client anònim la consulta sempre torna "[]", encara que hi hagi
-- comandes reals per aquell dia. Resultat: cap franja es marca mai com
-- a completa per a un client real, encara que el codi que la pinta en
-- gris ja existeixi.
--
-- Aquesta funció exposa NOMÉS l'agregat (franja → nº de pizzes), mai
-- dades del client (nom, telèfon, adreça...), així que és segur obrir-la
-- a tothom. A més, calcula l'ocupació a partir de slot_allocations en
-- lloc de pizza_count agrupat per slot_time, perquè una comanda gran
-- que ocupa diverses franges consecutives compti correctament contra
-- CADA franja que ocupa (no només la seva franja final) — el mateix
-- càlcul que ja fa create_order_with_slot per reservar.
create or replace function public.get_slot_capacity(p_delivery_date date)
returns table (slot_time text, pizza_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select alloc.key as slot_time, sum((alloc.value)::int) as pizza_count
  from public.orders o,
       lateral jsonb_each(coalesce(o.slot_allocations, '{}'::jsonb)) as alloc(key, value)
  where o.delivery_date = p_delivery_date
    and o.status <> 'cancelled'
  group by alloc.key;
$$;

revoke all on function public.get_slot_capacity(date) from public;
grant execute on function public.get_slot_capacity(date) to anon, authenticated;
