-- Especial Nadal: panettones amb unitats limitades (nadal.html i pedido.html).
--
--   · panettones: el catàleg. Preu i nom de la línia de comanda els decideix
--     AQUÍ el servidor (place-order), mai la pàgina. stock_total null vol dir
--     que encara no s'han posat les unitats: la web diu "Aviat a la venda" i
--     no es pot comprar. Les unitats es posen des de cocina.html.
--   · Queden = stock_total − línies venudes (order_items.sku) de comandes no
--     cancel·lades. Igual que l'aforo de pizzes, una comanda online sense
--     pagar només reserva durant 15 minuts.
--   · Entrega: amb la comanda (dia de pase) o el "dia d'entrega de
--     panettones" (panettone_settings.delivery_date; null = per confirmar).
--     Una comanda NOMÉS de panettones per a aquell dia no té dia de pase:
--     es desa amb delivery_date null i panettone_delivery = 'panettone_day'.

-- ── Catàleg ─────────────────────────────────────────────────────────────
create table if not exists public.panettones (
  id          text primary key check (id like 'pn-%'),
  name        text not null,
  price       numeric(8,2) not null check (price > 0),
  stock_total integer check (stock_total >= 0),
  active      boolean not null default true,
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.panettones enable row level security;
drop policy if exists "public_select_panettones" on public.panettones;
create policy "public_select_panettones" on public.panettones for select using (true);
-- Sense polítiques d'escriptura: només via set_panettone_stock (cuina).

insert into public.panettones (id, name, price, sort) values
  ('pn-tradicional', 'Panettone Tradicional',        32, 1),
  ('pn-festuc',      'Panettone Festuc',             37, 2),
  ('pn-xocolata',    'Panettone Xocolata siciliana', 33, 3),
  ('pn-gotes',       'Panettone Gotes de xocolata',  33, 4)
on conflict (id) do nothing;

-- ── Dia d'entrega de panettones (una sola fila) ─────────────────────────
create table if not exists public.panettone_settings (
  id            boolean primary key default true check (id),
  delivery_date date,           -- null = data per confirmar
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
insert into public.panettone_settings (id) values (true) on conflict (id) do nothing;
alter table public.panettone_settings enable row level security;
drop policy if exists "public_select_panettone_settings" on public.panettone_settings;
create policy "public_select_panettone_settings" on public.panettone_settings for select using (true);

-- ── Comandes ────────────────────────────────────────────────────────────
-- sku: id del catàleg de la línia (de moment només els panettones). És el que
-- compta l'estoc, no el nom.
alter table public.order_items add column if not exists sku text;
create index if not exists order_items_sku_idx on public.order_items (sku) where sku is not null;

-- Qualsevol pot inserir línies de comanda directament (política antiga), però
-- només el servidor pot posar-hi un sku: si no, una línia inventada podria
-- deixar els panettones "esgotats".
create or replace function public.order_items_guard_sku()
returns trigger
language plpgsql
as $$
begin
  if new.sku is not null and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'SKU_NOT_ALLOWED';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_order_items_guard_sku on public.order_items;
create trigger trg_order_items_guard_sku before insert or update of sku on public.order_items
  for each row execute function public.order_items_guard_sku();

alter table public.orders add column if not exists panettone_delivery text
  check (panettone_delivery in ('order', 'panettone_day'));
alter table public.orders add column if not exists panettone_delivered_at timestamptz;

alter table public.orders alter column delivery_date drop not null;
alter table public.orders drop constraint if exists orders_delivery_date_required;
alter table public.orders add constraint orders_delivery_date_required
  check (delivery_date is not null or coalesce(panettone_delivery = 'panettone_day', false));

-- ── Estoc (públic) ──────────────────────────────────────────────────────
-- { delivery_date, items: [{ id, name, price, active, remaining }] }
-- remaining null = sense unitats posades encara.
create or replace function public.get_panettone_stock()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with sold as (
    select oi.sku, sum(oi.quantity)::int as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.sku like 'pn-%'
      and coalesce(o.status, '') <> 'cancelled'
      and not (o.payment_status = 'processing' and o.created_at < now() - interval '15 minutes')
    group by oi.sku
  )
  select jsonb_build_object(
    'delivery_date', (select s.delivery_date from public.panettone_settings s limit 1),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'price', p.price, 'active', p.active,
               'remaining', case when p.stock_total is null then null
                                 else greatest(0, p.stock_total - coalesce(v.qty, 0)) end
             ) order by p.sort)
      from public.panettones p
      left join sold v on v.sku = p.id
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.get_panettone_stock() from public;
grant execute on function public.get_panettone_stock() to anon, authenticated, service_role;

-- ── Reserva atòmica (només place-order, amb service_role) ───────────────
-- Afegeix les línies de panettone a una comanda ja creada. Amb el bloqueig,
-- dues comandes alhora no poden passar totes dues la comprovació d'estoc.
-- Si no n'hi ha prou: excepció "PANETTONE_SOLDOUT id=… remaining=N" i no
-- s'insereix res (place-order cancel·la la comanda).
create or replace function public.add_panettone_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r        record;
  v_total  int;
  v_active boolean;
  v_name   text;
  v_price  numeric;
  v_sold   int;
  v_left   int;
begin
  perform pg_advisory_xact_lock(hashtext('panettone_stock'));
  for r in
    select (e->>'id') as id, (e->>'quantity')::int as qty, nullif(e->>'notes', '') as notes
    from jsonb_array_elements(p_items) e
  loop
    if r.qty is null or r.qty <= 0 or r.qty > 30 then
      raise exception 'PANETTONE_INVALID id=%', r.id;
    end if;
    select p.stock_total, p.active, p.name, p.price
      into v_total, v_active, v_name, v_price
      from public.panettones p where p.id = r.id;
    if not found then
      raise exception 'PANETTONE_INVALID id=%', r.id;
    end if;
    if not v_active or v_total is null then
      raise exception 'PANETTONE_SOLDOUT id=% remaining=0', r.id;
    end if;
    select coalesce(sum(oi.quantity), 0)::int into v_sold
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.sku = r.id
        and coalesce(o.status, '') <> 'cancelled'
        and not (o.payment_status = 'processing' and o.created_at < now() - interval '15 minutes');
    v_left := greatest(0, v_total - v_sold);
    if v_left < r.qty then
      raise exception 'PANETTONE_SOLDOUT id=% remaining=%', r.id, v_left;
    end if;
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, notes, sku)
    values (p_order_id, null, v_name, v_price, r.qty, r.notes, r.id);
  end loop;
end;
$$;
revoke all on function public.add_panettone_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.add_panettone_items(uuid, jsonb) to service_role;

-- ── Cuina ───────────────────────────────────────────────────────────────
-- Unitats totals (null = encara no a la venda) i si es ven o no.
create or replace function public.set_panettone_stock(p_id text, p_total integer, p_active boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'NOT_STAFF'; end if;
  if p_total is not null and (p_total < 0 or p_total > 9999) then raise exception 'INVALID_TOTAL'; end if;
  update public.panettones
     set stock_total = p_total, active = coalesce(p_active, true), updated_at = now()
   where id = p_id;
  if not found then raise exception 'UNKNOWN_ITEM'; end if;
end;
$$;
revoke all on function public.set_panettone_stock(text, integer, boolean) from public, anon;
grant execute on function public.set_panettone_stock(text, integer, boolean) to authenticated;

-- Dia d'entrega de panettones (null = tornar a "per confirmar").
create or replace function public.set_panettone_delivery_date(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'NOT_STAFF'; end if;
  update public.panettone_settings set delivery_date = p_date, updated_at = now(), updated_by = auth.uid() where id;
end;
$$;
revoke all on function public.set_panettone_delivery_date(date) from public, anon;
grant execute on function public.set_panettone_delivery_date(date) to authenticated;

-- Marcar (o desmarcar) com a entregats els panettones d'una comanda.
create or replace function public.set_panettone_delivered(p_order_id uuid, p_delivered boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'NOT_STAFF'; end if;
  update public.orders
     set panettone_delivered_at = case when p_delivered then now() end
   where id = p_order_id and panettone_delivery is not null;
end;
$$;
revoke all on function public.set_panettone_delivered(uuid, boolean) from public, anon;
grant execute on function public.set_panettone_delivered(uuid, boolean) to authenticated;
