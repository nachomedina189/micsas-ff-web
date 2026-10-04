-- Factura simplificada del pase. Quan el pizzero prem "Tancar pase", el
-- correu de l'informe porta adjunta en PDF la factura d'aquella nit
-- (calcada a la FACTURA SIMPLIFICADA 2026080 que fa servir en Pol). Només
-- hi entren les comandes pagades amb targeta; les d'efectiu no.
--
--   invoice_settings: una sola fila amb l'emissor, el concepte i si s'han
--     d'emetre factures o no. Es pot canviar sense publicar res.
--   pase_invoices: una factura per dia de pase, amb número correlatiu
--     AAAANNN (2026080, 2026081...). Les factures fetes a mà també s'hi
--     apunten (manual = true) perquè la sèrie no repeteixi números.

-- ── Configuració ────────────────────────────────────────────────────────
create table if not exists public.invoice_settings (
  id              boolean primary key default true check (id),
  enabled         boolean not null default false,
  issuer_name     text not null,
  issuer_nif      text not null,
  issuer_address  text not null,
  issuer_city     text not null,
  concept         text not null,
  vat_rate        numeric(5,4) not null default 0.10,
  payment_days    integer not null default 5,
  iban            text not null
);

alter table public.invoice_settings enable row level security;
drop policy if exists "staff_select_invoice_settings" on public.invoice_settings;
create policy "staff_select_invoice_settings" on public.invoice_settings
  for select using (public.is_staff());

-- Desactivada fins que es confirmi quin és l'últim número que s'ha fet.
insert into public.invoice_settings
  (enabled, issuer_name, issuer_nif, issuer_address, issuer_city, concept, vat_rate, payment_days, iban)
values
  (false, 'Pol Bonastre Company', '49663337N', 'Carrer Coll d’Estenalles 24', '08230, Matadepera',
   'Cátering privado para cena', 0.10, 5, 'ES97 2100 0423 9101 0060 0925')
on conflict (id) do nothing;

-- ── Factures emeses ─────────────────────────────────────────────────────
create table if not exists public.pase_invoices (
  delivery_date  date primary key,
  number         integer not null unique,
  issued_at      timestamptz not null default now(),
  concept        text not null,
  base           numeric(10,2) not null,
  vat            numeric(10,2) not null,
  total          numeric(10,2) not null,
  manual         boolean not null default false
);

alter table public.pase_invoices enable row level security;
drop policy if exists "staff_select_pase_invoices" on public.pase_invoices;
create policy "staff_select_pase_invoices" on public.pase_invoices
  for select using (public.is_staff());

-- La del model: l'última que en Pol va fer a mà abans d'aquest canvi.
insert into public.pase_invoices (delivery_date, number, concept, base, vat, total, manual)
values ('2026-09-27', 2026080, 'Cátering privado para cena', 389.55, 38.95, 428.50, true)
on conflict do nothing;

-- Emet (o retorna, si ja existeix) la factura d'un dia de pase: l'import
-- és la suma de les comandes pagades amb targeta (amb la propina, que és
-- el que s'ha cobrat). Retorna null si les factures estan desactivades, si
-- no hi ha cap comanda amb targeta o si ja n'hi ha una d'un dia posterior
-- (la numeració ha d'anar en ordre de data). Un cop emesa no canvia.
create or replace function public.issue_pase_invoice(p_date date)
returns public.pase_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  s   public.invoice_settings;
  inv public.pase_invoices;
  y   integer := extract(year from p_date)::integer;
  n   integer;
  t   numeric(10,2);
  b   numeric(10,2);
begin
  select * into inv from public.pase_invoices where delivery_date = p_date;
  if found then return inv; end if;

  select * into s from public.invoice_settings where id;
  if not found or not s.enabled then return null; end if;

  -- Doble toc: només una petició pot numerar alhora.
  perform pg_advisory_xact_lock(hashtext('public.pase_invoices'));
  select * into inv from public.pase_invoices where delivery_date = p_date;
  if found then return inv; end if;
  if exists (select 1 from public.pase_invoices where delivery_date > p_date) then return null; end if;

  select coalesce(sum(total), 0) into t
    from public.orders
   where delivery_date = p_date
     and status <> 'cancelled'
     and payment_method <> 'cash'
     and payment_status = 'paid';
  if t <= 0 then return null; end if;

  select coalesce(max(number), y * 1000) + 1 into n
    from public.pase_invoices
   where number between y * 1000 + 1 and y * 1000 + 999;

  b := round(t / (1 + s.vat_rate), 2);
  insert into public.pase_invoices (delivery_date, number, concept, base, vat, total)
  values (p_date, n, s.concept, b, t - b, t)
  returning * into inv;
  return inv;
end;
$$;

revoke execute on function public.issue_pase_invoice(date) from public, anon, authenticated;
