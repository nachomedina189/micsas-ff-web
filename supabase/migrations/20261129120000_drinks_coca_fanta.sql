-- Begudes noves a la carta (pedido.html i place-order): Coca-Cola i Fanta, 2 €.
-- A menu_products perquè cocina.html les pugui apagar i les compti com a begudes.
insert into public.menu_products (id, kind, name, sort, ingredients) values
  ('d4', 'drink', 'Coca-Cola', 91, '{}'),
  ('d5', 'drink', 'Fanta',     92, '{}')
on conflict (id) do update set kind = excluded.kind, name = excluded.name, sort = excluded.sort, ingredients = excluded.ingredients;
