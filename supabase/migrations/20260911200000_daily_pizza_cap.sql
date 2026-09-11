-- Aforo diari màxim: 45 pizzes per dia d'entrega (suma de totes les
-- franges), no només 6 per franja. Quan s'arriba al límit, la web ha de
-- bloquejar noves comandes per aquell dia i mostrar "Exhaurit" — igual
-- que ja fa amb les franges individuals, però a nivell de dia sencer.
--
-- get_daily_pizza_count exposa NOMÉS l'agregat (mateix patró que
-- get_slot_capacity): segur d'obrir a un client anònim, no exposa dades
-- de cap comanda concreta.
create or replace function public.get_daily_pizza_count(p_delivery_date date)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(o.pizza_count), 0)
  from public.orders o
  where o.delivery_date = p_delivery_date
    and o.status <> 'cancelled';
$$;

revoke all on function public.get_daily_pizza_count(date) from public;
grant execute on function public.get_daily_pizza_count(date) to anon, authenticated;

-- create_order_with_slot: mateixa funció que 20260910000000_multi_slot_orders.sql,
-- amb una comprovació nova al principi (abans de buscar franja): si el
-- total de pizzes ja reservades pel dia + les d'aquesta comanda supera
-- l'aforo diari, es rebutja tota la comanda (mai es reparteix parcial
-- entre "abans" i "després" del límit). L'excepció porta un missatge
-- reconeixible perquè l'edge function place-order el pugui distingir
-- d'un error genèric i mostrar "Exhaurit" en lloc de "Error del servidor".
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
  v_counts        jsonb;
  v_slot          text;
  v_allocations   jsonb;
  v_start_idx     int;
  v_i             int;
  v_remaining     int;
  v_take          int;
  v_room          int;
  v_candidate     text;
  v_order_id      uuid;
  v_n             int;
  v_daily_total   int;
  v_daily_cap     constant int := 45;
begin
  -- Serialitza totes les reserves d'un mateix dia (igual que abans).
  perform pg_advisory_xact_lock(hashtext(p_delivery_date::text));

  select coalesce(sum(o.pizza_count), 0)
    into v_daily_total
    from public.orders o
    where o.delivery_date = p_delivery_date
      and o.status <> 'cancelled';

  if v_daily_total + p_pizza_count > v_daily_cap then
    raise exception 'DAILY_SOLDOUT: % + % > %', v_daily_total, p_pizza_count, v_daily_cap;
  end if;

  if p_requested_slot is null then
    v_slot := null;
    v_allocations := null;
  else
    -- Aforo real de cada franja: suma de les slot_allocations de totes
    -- les comandes actives del dia (no només la seva slot_time final),
    -- perquè una comanda gran ocupa capacitat també a franges anteriors
    -- a la seva pròpia.
    select coalesce(jsonb_object_agg(t.slot_time, t.qty), '{}'::jsonb)
      into v_counts
      from (
        select alloc.key as slot_time, sum((alloc.value)::int) as qty
        from public.orders o,
             lateral jsonb_each(coalesce(o.slot_allocations, '{}'::jsonb)) as alloc(key, value)
        where o.delivery_date = p_delivery_date
          and o.status <> 'cancelled'
        group by alloc.key
      ) t;

    v_n := array_length(p_slots, 1);
    v_start_idx := array_position(p_slots, p_requested_slot);
    if v_start_idx is null then
      v_start_idx := 1;
    end if;

    v_slot := null;
    -- Prova cada possible franja d'inici, de la demanada cap endavant.
    <<start_search>>
    for i in v_start_idx .. v_n loop
      v_allocations := '{}'::jsonb;
      v_remaining := p_pizza_count;
      -- Omple des de la franja "i" cap endavant, franges consecutives.
      for v_i in i .. v_n loop
        v_candidate := p_slots[v_i];
        v_room := 6 - coalesce((v_counts ->> v_candidate)::int, 0);
        if v_room <= 0 then
          -- Aquesta franja ja no té lloc: aquesta tanda no és vàlida,
          -- prova la següent franja d'inici.
          exit;
        end if;
        v_take := least(v_remaining, v_room);
        v_allocations := v_allocations || jsonb_build_object(v_candidate, v_take);
        v_remaining := v_remaining - v_take;
        if v_remaining <= 0 then
          v_slot := v_candidate;
          exit start_search;
        end if;
      end loop;
    end loop start_search;

    if v_slot is null then
      -- Sense disponibilitat: cap fila de retorn, l'edge function ho
      -- interpreta com "No queden franges disponibles".
      return;
    end if;
  end if;

  insert into public.orders (
    customer_id, address_id, payment_method, payment_status, status,
    subtotal, delivery_fee, tip_amount, total, notes,
    slot_time, pizza_count, delivery_date, slot_allocations
  ) values (
    p_customer_id, p_address_id, p_payment_method, coalesce(p_payment_status, 'pending'), 'pending',
    p_subtotal, p_delivery_fee, p_tip_amount, p_total, p_notes,
    v_slot, p_pizza_count, p_delivery_date, v_allocations
  )
  returning id into v_order_id;

  order_id := v_order_id;
  slot_time := v_slot;
  return next;
end;
$$;

revoke all on function public.create_order_with_slot(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[]
) from public;

grant execute on function public.create_order_with_slot(
  uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, text, smallint, date, text[]
) to service_role;
