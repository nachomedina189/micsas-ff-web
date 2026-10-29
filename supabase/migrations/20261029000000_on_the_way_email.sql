-- Email "la teva comanda és en camí": quan cuina prem "En repartiment" a
-- cocina.html, l'edge function order-on-the-way envia un correu al client.
-- Aquesta columna evita enviar-lo dues vegades (si cuina tira enrere i
-- torna a prémer el botó, o si dos dispositius el premen alhora).
alter table public.orders add column if not exists on_the_way_email_sent_at timestamptz;
