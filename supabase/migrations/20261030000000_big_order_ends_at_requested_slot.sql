-- Comanda gran (més de 6 pizzes, més d'una tanda de forn): abans
-- create_order_with_slot omplia les tandes CAP ENDAVANT a partir de la
-- franja triada pel client. Una comanda d'11 pizzes per a les 21:15
-- quedava 6 a les 21:15 + 5 a les 21:30, i la comanda passava a ser
-- "de les 21:30": arribava 15 min més tard del que havia demanat el
-- client, i la web li deia que la seva franja "s'havia omplert" (fals:
-- estava buida, simplement no hi cabien 11 pizzes en una sola tanda).
--
-- Ara primer prova que la ÚLTIMA tanda sigui la franja demanada,
-- començant abans (21:00 + 21:15), de manera que tota la comanda estigui
-- llesta a l'hora triada. Només si no hi ha lloc a les franges anteriors
-- fa servir el comportament d'abans (tandes cap endavant). p_slots ja ve
-- filtrat per place-order (no inclou franges massa properes a ara), així
-- que mai es començarà una tanda sense marge de preparació.
--
-- Mateixa signatura que 20261004000000_daily_doughs.sql: només canvia la
-- cerca de franges.

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
  v_daily_cap     int;
begin
  -- Serialitza totes les reserves d'un mateix dia (igual que abans).
  perform pg_advisory_xact_lock(hashtext(p_delivery_date::text));

  -- Masses del dia (les que ha posat el pizzero a cuina, o les per
  -- defecte) i pizzes ja reservades: mateix càlcul que
  -- get_daily_availability, perquè el que veu el client i el que es
  -- reserva quadrin sempre.
  v_daily_cap   := public.daily_doughs_for(p_delivery_date);
  v_daily_total := public.daily_pizzas_used(p_delivery_date);

  if v_daily_total + p_pizza_count > v_daily_cap then
    -- place-order llegeix "remaining=N" per dir al client quantes en queden.
    raise exception 'DAILY_SOLDOUT remaining=%', greatest(v_daily_cap - v_daily_total, 0);
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
    and not (o.payment_status = 'processing' and o.created_at < now() - interval '15 minutes')
        group by alloc.key
      ) t;

    v_n := array_length(p_slots, 1);
    v_start_idx := array_position(p_slots, p_requested_slot);
    if v_start_idx is null then
      v_start_idx := 1;
    end if;

    v_slot := null;

    -- 1r intent: que la comanda estigui LLESTA a la franja demanada.
    -- S'omple des de la franja demanada cap enrere (franges consecutives):
    -- la demanada s'omple primer i, si no hi cap tot, la resta va a la
    -- tanda/es anteriors. Si alguna franja necessària no té lloc, o no hi
    -- ha prou franges abans, es descarta i es passa al 2n intent.
    v_allocations := '{}'::jsonb;
    v_remaining := p_pizza_count;
    for v_i in reverse v_start_idx .. 1 loop
      v_candidate := p_slots[v_i];
      v_room := 6 - coalesce((v_counts ->> v_candidate)::int, 0);
      exit when v_room <= 0;
      v_take := least(v_remaining, v_room);
      v_allocations := v_allocations || jsonb_build_object(v_candidate, v_take);
      v_remaining := v_remaining - v_take;
      if v_remaining <= 0 then
        v_slot := p_slots[v_start_idx];
        exit;
      end if;
    end loop;

    -- 2n intent (comportament d'abans): prova cada possible franja d'inici,
    -- de la demanada cap endavant.
    <<start_search>>
    for i in v_start_idx .. v_n loop
      exit start_search when v_slot is not null;
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
