-- Especial Nadal: get_panettone_stock també diu quantes unitats hi ha en
-- total de cada panettone ('total'), per ensenyar "Venuts 28 de 40" i
-- "Només 160 panettones aquest Nadal" a nadal.html. Només s'afegeix un camp:
-- qui ja la feia servir (place-order, pedido, cuina) no canvia.
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
               'total', p.stock_total,
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
