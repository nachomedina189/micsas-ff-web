-- Carta del dia: des de cocina.html el pizzero pot apagar pizzes, begudes
-- o ingredients (s'ha acabat el guanciale, no ha arribat la provola...) i
-- la web deixa de deixar-los demanar al moment.
--
--   · Apagar un producte → aquell producte no es pot demanar.
--   · Apagar un ingredient → no es pot demanar cap pizza que el porti.
--
-- Cada apagada és "només aquell dia" (block_date = data del pase; l'endemà
-- ja no compta i torna a estar disponible sol) o "fins a nou avís"
-- (block_date null, fins que cuina el torni a encendre).
--
-- La lògica de què es pot demanar viu NOMÉS aquí (get_menu_availability):
-- la fan servir les pàgines (menu, carta, pedido) per pintar-ho i
-- place-order per rebutjar una comanda que porti un producte apagat.

-- ── Catàleg ─────────────────────────────────────────────────────────────
-- Mateixos ids que CATALOG a place-order i MENU a pedido.html.
create table if not exists public.menu_products (
  id          text primary key,
  kind        text not null check (kind in ('pizza', 'drink')),
  name        text not null,
  sort        int  not null default 0,
  ingredients text[] not null default '{}'  -- ids de menu_ingredients
);

create table if not exists public.menu_ingredients (
  id   text primary key,
  name text not null,
  grp  text not null,   -- només per agrupar-los a cocina.html
  sort int  not null default 0
);

alter table public.menu_products enable row level security;
alter table public.menu_ingredients enable row level security;
-- És la carta pública: qualsevol la pot llegir; ningú hi escriu des de la web.
drop policy if exists "public_select_menu_products" on public.menu_products;
create policy "public_select_menu_products" on public.menu_products for select using (true);
drop policy if exists "public_select_menu_ingredients" on public.menu_ingredients;
create policy "public_select_menu_ingredients" on public.menu_ingredients for select using (true);

-- ── Apagades ────────────────────────────────────────────────────────────
create table if not exists public.menu_blocks (
  item_type  text not null check (item_type in ('product', 'ingredient')),
  item_id    text not null,
  block_date date,   -- null = fins a nou avís; data = només aquell dia d'entrega
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (item_type, item_id)
);

alter table public.menu_blocks enable row level security;
drop policy if exists "staff_select_menu_blocks" on public.menu_blocks;
create policy "staff_select_menu_blocks" on public.menu_blocks
  for select using (public.is_staff());
-- Sense polítiques d'escriptura: només es canvia via set_menu_block.

-- ── Què no es pot demanar per a una data d'entrega ──────────────────────
-- Retorna només els productes apagats: until_notice diu si és "fins a nou
-- avís" (la web diu "Tornem aviat") o només d'aquell dia ("Exhaurida"), i
-- missing els ingredients que falten (buit si s'ha apagat el producte).
create or replace function public.get_menu_availability(p_delivery_date date)
returns table (product_id text, until_notice boolean, missing text[])
language sql
security definer
set search_path = public
stable
as $$
  with active as (
    select b.item_type, b.item_id, b.block_date is null as indef
    from public.menu_blocks b
    where b.block_date is null or b.block_date = p_delivery_date
  )
  select p.id,
         bool_or(a.indef),
         coalesce(array_agg(i.name order by i.sort) filter (where i.id is not null), '{}')
  from public.menu_products p
  join active a
    on (a.item_type = 'product' and a.item_id = p.id)
    or (a.item_type = 'ingredient' and a.item_id = any (p.ingredients))
  left join public.menu_ingredients i
    on a.item_type = 'ingredient' and i.id = a.item_id
  group by p.id;
$$;

revoke all on function public.get_menu_availability(date) from public;
grant execute on function public.get_menu_availability(date) to anon, authenticated, service_role;

-- ── Cuina encén o apaga un producte o ingredient ────────────────────────
--   p_mode 'on'    → disponible (esborra l'apagada)
--   p_mode 'day'   → apagat només el dia p_date
--   p_mode 'indef' → apagat fins a nou avís
create or replace function public.set_menu_block(p_item_type text, p_item_id text, p_mode text, p_date date)
returns void
language plpgsql
security definer
set search_path = public
volatile
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_STAFF';
  end if;
  if p_item_type = 'product' then
    if not exists (select 1 from public.menu_products where id = p_item_id) then raise exception 'UNKNOWN_ITEM'; end if;
  elsif p_item_type = 'ingredient' then
    if not exists (select 1 from public.menu_ingredients where id = p_item_id) then raise exception 'UNKNOWN_ITEM'; end if;
  else
    raise exception 'INVALID_TYPE';
  end if;

  if p_mode = 'on' then
    delete from public.menu_blocks where item_type = p_item_type and item_id = p_item_id;
  elsif p_mode in ('day', 'indef') then
    if p_mode = 'day' and p_date is null then raise exception 'MISSING_DATE'; end if;
    insert into public.menu_blocks (item_type, item_id, block_date, updated_at, updated_by)
    values (p_item_type, p_item_id, case when p_mode = 'day' then p_date end, now(), auth.uid())
    on conflict (item_type, item_id) do update
      set block_date = excluded.block_date, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  else
    raise exception 'INVALID_MODE';
  end if;

  -- Les apagades d'un sol dia ja passades no fan res; es netegen aquí.
  delete from public.menu_blocks where block_date < current_date - 1;
end;
$$;

revoke all on function public.set_menu_block(text, text, text, date) from public;
grant execute on function public.set_menu_block(text, text, text, date) to authenticated;
revoke execute on function public.set_menu_block(text, text, text, date) from anon;

-- ── Dades: la carta actual ──────────────────────────────────────────────
insert into public.menu_ingredients (id, name, grp, sort) values
  ('tomaquet-san-marzano', 'Tomàquet San Marzano',     'Bases',             10),
  ('tomaquet-datterino',   'Tomàquet datterino',       'Bases',             11),
  ('crema-carbonara',      'Crema de carbonara',       'Bases',             12),
  ('nutella',              'Nutella',                  'Bases',             13),
  ('fior-di-latte',        'Fior di latte',            'Formatges',         20),
  ('parmigiano',           'Parmigiano',               'Formatges',         21),
  ('pecorino',             'Pecorino',                 'Formatges',         22),
  ('gorgonzola-dolc',      'Gorgonzola dolç',          'Formatges',         23),
  ('gorgonzola-picant',    'Gorgonzola picant',        'Formatges',         24),
  ('ricotta',              'Ricotta',                  'Formatges',         25),
  ('provola',              'Provola fumada',           'Formatges',         26),
  ('caciocavallo',         'Caciocavallo',             'Formatges',         27),
  ('guanciale',            'Guanciale',                'Embotits',          30),
  ('nduja',                '''Nduja',                  'Embotits',          31),
  ('xorico',               'Xoriço ibèric Joselito',   'Embotits',          32),
  ('pernil-dolc',          'Pernil dolç',              'Embotits',          33),
  ('alfabrega',            'Alfàbrega fresca',         'Verdures i herbes', 40),
  ('xampinyons',           'Xampinyons',               'Verdures i herbes', 41),
  ('olives-negres',        'Olives negres',            'Verdures i herbes', 42),
  ('all',                  'All',                      'Verdures i herbes', 43),
  ('orenga',               'Orenga',                   'Verdures i herbes', 44),
  ('festuc',               'Festuc de Sicília',        'Altres',            50),
  ('oli-oliva',            'Oli d''oliva verge extra', 'Altres',            51),
  ('oli-alfabrega',        'Oli d''alfàbrega',         'Altres',            52)
on conflict (id) do update set name = excluded.name, grp = excluded.grp, sort = excluded.sort;

-- Ingredients de cada pizza: els mateixos que mostra pedido.html (MENU).
insert into public.menu_products (id, kind, name, sort, ingredients) values
  ('margherita-1889',      'pizza', 'Margherita 1889',          10, array['tomaquet-san-marzano','fior-di-latte','alfabrega','parmigiano','oli-oliva']),
  ('marinara-olivata',     'pizza', 'Marinara Olivata',         11, array['tomaquet-san-marzano','orenga','all','alfabrega','olives-negres','oli-oliva']),
  ('bianca-suprema',       'pizza', 'Bianca Suprema',           12, array['fior-di-latte','pecorino','gorgonzola-dolc','ricotta','alfabrega','oli-oliva']),
  ('sottobosco',           'pizza', 'Sottobosco',               13, array['tomaquet-san-marzano','fior-di-latte','parmigiano','xampinyons','pernil-dolc','alfabrega','oli-oliva']),
  ('carbonara',            'pizza', 'Carbonara',                20, array['fior-di-latte','parmigiano','alfabrega','crema-carbonara','guanciale','oli-alfabrega']),
  ('inferno-di-nduja',     'pizza', 'Inferno di ''Nduja',       21, array['nduja','gorgonzola-picant','fior-di-latte','parmigiano','alfabrega','oli-oliva']),
  ('caramella-affumicata', 'pizza', 'Caramella Affumicata',     22, array['tomaquet-datterino','provola','fior-di-latte','alfabrega','caciocavallo','oli-oliva']),
  ('antidiavola',          'pizza', 'Antidiavola',              23, array['tomaquet-san-marzano','fior-di-latte','xorico','alfabrega','parmigiano','oli-oliva']),
  ('nutellina',            'pizza', 'Nutellina',                24, array['nutella','festuc']),
  ('d3',                   'drink', 'Cervesa artesana Moretti', 90, '{}')
on conflict (id) do update set kind = excluded.kind, name = excluded.name, sort = excluded.sort, ingredients = excluded.ingredients;

-- La Caramella Affumicata ja estava fora de carta ("Tornem aviat!", escrit
-- al codi de les pàgines i de place-order). Ara és una apagada "fins a nou
-- avís" i es torna a encendre des de cocina.html.
insert into public.menu_blocks (item_type, item_id, block_date)
values ('product', 'caramella-affumicata', null)
on conflict (item_type, item_id) do nothing;
