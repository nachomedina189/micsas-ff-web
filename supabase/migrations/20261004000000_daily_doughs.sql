-- Masses del dia. Cada dia de servei el pizzero fa un nombre diferent de
-- masses (40, 41, 42...) i cada massa és una pizza: quan s'acaben, s'acaben
-- les pizzes. Fins ara el límit diari era un 45 fix escrit al codi; ara el
-- posa el pizzero des de cocina.html per a cada data d'entrega.
--
-- No es resta res quan entra una comanda: "queden" es calcula sempre com
-- masses − pizzes de les comandes actives d'aquell dia (mateix filtre que
-- ja feia servir l'aforo: sense cancel·lades ni pagaments online abandonats
-- de fa més de 15 minuts). Així una cancel·lació o un pagament que no
-- arriba retornen la pizza sola, sense que cap comptador es descuadri.
--
-- Si el pizzero encara no ha posat el número d'una data (p. ex. pre-comandes
-- per d'aquí a dues setmanes), es fan servir 40 masses per defecte.

create table if not exists public.daily_doughs (
  delivery_date date primary key,
  doughs        int not null check (doughs between 0 and 500),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

alter table public.daily_doughs enable row level security;

drop policy if exists "staff_select_daily_doughs" on public.daily_doughs;
create policy "staff_select_daily_doughs" on public.daily_doughs
  for select using (public.is_staff());
-- Sense polítiques d'escriptura: només es canvia via set_daily_doughs.

-- Masses d'una data: les posades a cuina o 40 per defecte.
create or replace function public.daily_doughs_for(p_delivery_date date)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select d.doughs from public.daily_doughs d where d.delivery_date = p_delivery_date),
    40
  );
$$;

-- Pizzes ja reservades d'una data (comandes actives).
create or replace function public.daily_pizzas_used(p_delivery_date date)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(o.pizza_count), 0)::int
  from public.orders o
  where o.delivery_date = p_delivery_date
    and o.status <> 'cancelled'
    and not (o.payment_status = 'processing' and o.created_at < now() - interval '15 minutes');
$$;

revoke all on function public.daily_doughs_for(date) from public;
revoke all on function public.daily_pizzas_used(date) from public;
grant execute on function public.daily_doughs_for(date) to service_role;
grant execute on function public.daily_pizzas_used(date) to service_role;

-- Per a cuina: el detall complet (masses, venudes, queden). Només personal.
create or replace function public.get_daily_availability(p_delivery_date date)
returns table (doughs int, used int, remaining int, is_set boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_STAFF';
  end if;
  doughs    := public.daily_doughs_for(p_delivery_date);
  used      := public.daily_pizzas_used(p_delivery_date);
  remaining := greatest(doughs - used, 0);
  is_set    := exists (select 1 from public.daily_doughs d where d.delivery_date = p_delivery_date);
  return next;
end;
$$;

revoke all on function public.get_daily_availability(date) from public;
grant execute on function public.get_daily_availability(date) to authenticated;

-- Cuina posa (o corregeix amb +1/−1) les masses d'una data. Si el número
-- queda per sota del que ja s'ha venut, no es cancel·la res: simplement
-- queden 0 i cuina en mostra l'avís.
create or replace function public.set_daily_doughs(p_delivery_date date, p_doughs int)
returns table (doughs int, used int, remaining int, is_set boolean)
language plpgsql
security definer
set search_path = public
volatile
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_STAFF';
  end if;
  if p_doughs is null or p_doughs < 0 or p_doughs > 500 then
    raise exception 'INVALID_DOUGHS';
  end if;
  -- Mateix lock que create_order_with_slot: un canvi de masses i una
  -- comanda del mateix dia no es creuen mai.
  perform pg_advisory_xact_lock(hashtext(p_delivery_date::text));
  insert into public.daily_doughs (delivery_date, doughs, updated_at, updated_by)
  values (p_delivery_date, p_doughs, now(), auth.uid())
  on conflict (delivery_date) do update
    set doughs = excluded.doughs, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  doughs    := p_doughs;
  used      := public.daily_pizzas_used(p_delivery_date);
  remaining := greatest(doughs - used, 0);
  is_set    := true;
  return next;
end;
$$;

revoke all on function public.set_daily_doughs(date, int) from public;
grant execute on function public.set_daily_doughs(date, int) to authenticated;

-- Per al client (anònim). Només diu el número exacte quan en queden 15 o
-- menys, a petició del propietari:
--   'ok'       més de 20 → no es mostra res
--   'low'      16-20     → "s'estan esgotant", sense número
--   'few'      1-15      → "només en queden N"
--   'soldout'  0         → exhaurit
create or replace function public.get_pizza_status(p_delivery_date date)
returns table (status text, remaining int)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_left int;
begin
  v_left := greatest(public.daily_doughs_for(p_delivery_date) - public.daily_pizzas_used(p_delivery_date), 0);
  if v_left = 0 then
    status := 'soldout'; remaining := 0;
  elsif v_left <= 15 then
    status := 'few'; remaining := v_left;
  elsif v_left <= 20 then
    status := 'low'; remaining := null;
  else
    status := 'ok'; remaining := null;
  end if;
  return next;
end;
$$;

revoke all on function public.get_pizza_status(date) from public;
grant execute on function public.get_pizza_status(date) to anon, authenticated;

-- get_daily_pizza_count es manté (pàgines antigues en memòria cau del
-- navegador la poden cridar) però ara amb el càlcul compartit.
create or replace function public.get_daily_pizza_count(p_delivery_date date)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select public.daily_pizzas_used(p_delivery_date)::bigint;
$$;

revoke all on function public.get_daily_pizza_count(date) from public;
grant execute on function public.get_daily_pizza_count(date) to anon, authenticated;

-- create_order_with_slot: igual que 20261002000000_ignore_stale_unpaid_orders.sql
-- però el límit diari surt de daily_doughs_for en lloc del 45 fix, i
-- l'excepció diu quantes en queden.
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
