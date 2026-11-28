-- Especial Nadal: la factura del pase també inclou els panettones per al
-- "dia d'entrega de panettones" pagats amb targeta. Aquestes comandes no
-- tenen dia de pase (delivery_date null), així que van a la factura del
-- primer pase que es tanca després de fer-les: les creades entre el
-- tancament del pase anterior i el d'aquest (mateixa finestra que l'informe
-- del pase). Els panettones que van amb una comanda de pizza ja hi eren
-- (són dins del total de la comanda).
create or replace function public.issue_pase_invoice(p_date date)
 returns pase_invoices
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s   public.invoice_settings;
  inv public.pase_invoices;
  y   integer := extract(year from p_date)::integer;
  n   integer;
  t   numeric(10,2);
  b   numeric(10,2);
  w_from timestamptz;
  w_to   timestamptz;
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

  select closed_at into w_from from public.pase_reports where delivery_date < p_date order by delivery_date desc limit 1;
  select coalesce((select closed_at from public.pase_reports where delivery_date = p_date), now()) into w_to;

  select coalesce(sum(total), 0) into t
    from public.orders
   where status <> 'cancelled'
     and payment_method <> 'cash'
     and payment_status = 'paid'
     and (
       delivery_date = p_date
       or (delivery_date is null
           and panettone_delivery = 'panettone_day'
           and created_at <= w_to
           and (w_from is null or created_at > w_from))
     );
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
$function$;
