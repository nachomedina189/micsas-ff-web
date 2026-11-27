-- Seguretat: ningú pot crear comandes, línies de comanda, clients ni adreces
-- directament a la base de dades amb la clau pública (anon) ni com a usuari
-- registrat. Abans hi havia polítiques "anyone can create ..." (with check
-- true) i qualsevol, amb la clau que és a les pàgines, podia inserir
-- comandes falses que sortien a cuina i ocupaven franges, o línies amb el
-- preu que volgués.
--
-- Les comandes es creen NOMÉS a l'edge function place-order, amb la clau de
-- servei (service_role no passa per RLS), que és on es validen preus,
-- franges, zona, estoc i descomptes. Cap pàgina insereix en aquestes taules:
-- només actualitzen la fitxa del propi client (polítiques d'UPDATE, que no
-- es toquen).

drop policy if exists "anyone can create orders" on public.orders;
drop policy if exists "anyone_insert_orders" on public.orders;

drop policy if exists "anyone can create order items" on public.order_items;
drop policy if exists "anyone can create order_items" on public.order_items;
drop policy if exists "anyone_insert_order_items" on public.order_items;

drop policy if exists "anyone can create customers" on public.customers;
drop policy if exists "anyone_insert_customers" on public.customers;

drop policy if exists "anyone can create addresses" on public.addresses;
drop policy if exists "anyone_insert_addresses" on public.addresses;

-- create_order_with_slot crea la comanda i reserva la franja: només l'ha de
-- cridar place-order (service_role), mai una pàgina.
revoke execute on function public.create_order_with_slot(uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[])
  from public, anon, authenticated;
grant execute on function public.create_order_with_slot(uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[])
  to service_role;
