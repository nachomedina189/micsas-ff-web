-- Informe del pase. Quan el pizzero prem "Tancar pase" a cocina.html,
-- l'edge function informe-pase calcula els indicadors del dia i envia el
-- correu. Per poder mesurar temps reals (cuina, espera, ruta, puntualitat),
-- demanda perduda i incidències calen quatre coses que fins ara no es
-- guardaven:
--
--   1. order_status_events: hora de cada canvi d'estat d'una comanda.
--      Abans només hi havia updated_at (l'últim canvi), així que no es
--      podia saber quant havia trigat cada etapa.
--   2. orders.requested_slot: la franja que va triar el client. Si estava
--      plena, create_order_with_slot l'assigna a una de posterior; així es
--      veu quants clients s'han hagut de desplaçar.
--   3. order_rejections: comandes que la web ha rebutjat (masses
--      exhaurides, cap franja lliure, massa tard). És la demanda perduda.
--   4. order_incidents: pizzes cremades, equivocades, queixes... marcades
--      des de cocina.html.
--
-- I pase_reports, per saber quan s'ha tancat cada pase i si l'informe
-- s'ha enviat (evita enviar-lo dues vegades per un doble toc).

-- ── 1. Historial d'estats ───────────────────────────────────────────────
create table if not exists public.order_status_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  changed_at timestamptz not null default now()
);
create index if not exists order_status_events_order_idx
  on public.order_status_events (order_id, changed_at);

alter table public.order_status_events enable row level security;
drop policy if exists "staff_select_order_status_events" on public.order_status_events;
create policy "staff_select_order_status_events" on public.order_status_events
  for select using (public.is_staff());
-- Sense polítiques d'escriptura: només hi escriu el trigger.

-- Un error aquí MAI ha de bloquejar la creació o el canvi d'estat d'una
-- comanda: si l'insert falla, només es registra un avís.
create or replace function public.log_order_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    begin
      insert into public.order_status_events (order_id, status)
      values (new.id, new.status);
    exception when others then
      raise warning 'log_order_status_event: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_log_status on public.orders;
create trigger trg_orders_log_status
  after insert or update of status on public.orders
  for each row execute function public.log_order_status_event();

-- ── 2. Franja demanada pel client ───────────────────────────────────────
alter table public.orders add column if not exists requested_slot text;

-- ── 3. Comandes rebutjades (demanda perduda) ────────────────────────────
create table if not exists public.order_rejections (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  delivery_date  date,
  requested_slot text,
  pizza_count    int,
  reason         text not null  -- 'soldout' | 'no_slots' | 'too_late' | 'slot_closed'
);
create index if not exists order_rejections_date_idx
  on public.order_rejections (delivery_date);

alter table public.order_rejections enable row level security;
drop policy if exists "staff_select_order_rejections" on public.order_rejections;
create policy "staff_select_order_rejections" on public.order_rejections
  for select using (public.is_staff());
-- Hi escriu place-order amb la service role.

-- ── 4. Incidències ──────────────────────────────────────────────────────
create table if not exists public.order_incidents (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders(id) on delete cascade,
  kind       text not null check (kind in ('cremada', 'equivocada', 'falta', 'retard', 'queixa', 'altres')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists order_incidents_order_idx
  on public.order_incidents (order_id);

alter table public.order_incidents enable row level security;
drop policy if exists "staff_select_order_incidents" on public.order_incidents;
create policy "staff_select_order_incidents" on public.order_incidents
  for select using (public.is_staff());
drop policy if exists "staff_insert_order_incidents" on public.order_incidents;
create policy "staff_insert_order_incidents" on public.order_incidents
  for insert with check (public.is_staff());
drop policy if exists "staff_delete_order_incidents" on public.order_incidents;
create policy "staff_delete_order_incidents" on public.order_incidents
  for delete using (public.is_staff());

-- ── 5. Pases tancats i informes enviats ─────────────────────────────────
create table if not exists public.pase_reports (
  delivery_date  date primary key,
  closed_at      timestamptz not null default now(),
  closed_by      uuid,
  sent_at        timestamptz,
  weekly_sent_at timestamptz,
  last_error     text
);

alter table public.pase_reports enable row level security;
drop policy if exists "staff_select_pase_reports" on public.pase_reports;
create policy "staff_select_pase_reports" on public.pase_reports
  for select using (public.is_staff());
-- Hi escriu l'edge function informe-pase amb la service role.
