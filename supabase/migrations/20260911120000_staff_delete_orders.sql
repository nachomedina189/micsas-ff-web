-- cocina.html vol deixar que el personal esborri comandes de l'Historial
-- (una comanda concreta, o netejar tot el període vist). Fins ara no
-- existia cap política RLS de DELETE a "orders" — només INSERT/UPDATE/
-- SELECT — així que qualsevol intent de DELETE des del client quedava
-- silenciosament bloquejat (0 files afectades, sense error).
--
-- order_items ja té ON DELETE CASCADE cap a orders (comprovat a
-- producció), i les accions de integritat referencial (cascades) sempre
-- salten l'RLS, així que no cal cap política addicional a order_items —
-- esborrar la comanda ja esborra les seves línies soles.
create policy staff_delete_orders on public.orders
  for delete
  using (auth.uid() in (select staff.auth_user_id from staff));
