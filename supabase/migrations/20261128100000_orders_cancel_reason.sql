-- Per què no s'ha pagat una comanda online: release-pending-order hi desa el
-- motiu que envia pedido.html (tancat_pel_client, pagina_tancada,
-- error_creant_pagament, tancat_mentre_carregava...) i l'últim error que ha
-- vist el client (p. ex. "stripe: card_error | card_declined | ...").
alter table public.orders add column if not exists cancel_reason text;
