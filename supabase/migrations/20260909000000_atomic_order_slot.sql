-- Arregla una condició de carrera: abans, place-order/index.ts feia un
-- SELECT per comptar pizzes de la franja i, en una crida separada, un
-- INSERT de la comanda. Si dues persones confirmaven gairebé alhora per
-- la mateixa franja, totes dues podien llegir el mateix recompte abans
-- que cap de les dues inserís, i la franja acabava amb més de 6 pizzes.
--
-- Aquesta funció fa el recompte + la inserció dins d'una sola transacció,
-- protegida amb un advisory lock per delivery_date, de manera que dues
-- crides simultànies pel mateix dia queden serialitzades i la segona
-- sempre veu la comanda que acaba d'inserir la primera.
create or replace function public.create_order_with_slot(
  p_customer_id      uuid,
  p_address_id       uuid,
  p_payment_method   text,
  p_payment_status   text,
  p_subtotal         numeric,
  p_delivery_fee     numeric,
  p_tip_amount       numeric,
  p_total            numeric,
  p_notes            text,
  p_requested_slot   text,
  p_pizza_count      smallint,
  p_delivery_date    date,
  p_slots            text[]
)
returns table (order_id uuid, slot_time text)
language plpgsql
as $$
declare
  v_counts     jsonb;
  v_slot       text;
  v_candidate  text;
  v_order_id   uuid;
begin
  -- Serialitza totes les reserves d'un mateix dia. El lock és de
  -- transacció (pg_advisory_xact_lock) i s'allibera sol en el COMMIT
  -- implícit quan la funció acaba.
  perform pg_advisory_xact_lock(hashtext(p_delivery_date::text));

  if p_requested_slot is null then
    -- Cap franja demanada (p.ex. cap escenari sense horari): no cal
    -- comprovar aforo.
    v_slot := null;
  else
    select coalesce(jsonb_object_agg(t.slot_time, t.qty), '{}'::jsonb)
      into v_counts
      from (
        select o.slot_time, sum(o.pizza_count) as qty
        from public.orders o
        where o.delivery_date = p_delivery_date
          and o.status <> 'cancelled'
          and o.slot_time is not null
        group by o.slot_time
      ) t;

    v_slot := null;
    foreach v_candidate in array p_slots loop
      if v_candidate < p_requested_slot then
        continue;
      end if;
      if coalesce((v_counts ->> v_candidate)::int, 0) + p_pizza_count <= 6 then
        v_slot := v_candidate;
        exit;
      end if;
    end loop;

    if v_slot is null then
      -- Sense disponibilitat: cap fila de retorn, l'edge function ho
      -- interpreta com "No queden franges disponibles".
      return;
    end if;
  end if;

  insert into public.orders (
    customer_id, address_id, payment_method, payment_status, status,
    subtotal, delivery_fee, tip_amount, total, notes,
    slot_time, pizza_count, delivery_date
  ) values (
    p_customer_id, p_address_id, p_payment_method, coalesce(p_payment_status, 'pending'), 'pending',
    p_subtotal, p_delivery_fee, p_tip_amount, p_total, p_notes,
    v_slot, p_pizza_count, p_delivery_date
  )
  returning id into v_order_id;

  order_id := v_order_id;
  slot_time := v_slot;
  return next;
end;
$$;

-- Només l'edge function (que fa servir la service_role key) pot cridar
-- aquesta funció. Si es deixés oberta a "anon"/"authenticated", qualsevol
-- client podria crear comandes directament via l'API de Supabase,
-- saltant-se les validacions (dia vàlid, preus, etc.) que fa place-order.
revoke all on function public.create_order_with_slot(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[]
) from public;

grant execute on function public.create_order_with_slot(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[]
) to service_role;
