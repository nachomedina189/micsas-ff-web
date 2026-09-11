-- Guarda les coordenades precises (lat/lng) que Google Places ja resol en
-- seleccionar l'adreça, perquè cocina.html pugui construir l'enllaç de
-- navegació (Maps/Waze) amb la ubicació exacta en lloc de tornar a
-- geocodificar el text de l'adreça — evita que un carrer ambigu o poc
-- conegut acabi apuntant a un punt equivocat (per exemple, a la zona
-- forestal del Sant Llorenç del Munt, que limita amb Matadepera).
alter table public.addresses
  add column if not exists lat double precision,
  add column if not exists lng double precision;
