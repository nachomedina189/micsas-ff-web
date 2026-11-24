-- Tipus i lloc de l'event al formulari de pressupost (micsas-events.html).
alter table public.event_requests
  add column if not exists tipus text,
  add column if not exists lloc text;
