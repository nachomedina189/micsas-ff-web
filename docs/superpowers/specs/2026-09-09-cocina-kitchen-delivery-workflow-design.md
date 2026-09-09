# Flux de cuina i repartiment a cocina.html

## Context

`cocina.html` és el panell intern (tablet a cuina) on el pizzero veu les
comandes que arriben i les va avançant d'estat. Actualment només té dos
estats actius al tauler: **Sense afegir** (pendent d'introduir-se al POS
Aronium) i **Preparant**. En marcar "Llest" des de Preparant, la comanda
salta directament a `delivered` i desapareix del tauler — no existeix cap
etapa intermèdia visible de "pizza feta, esperant sortir".

El negoci ara vol fer servir aquesta mateixa pantalla també per al
repartidor: quan surt a repartir, sovint porta diverses comandes alhora
(no surt amb una i torna per la següent), així que li interessa una ruta
eficient entre les parades, no només l'adreça d'una comanda solta.

La web llança divendres (2 dies vista). Aquest disseny és per a la
primera versió funcional, no per a un sistema de repartiment complet amb
múltiples repartidors simultanis (confirmat amb el propietari: normalment
surt un sol repartidor a la vegada).

## Objectius

- Activar una tercera etapa real **Llest** entre Preparant i Entregat.
- Agrupar visualment les comandes de cada columna per franja horària
  (`slot_time`), sense necessitat de canviar de filtre.
- Donar al repartidor, des del mòbil i sense sortir de `cocina.html`,
  navegació directa a cada adreça i — quan hi ha 2+ comandes Llestes a la
  vegada — una ruta optimitzada entre totes elles.
- Avisar amb un so quan arriba una comanda nova a Sense afegir.
- Facilitar l'ús en mòbil (el repartidor) amb accessos ràpids a cada
  columna.

## No-objectius (fora d'abast per aquesta versió)

- Assignació de comandes a un repartidor concret (no cal, un sol
  repartidor a la vegada).
- Tracking en temps real de la posició del repartidor.
- Canviar com es creen o paguen les comandes — aquest disseny només toca
  `cocina.html`.
- Geocodificació persistent d'adreces a la base de dades (es geocodifica
  al vol via l'API de Google cada vegada que cal calcular una ruta).

## Flux d'estats

Estat actual del camp `status` a `orders`: `pending`, `preparing`,
`ready` (declarat a `STATUS_LABEL` però mai assignat avui), `delivered`,
`cancelled`.

Nou flux al tauler:

```
pending  --"Afegit a Aronium"-->  preparing  --"Llest per repartir"-->  ready  --"Entregat"-->  delivered
   |                                  |                                   |
   +--------------------------- "✕ cancel·lar" (disponible a qualsevol etapa) --------------------------+
```

No calen canvis d'esquema — `ready` ja existeix com a valor vàlid del
camp `status`; només cal deixar d'ometre'l al codi.

`stageOf()` / `stageOfGroup()` passen de tenir 2 branques (pending /
preparing-o-qualsevol-altra) a 3 branques explícites: `pending`,
`preparing`, `ready`. `renderOrders()` reparteix els grups entre tres
columnes (`col-pending`, `col-preparing`, `col-ready`) en lloc de dues.

`actionsRow()` calcula el següent estat i etiqueta segons l'etapa actual:

| Etapa actual | Botó principal | Següent estat |
|---|---|---|
| pending | "Afegit a Aronium" | preparing |
| preparing | "Llest per repartir" | ready |
| ready | "Entregat" | delivered |

## Agrupació per franja horària

Dins de cada columna, les targetes (ja agrupades per client+franja com
avui via `groupOrders()`) s'ordenen per `slot_time` ascendent. Quan la
franja canvia respecte la targeta anterior, es renderitza un subtítol
(`<h3>20:00</h3>` per exemple) abans del primer grup d'aquella franja.
Aplica dins de l'scope de data ja existent (Avui/Setmana) — no és un
filtre nou, és només ordenació + separadors visuals.

## Columna "Llest": informació i navegació per al repartidor

Cada targeta a "Llest" mostra, a més del que ja es veu avui (client,
adreça, telèfon, efectiu/pagat, articles):

- **Dos botons de navegació individual**: 🗺️ Google Maps i 🚗 Waze,
  cadascun amb l'adreça de la comanda codificada a l'URL:
  - Google Maps: `https://www.google.com/maps/dir/?api=1&destination=<adreça codificada>&travelmode=driving`
  - Waze: `https://waze.com/ul?q=<adreça codificada>&navigate=yes`

  No existeix cap URL única fiable que deixi "triar" l'app entre iOS i
  Android des d'un navegador web — mostrar els dos botons és la forma
  honesta de donar elecció real sense dependre de detecció de sistema
  operatiu fràgil.

### Ruta optimitzada (2+ comandes Llestes)

Quan hi ha 2 o més comandes a la columna "Llest" simultàniament, apareix
a la capçalera de la columna un botó **"🗺️ Ruta optimitzada"**:

1. Es construeix la llista d'adreces de totes les comandes actualment a
   "Llest" (com a text — carrer + pis + codi postal + ciutat).
2. Es crida `google.maps.DirectionsService` (carregant la llibreria
   `routes` de la Maps JavaScript API, reutilitzant la mateixa
   `GOOGLE_MAPS_API_KEY` que ja fa servir `pre-pedido.html`) amb:
   - `origin`: adreça fixa del local — **Carrer Coll d'Estenalles 24,
     08230 Matadepera, Barcelona** (la mateixa de l'avís legal; cal
     confirmar amb el client si el repartiment surt d'un altre punt).
   - `waypoints`: la resta d'adreces, amb `optimizeWaypoints: true`.
   - `destination`: l'última adreça de la llista (no cal tornada al
     local).
3. Amb la resposta (ordre optimitzat dels waypoints), es mostra:
   - Una llista numerada curta sobre la columna ("1. Carrer X · 2.
     Carrer Y · 3. Carrer Z").
   - Un botó **"Navegar ruta completa"** que obre Google Maps amb totes
     les parades carregades en aquest ordre
     (`https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=parada1|parada2&travelmode=driving`).
4. Si `DirectionsService` falla (adreça no localitzable, quota exhaurida,
   etc.), es mostra un avís discret i es cau als botons individuals per
   targeta — la ruta optimitzada és una millora, mai un bloqueig per
   repartir.
5. Amb només 1 comanda a "Llest" no es mostra aquest botó — no hi ha res
   a optimitzar.

La ruta és només Google Maps (Waze no ofereix un equivalent
d'optimització multi-parada per enllaç web); els botons individuals per
targeta continuen ofertant Waze com a opció d'una sola adreça.

## Avís sonor de comanda nova

`loadOrders()` compara els IDs de comandes amb `status === 'pending'`
rebudes contra un `Set` d'IDs ja vistos en aquesta sessió de pàgina. Si
apareix un ID nou no vist abans, es reprodueix un to curt generat amb la
Web Audio API (oscil·lador, sense fitxer d'àudio extern). El `Set`
s'actualitza abans de renderitzar per no re-sonar en re-renders
posteriors del mateix pedido.

Limitació coneguda: alguns navegadors mòbils (especialment Safari/iOS)
bloquegen l'àudio fins que hi ha hagut una interacció prèvia de l'usuari
amb la pàgina — el primer so pot no sonar fins després del primer toc a
la pantalla. No té solució neta sense demanar un gest explícit ("Activa
els avisos") a l'inici, que es considera fora d'abast per ara.

## Accessos ràpids en mòbil

A pantalles petites (el mòbil del repartidor), s'afegeix una barra
superior amb tres botons ("Sense afegir" / "Preparant" / "Llest") que fan
scroll directe a la columna corresponent via àncores, evitant haver de
baixar a pols per les tres columnes apilades verticalment.

## Gestió d'errors

- Error carregant/actualitzant comandes: ja gestionat avui
  (`console.error` + no-op); es manté igual.
- Error calculant la ruta optimitzada: es mostra un avís curt dins la
  columna "Llest" i es continua funcionant amb navegació individual —
  mai bloqueja marcar comandes com a preparades/llestes/entregades.
- So de notificació bloquejat pel navegador: es falla en silenci (try/
  catch al voltant de la reproducció), no es mostra error a l'usuari.

## Verificació

- Provar manualment el flux complet amb una comanda de prova: pending →
  preparing → ready → delivered, confirmant que apareix a la columna
  correcta en cada pas i que "Entregat" la treu del tauler cap a
  l'Historial.
- Provar amb 2-3 comandes de prova amb adreces reals de Matadepera a
  "Llest" simultàniament, confirmar que el botó de ruta optimitzada
  apareix, calcula un ordre coherent, i que el botó "Navegar ruta
  completa" obre Google Maps amb totes les parades.
- Provar el so de comanda nova (esperar que arribi una comanda de prova
  nova amb la pestanya oberta).
- Provar en un mòbil real (no només l'emulador d'ample de finestra del
  navegador) els accessos ràpids i els botons de Maps/Waze.
