-- Permet comandes que ocupen més d'una franja de 15 min (ex. 10 pizzes,
-- amb un aforo màxim de 6 pizzes/franja). Abans, create_order_with_slot
-- comprovava "aforo_actual_de_la_franja + pizzes_de_la_comanda <= 6", cosa
-- que mai es podia complir per a cap comanda de més de 6 pizzes — es
-- rebutjava sempre amb "no queden franges disponibles", encara que la nit
-- estigués completament buida.
--
-- Ara una comanda gran ocupa una tanda de franges CONSECUTIVES, sense
-- forats — les pizzes surten del forn seguides, no disperses amb temps
-- morts pel mig (si no, les primeres es refredarien esperant les
-- últimes). slot_time continua sent la ÚNICA franja "oficial" de la
-- comanda (la que fa servir el tauler de cuina, la ruta del repartidor,
-- l'historial...) i ara representa la ÚLTIMA franja de la tanda — quan la
-- comanda sencera està de veritat llesta. La nova columna
-- slot_allocations guarda quantes pizzes d'AQUESTA comanda cauen a CADA
-- franja que ocupa (ex. {"21:00": 6, "21:15": 4}), perquè l'aforo es
-- pugui calcular bé encara que hi hagi comandes grans pel mig. Una
-- comanda normal (≤6 pizzes) sempre acaba amb una sola clau — mateix
-- resultat que abans.

alter table public.orders
  add column if not exists slot_allocations jsonb;

-- Backfill: les comandes que ja existien abans d'aquesta migració no
-- tenen slot_allocations — sense això, el nou càlcul d'aforo (que només
-- mira slot_allocations) les ignoraria per complet i podria deixar
-- reservar per damunt de l'aforo real en franges que ja tenien comandes
-- fetes amb el sistema antic.
update public.orders
set slot_allocations = jsonb_build_object(slot_time, pizza_count)
where slot_time is not null and slot_allocations is null;

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
begin
  -- Serialitza totes les reserves d'un mateix dia (igual que abans).
  perform pg_advisory_xact_lock(hashtext(p_delivery_date::text));

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
