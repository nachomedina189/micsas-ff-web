# Flux de cuina i repartiment a cocina.html — Pla d'implementació

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activar una tercera etapa "Llest" a `cocina.html`, agrupar les comandes per franja horària, i donar al repartidor navegació directa + ruta optimitzada entre les comandes llestes, més un avís sonor de comanda nova.

**Architecture:** Tot el treball és dins d'un únic fitxer estàtic, `cocina.html`, dins del seu `<script type="module">` existent (que ja importa el client de Supabase des de `./js/supabase.js`). No hi ha canvis d'esquema de base de dades — el valor `status: 'ready'` ja és vàlid, només mai s'havia assignat. S'afegeix la Maps JavaScript API de Google (mateix patró de càrrega que `pre-pedido.html`) només per calcular la ruta optimitzada.

**Tech Stack:** HTML + Tailwind (CDN) + JavaScript vanilla (ES module), Supabase JS client, Google Maps JavaScript API (llibreria `routes`).

**Spec:** `docs/superpowers/specs/2026-09-09-cocina-kitchen-delivery-workflow-design.md`

## Global Constraints

- No es toca cap altre fitxer que `cocina.html` — cap canvi al backend, a `place-order`, a `pedido.html`, etc.
- No s'introdueix cap framework de tests nou (el repo no en té cap). La verificació de la lògica pura es fa amb scripts `node -e` puntuals (no es commiten), i la verificació de tot el fitxer es fa igual que a la resta de la sessió: `node -e "new Function(...)"` sobre el bloc `<script type="module">` per detectar errors de sintaxi.
- Colors ja existents al fitxer que es reutilitzen tal qual: pendent `#F59E0B`, preparant `#3B82F6`, llest/acció positiva `#16A34A`, cancel·lar `#DC2626`.
- Adreça d'origen fixa per a la ruta: `Carrer Coll d'Estenalles 24, 08230 Matadepera, Barcelona` (confirmar amb el client si el repartiment surt d'un altre punt — si canvia, és una sola constant a l'inici de l'script).
- Clau de Google Maps a reutilitzar (la mateixa que ja és pública a `pre-pedido.html:1041`): `AIzaSyAkJQwY4LDMU-VwH0k_qG3O0-2IrQTWQsA`.
- Cada tasca acaba amb un commit propi.

---

### Task 1: Activar la tercera etapa "Llest" (3 columnes al tauler)

**Files:**
- Modify: `cocina.html:43-79` (secció `<main>` del tauler)
- Modify: `cocina.html:104-113` (comentari + `STATUS_LABEL`)
- Modify: `cocina.html:196-247` (`renderOrders`, `stageOf`, `stageOfGroup`, `actionsRow`)
- Modify: `cocina.html:249-314` (`renderOrderCard`, càlcul de `headerBand`)

**Interfaces:**
- Produces: `stageOf(order) -> 'pending'|'preparing'|'ready'`, `stageOfGroup(group) -> 'pending'|'preparing'|'ready'` — usades per Task 2 i Task 3 per saber quan un grup és a la columna "Llest".
- Produces: `document.getElementById('col-ready')`, `#count-ready`, `#section-ready` — contenidors que Task 2 i Task 3 faran servir.

- [ ] **Step 1: Verificar en Node la nova lògica de `stageOf`/`stageOfGroup`/`actionsRow` abans de tocar el fitxer**

Crea un fitxer temporal `C:\Users\nacho\AppData\Local\Temp\claude\verify-task1.js` (no es commiteja) amb:

```js
function stageOf(o) {
  if (o.status === 'pending') return 'pending';
  if (o.status === 'ready') return 'ready';
  return 'preparing';
}
function stageOfGroup(group) {
  if (group.some(o => o.status === 'pending')) return 'pending';
  if (group.some(o => o.status !== 'ready')) return 'preparing';
  return 'ready';
}
function actionsRow(ids, stage, size) {
  const pad = size === 'sm' ? 'py-2 text-xs' : 'py-3 text-sm';
  const idsJs = ids.join("','");
  const NEXT = {
    pending:   { status: 'preparing', label: 'Afegit a Aronium',   color: 'bg-[#2563EB] hover:bg-[#1D4ED8]' },
    preparing: { status: 'ready',     label: 'Llest per repartir', color: 'bg-[#16A34A] hover:bg-[#15803D]' },
    ready:     { status: 'delivered', label: 'Entregat',           color: 'bg-[#16A34A] hover:bg-[#15803D]' },
  };
  const next = NEXT[stage];
  return `<button onclick="advanceStatusBulk(['${idsJs}'],'${next.status}')">${next.label}</button>`;
}

const assert = require('assert');
assert.strictEqual(stageOf({ status: 'pending' }), 'pending');
assert.strictEqual(stageOf({ status: 'preparing' }), 'preparing');
assert.strictEqual(stageOf({ status: 'ready' }), 'ready');

assert.strictEqual(stageOfGroup([{ status: 'pending' }, { status: 'ready' }]), 'pending');
assert.strictEqual(stageOfGroup([{ status: 'preparing' }, { status: 'ready' }]), 'preparing');
assert.strictEqual(stageOfGroup([{ status: 'ready' }, { status: 'ready' }]), 'ready');

assert.ok(actionsRow(['a'], 'pending', 'lg').includes("'preparing'"));
assert.ok(actionsRow(['a'], 'preparing', 'lg').includes("'ready'"));
assert.ok(actionsRow(['a'], 'preparing', 'lg').includes('Llest per repartir'));
assert.ok(actionsRow(['a'], 'ready', 'lg').includes("'delivered'"));
assert.ok(actionsRow(['a'], 'ready', 'lg').includes('Entregat'));

console.log('Task 1 logic OK');
```

Run: `node C:\Users\nacho\AppData\Local\Temp\claude\verify-task1.js`
Expected: `Task 1 logic OK` sense errors.

- [ ] **Step 2: Editar l'HTML del tauler — de 2 a 3 columnes**

A `cocina.html`, substitueix el bloc `<main>` (línies 62-78 actuals):

```html
    <!-- ════ TABLER (KANBAN): Sense afegir → Preparant ════ -->
    <main class="p-6 grid gap-6 grid-cols-1 md:grid-cols-2 items-start">
      <section class="bg-[#15181D] rounded-2xl p-4 md:p-5 border-t-4 border-[#F59E0B] border-x border-b border-white/8">
        <h2 class="flex items-center gap-2 font-black text-lg uppercase tracking-wide mb-4">
          <span class="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span> Sense afegir
          <span id="count-pending" class="ml-auto px-2.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-sm font-bold">0</span>
        </h2>
        <div id="col-pending" class="space-y-4"></div>
      </section>
      <section class="bg-[#15181D] rounded-2xl p-4 md:p-5 border-t-4 border-[#3B82F6] border-x border-b border-white/8">
        <h2 class="flex items-center gap-2 font-black text-lg uppercase tracking-wide mb-4">
          <span class="w-2.5 h-2.5 rounded-full bg-[#3B82F6]"></span> Preparant
          <span id="count-preparing" class="ml-auto px-2.5 py-0.5 rounded-full bg-[#3B82F6]/15 text-[#3B82F6] text-sm font-bold">0</span>
        </h2>
        <div id="col-preparing" class="space-y-4"></div>
      </section>
    </main>
```

Per:

```html
    <!-- ════ TABLER (KANBAN): Sense afegir → Preparant → Llest ════ -->
    <main class="p-6 grid gap-6 grid-cols-1 md:grid-cols-3 items-start">
      <section id="section-pending" class="bg-[#15181D] rounded-2xl p-4 md:p-5 border-t-4 border-[#F59E0B] border-x border-b border-white/8">
        <h2 class="flex items-center gap-2 font-black text-lg uppercase tracking-wide mb-4">
          <span class="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span> Sense afegir
          <span id="count-pending" class="ml-auto px-2.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-sm font-bold">0</span>
        </h2>
        <div id="col-pending" class="space-y-4"></div>
      </section>
      <section id="section-preparing" class="bg-[#15181D] rounded-2xl p-4 md:p-5 border-t-4 border-[#3B82F6] border-x border-b border-white/8">
        <h2 class="flex items-center gap-2 font-black text-lg uppercase tracking-wide mb-4">
          <span class="w-2.5 h-2.5 rounded-full bg-[#3B82F6]"></span> Preparant
          <span id="count-preparing" class="ml-auto px-2.5 py-0.5 rounded-full bg-[#3B82F6]/15 text-[#3B82F6] text-sm font-bold">0</span>
        </h2>
        <div id="col-preparing" class="space-y-4"></div>
      </section>
      <section id="section-ready" class="bg-[#15181D] rounded-2xl p-4 md:p-5 border-t-4 border-[#16A34A] border-x border-b border-white/8">
        <h2 class="flex items-center gap-2 font-black text-lg uppercase tracking-wide mb-4">
          <span class="w-2.5 h-2.5 rounded-full bg-[#16A34A]"></span> Llest
          <span id="count-ready" class="ml-auto px-2.5 py-0.5 rounded-full bg-[#16A34A]/15 text-[#16A34A] text-sm font-bold">0</span>
        </h2>
        <div id="route-panel" class="hidden mb-4"></div>
        <div id="col-ready" class="space-y-4"></div>
      </section>
    </main>
```

- [ ] **Step 3: Actualitzar el comentari i `STATUS_LABEL`**

Substitueix (línies 104-108 actuals):

```js
    // Tauler de 2 etapes actives (com un monitor de cuina tipus McDonald's):
    // "pending" = encara no introduït a Aronium; "preparing"/"ready" = ja
    // introduït i en marxa. En marcar "Llest" la comanda passa directament a
    // "delivered" i desapareix del tauler — només queda consultable a l'Historial.
    const STATUS_LABEL = { pending: 'Sense afegir', preparing: 'Preparant', ready: 'Preparant', delivered: 'Entregat', cancelled: 'Cancel·lat' };
```

Per:

```js
    // Tauler de 3 etapes actives (com un monitor de cuina tipus McDonald's):
    // "pending" = encara no introduït a Aronium; "preparing" = ja introduït,
    // fent-se; "ready" = feta, esperant sortir a repartir. En marcar
    // "Entregat" des de "ready" la comanda passa a "delivered" i desapareix
    // del tauler — només queda consultable a l'Historial.
    const STATUS_LABEL = { pending: 'Sense afegir', preparing: 'Preparant', ready: 'Llest', delivered: 'Entregat', cancelled: 'Cancel·lat' };
```

- [ ] **Step 4: Substituir `stageOf`/`stageOfGroup`/`actionsRow`**

Substitueix (línies 229-247 actuals):

```js
    // Etapa visual d'una comanda individual: pending = encara no afegida a
    // Aronium; qualsevol altra (preparing/ready) = ja en marxa.
    function stageOf(o) { return o.status === 'pending' ? 'pending' : 'preparing'; }
    // Etapa d'un grup: si encara queda alguna comanda sense afegir, el grup
    // sencer es mostra a la columna "Sense afegir" (amb botons individuals).
    function stageOfGroup(group) { return group.some(o => o.status === 'pending') ? 'pending' : 'preparing'; }

    function actionsRow(ids, stage, size) {
      const pad = size === 'sm' ? 'py-2 text-xs' : 'py-3 text-sm';
      const idsJs = ids.join("','");
      const nextStatus = stage === 'pending' ? 'preparing' : 'delivered';
      const nextLabel  = stage === 'pending' ? 'Afegit a Aronium' : 'Llest';
      const nextColor  = stage === 'pending' ? 'bg-[#2563EB] hover:bg-[#1D4ED8]' : 'bg-[#16A34A] hover:bg-[#15803D]';
      return `
        <div class="flex gap-2">
          <button onclick="advanceStatusBulk(['${idsJs}'],'${nextStatus}')" class="flex-1 ${pad} rounded-lg ${nextColor} text-white font-semibold transition-all">${nextLabel}</button>
          <button onclick="advanceStatusBulk(['${idsJs}'],'cancelled')" class="px-4 ${pad} rounded-lg border border-[#D1D5DB] text-[#6B7280] hover:border-[#DC2626]/40 hover:text-[#DC2626] transition-all">✕</button>
        </div>`;
    }
```

Per:

```js
    // Etapa visual d'una comanda individual: 3 etapes reals ara.
    function stageOf(o) {
      if (o.status === 'pending') return 'pending';
      if (o.status === 'ready') return 'ready';
      return 'preparing';
    }
    // Etapa d'un grup: es mostra a la columna menys avançada dels seus
    // membres — si en queda algun sense afegir, tot el grup va a "Sense
    // afegir"; si en queda algun preparant-se (no llest), tot va a
    // "Preparant"; només si TOTS estan llestos, el grup va a "Llest".
    function stageOfGroup(group) {
      if (group.some(o => o.status === 'pending')) return 'pending';
      if (group.some(o => o.status !== 'ready')) return 'preparing';
      return 'ready';
    }

    const ACTIONS_NEXT = {
      pending:   { status: 'preparing', label: 'Afegit a Aronium',   color: 'bg-[#2563EB] hover:bg-[#1D4ED8]' },
      preparing: { status: 'ready',     label: 'Llest per repartir', color: 'bg-[#16A34A] hover:bg-[#15803D]' },
      ready:     { status: 'delivered', label: 'Entregat',           color: 'bg-[#16A34A] hover:bg-[#15803D]' },
    };

    function actionsRow(ids, stage, size) {
      const pad = size === 'sm' ? 'py-2 text-xs' : 'py-3 text-sm';
      const idsJs = ids.join("','");
      const next = ACTIONS_NEXT[stage];
      return `
        <div class="flex gap-2">
          <button onclick="advanceStatusBulk(['${idsJs}'],'${next.status}')" class="flex-1 ${pad} rounded-lg ${next.color} text-white font-semibold transition-all">${next.label}</button>
          <button onclick="advanceStatusBulk(['${idsJs}'],'cancelled')" class="px-4 ${pad} rounded-lg border border-[#D1D5DB] text-[#6B7280] hover:border-[#DC2626]/40 hover:text-[#DC2626] transition-all">✕</button>
        </div>`;
    }
```

- [ ] **Step 5: Actualitzar `renderOrders` per repartir en 3 columnes**

Substitueix (línies 196-212 actuals):

```js
    function renderOrders() {
      const board = ordersCache.filter(o => inDateScope(o) && o.status !== 'delivered' && o.status !== 'cancelled');
      const groups = groupOrders(board);
      const pendingGroups   = groups.filter(g => stageOfGroup(g) === 'pending');
      const preparingGroups = groups.filter(g => stageOfGroup(g) === 'preparing');

      document.getElementById('order-count').textContent = groups.length;
      document.getElementById('count-pending').textContent = pendingGroups.length;
      document.getElementById('count-preparing').textContent = preparingGroups.length;

      const empty = document.getElementById('orders-empty');
      empty.classList.toggle('hidden', groups.length > 0);

      const noneMsg = '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>';
      document.getElementById('col-pending').innerHTML   = pendingGroups.length   ? pendingGroups.map(renderOrderCard).join('')   : noneMsg;
      document.getElementById('col-preparing').innerHTML = preparingGroups.length ? preparingGroups.map(renderOrderCard).join('') : noneMsg;
    }
```

Per:

```js
    function renderOrders() {
      const board = ordersCache.filter(o => inDateScope(o) && o.status !== 'delivered' && o.status !== 'cancelled');
      const groups = groupOrders(board);
      const pendingGroups   = groups.filter(g => stageOfGroup(g) === 'pending');
      const preparingGroups = groups.filter(g => stageOfGroup(g) === 'preparing');
      const readyGroups     = groups.filter(g => stageOfGroup(g) === 'ready');

      document.getElementById('order-count').textContent = groups.length;
      document.getElementById('count-pending').textContent = pendingGroups.length;
      document.getElementById('count-preparing').textContent = preparingGroups.length;
      document.getElementById('count-ready').textContent = readyGroups.length;

      const empty = document.getElementById('orders-empty');
      empty.classList.toggle('hidden', groups.length > 0);

      const noneMsg = '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>';
      document.getElementById('col-pending').innerHTML   = pendingGroups.length   ? pendingGroups.map(renderOrderCard).join('')   : noneMsg;
      document.getElementById('col-preparing').innerHTML = preparingGroups.length ? preparingGroups.map(renderOrderCard).join('') : noneMsg;
      document.getElementById('col-ready').innerHTML     = readyGroups.length     ? readyGroups.map(renderOrderCard).join('')     : noneMsg;
    }
```

(Task 2 tornarà a tocar aquest mateix bloc per afegir els subtítols de franja horària — normal, són canvis incrementals sobre la mateixa funció.)

- [ ] **Step 6: Actualitzar `headerBand` a `renderOrderCard` per als 3 colors**

Dins de `renderOrderCard` (cocina.html, prop de la línia 259 actual), substitueix:

```js
      const stage = stageOfGroup(group);
      const headerBand = !allSameStatus ? 'bg-[#6B7280]' : (stage === 'pending' ? 'bg-[#F59E0B]' : 'bg-[#3B82F6]');
```

Per:

```js
      const stage = stageOfGroup(group);
      const BAND_COLOR = { pending: 'bg-[#F59E0B]', preparing: 'bg-[#3B82F6]', ready: 'bg-[#16A34A]' };
      const headerBand = !allSameStatus ? 'bg-[#6B7280]' : BAND_COLOR[stage];
```

- [ ] **Step 7: Comprovar la sintaxi de tot el fitxer**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('cocina.html','utf8');
const m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
const body = m[1].replace(\"import { supabase } from './js/supabase.js';\", '');
try { new Function(body); console.log('syntax OK'); }
catch(e){ console.log('ERROR:', e.message); }
"
```
Expected: `syntax OK` (es treu la línia `import` literal de dalt del tot perquè `new Function` no accepta `import` a nivell de mòdul — és només per validar sintaxi, no per executar-lo. Verificat que aquesta comanda ja funciona contra el fitxer actual abans de començar el pla.)

- [ ] **Step 8: Commit**

```bash
git add cocina.html
git commit -m "feat(cocina): activar la tercera etapa Llest al tauler

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Agrupar les targetes per franja horària dins de cada columna

**Files:**
- Modify: `cocina.html` (funció `renderOrders`, afegint una nova funció `renderColumnWithTimeHeaders`)

**Interfaces:**
- Consumes: `groupOrders()`, `stageOfGroup()`, `renderOrderCard()`, `escapeHtml()` (ja existents al fitxer).
- Produces: `renderColumnWithTimeHeaders(groups) -> string` — usada per Task 3 igual (el panell de ruta es renderitza a part, no dins d'aquesta funció).

- [ ] **Step 1: Verificar en Node la funció d'agrupació abans de tocar el fitxer**

Crea `C:\Users\nacho\AppData\Local\Temp\claude\verify-task2.js`:

```js
function renderColumnWithTimeHeaders(groups, renderOrderCard, escapeHtml) {
  if (!groups.length) return '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>';
  const sorted = [...groups].sort((a, b) => {
    const ta = a[0].slot_time || '';
    const tb = b[0].slot_time || '';
    return ta.localeCompare(tb);
  });
  let html = '';
  let lastTime = null;
  sorted.forEach(group => {
    const t = group[0].slot_time || 'Sense franja';
    if (t !== lastTime) {
      html += `<h3 class="text-xs font-bold uppercase tracking-widest text-[#5B6270] pt-2 first:pt-0">${escapeHtml(t)}</h3>`;
      lastTime = t;
    }
    html += renderOrderCard(group);
  });
  return html;
}

const assert = require('assert');
const escapeHtml = s => String(s ?? '');
const fakeCard = group => `[CARD:${group[0].slot_time}]`;

const groups = [
  [{ slot_time: '20:30' }],
  [{ slot_time: '20:00' }],
  [{ slot_time: '20:00' }],
  [{ slot_time: '20:15' }],
];
const out = renderColumnWithTimeHeaders(groups, fakeCard, escapeHtml);
const idx2000 = out.indexOf('20:00');
const idx2015 = out.indexOf('20:15');
const idx2030 = out.indexOf('20:30');
assert.ok(idx2000 < idx2015 && idx2015 < idx2030, 'ordre cronològic incorrecte');
assert.strictEqual((out.match(/<h3[^>]*>20:00<\/h3>/g) || []).length, 1, 'el subtítol 20:00 ha de sortir un sol cop encara que hi hagi 2 grups');
assert.strictEqual((out.match(/\[CARD:20:00\]/g) || []).length, 2, 'les 2 targetes de 20:00 s\'han de renderitzar totes dues');
assert.strictEqual(renderColumnWithTimeHeaders([], fakeCard, escapeHtml), '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>');

console.log('Task 2 logic OK');
```

Run: `node C:\Users\nacho\AppData\Local\Temp\claude\verify-task2.js`
Expected: `Task 2 logic OK`.

- [ ] **Step 2: Afegir `renderColumnWithTimeHeaders` a cocina.html**

Just abans de la funció `function renderOrders() {` (la que ve de Task 1), afegeix:

```js
    // Ordena els grups d'una columna per franja horària i insereix un
    // subtítol cada vegada que la franja canvia — així durant una nit amb
    // moltes franges a la vegada es veu d'un cop de vista què toca a cada
    // hora, sense haver de canviar de filtre.
    function renderColumnWithTimeHeaders(groups) {
      if (!groups.length) return '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>';
      const sorted = [...groups].sort((a, b) => {
        const ta = a[0].slot_time || '';
        const tb = b[0].slot_time || '';
        return ta.localeCompare(tb);
      });
      let html = '';
      let lastTime = null;
      sorted.forEach(group => {
        const t = group[0].slot_time || 'Sense franja';
        if (t !== lastTime) {
          html += `<h3 class="text-xs font-bold uppercase tracking-widest text-[#5B6270] pt-2 first:pt-0">${escapeHtml(t)}</h3>`;
          lastTime = t;
        }
        html += renderOrderCard(group);
      });
      return html;
    }
```

- [ ] **Step 3: Fer servir `renderColumnWithTimeHeaders` dins `renderOrders`**

Substitueix, dins `renderOrders` (el bloc que Task 1 acaba de deixar):

```js
      const noneMsg = '<p class="text-sm text-[#5B6270] text-center py-10">Cap comanda</p>';
      document.getElementById('col-pending').innerHTML   = pendingGroups.length   ? pendingGroups.map(renderOrderCard).join('')   : noneMsg;
      document.getElementById('col-preparing').innerHTML = preparingGroups.length ? preparingGroups.map(renderOrderCard).join('') : noneMsg;
      document.getElementById('col-ready').innerHTML     = readyGroups.length     ? readyGroups.map(renderOrderCard).join('')     : noneMsg;
    }
```

Per:

```js
      document.getElementById('col-pending').innerHTML   = renderColumnWithTimeHeaders(pendingGroups);
      document.getElementById('col-preparing').innerHTML = renderColumnWithTimeHeaders(preparingGroups);
      document.getElementById('col-ready').innerHTML     = renderColumnWithTimeHeaders(readyGroups);
    }
```

- [ ] **Step 4: Comprovar la sintaxi de tot el fitxer**

Mateixa comanda del Step 7 de Task 1. Expected: `syntax OK`.

- [ ] **Step 5: Commit**

```bash
git add cocina.html
git commit -m "feat(cocina): agrupar les targetes per franja horària dins de cada columna

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Navegació individual (Maps/Waze) i ruta optimitzada a la columna Llest

**Files:**
- Modify: `cocina.html` (`<head>`, funcions noves, `renderOrderCard`, `renderOrders`)

**Interfaces:**
- Consumes: `stageOf(o)` (Task 1), `escapeHtml()`, `#route-panel` (Task 1), `google.maps.importLibrary` (bootstrap oficial de Google, mateix patró que `pre-pedido.html:1043`).
- Produces: `formatAddress(order)`, `buildMapsUrl(address)`, `buildWazeUrl(address)`, `buildRouteWaypoints(readyGroups)`, `buildMultiStopMapsUrl(orderedStops)`, `renderRoutePanel(readyGroups)` — cap altra tasca en depèn.

- [ ] **Step 1: Verificar en Node les funcions pures (adreces i URLs) abans de tocar el fitxer**

Crea `C:\Users\nacho\AppData\Local\Temp\claude\verify-task3.js`:

```js
function formatAddress(order) {
  const addr = order.addresses || {};
  const line1 = [addr.street, addr.floor].filter(Boolean).join(', ');
  const line2 = [addr.postal_code, addr.city].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
}
function buildMapsUrl(address) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}
function buildWazeUrl(address) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}
function buildRouteWaypoints(readyGroups) {
  return readyGroups
    .map(group => ({
      label: (group[0].customers && group[0].customers.name) || 'Client',
      address: formatAddress(group[0]),
    }))
    .filter(w => w.address.trim().length > 0);
}
function buildMultiStopMapsUrl(origin, orderedStops) {
  const originParam = encodeURIComponent(origin);
  const destination = encodeURIComponent(orderedStops[orderedStops.length - 1].address);
  const waypointsParam = orderedStops.slice(0, -1).map(s => encodeURIComponent(s.address)).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destination}&travelmode=driving`;
  if (waypointsParam) url += `&waypoints=${waypointsParam}`;
  return url;
}

const assert = require('assert');

assert.strictEqual(
  formatAddress({ addresses: { street: 'Carrer Major 5', floor: '2n 1a', postal_code: '08230', city: 'Matadepera' } }),
  'Carrer Major 5, 2n 1a, 08230 Matadepera'
);
assert.strictEqual(formatAddress({ addresses: {} }), '');
assert.strictEqual(formatAddress({}), '');

assert.ok(buildMapsUrl('Carrer Major 5, Matadepera').startsWith('https://www.google.com/maps/dir/?api=1&destination='));
assert.ok(buildMapsUrl('Carrer Major 5, Matadepera').includes(encodeURIComponent('Carrer Major 5, Matadepera')));
assert.ok(buildWazeUrl('Carrer Major 5, Matadepera').startsWith('https://waze.com/ul?q='));

const readyGroups = [
  [{ customers: { name: 'Anna' }, addresses: { street: 'C1', postal_code: '08230', city: 'Matadepera' } }],
  [{ customers: { name: 'Bernat' }, addresses: { street: 'C2', postal_code: '08230', city: 'Matadepera' } }],
  [{ customers: null, addresses: {} }], // sense adreça: s'ha de filtrar
];
const stops = buildRouteWaypoints(readyGroups);
assert.strictEqual(stops.length, 2, 'la parada sense adreça s\'ha de descartar');
assert.strictEqual(stops[0].label, 'Anna');

const multiUrl = buildMultiStopMapsUrl('Origen, Matadepera', stops);
assert.ok(multiUrl.includes('origin=' + encodeURIComponent('Origen, Matadepera')));
assert.ok(multiUrl.includes('waypoints=' + encodeURIComponent(stops[0].address)));
assert.ok(multiUrl.includes('destination=' + encodeURIComponent(stops[1].address)));

console.log('Task 3 logic OK');
```

Run: `node C:\Users\nacho\AppData\Local\Temp\claude\verify-task3.js`
Expected: `Task 3 logic OK`.

- [ ] **Step 2: Afegir el loader oficial de Google Maps a `<head>`**

A `cocina.html`, just abans de `</head>` (després de la línia amb `theme-color`/`color-scheme`, abans de `<script src="https://cdn.tailwindcss.com">`), afegeix:

```html
  <!-- ════ GOOGLE MAPS LOADER (bootstrap oficial, mateixa clau que pre-pedido.html) ════ -->
  <script>
    const GOOGLE_MAPS_API_KEY = 'AIzaSyAkJQwY4LDMU-VwH0k_qG3O0-2IrQTWQsA';
    (g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
      key: GOOGLE_MAPS_API_KEY,
      v: "weekly",
    });
  </script>
```

- [ ] **Step 3: Afegir les funcions de ruta i navegació dins de `<script type="module">`**

Just abans de `function escapeHtml(s) {` (definida a Task 1/original), afegeix:

```js
    // ── Navegació del repartidor: adreces i enllaços de mapes ──
    const KITCHEN_ORIGIN = "Carrer Coll d'Estenalles 24, 08230 Matadepera, Barcelona";

    function formatAddress(order) {
      const addr = order.addresses || {};
      const line1 = [addr.street, addr.floor].filter(Boolean).join(', ');
      const line2 = [addr.postal_code, addr.city].filter(Boolean).join(' ');
      return [line1, line2].filter(Boolean).join(', ');
    }
    function buildMapsUrl(address) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
    }
    function buildWazeUrl(address) {
      return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    }
    function buildRouteWaypoints(readyGroups) {
      return readyGroups
        .map(group => ({
          label: (group[0].customers && group[0].customers.name) || 'Client',
          address: formatAddress(group[0]),
        }))
        .filter(w => w.address.trim().length > 0);
    }
    function buildMultiStopMapsUrl(origin, orderedStops) {
      const originParam = encodeURIComponent(origin);
      const destination = encodeURIComponent(orderedStops[orderedStops.length - 1].address);
      const waypointsParam = orderedStops.slice(0, -1).map(s => encodeURIComponent(s.address)).join('|');
      let url = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destination}&travelmode=driving`;
      if (waypointsParam) url += `&waypoints=${waypointsParam}`;
      return url;
    }

    let _routesLib = null;
    async function _getRoutesLib() {
      if (!_routesLib) _routesLib = await google.maps.importLibrary('routes');
      return _routesLib;
    }

    // Calcula i mostra la ruta optimitzada entre les comandes de la columna
    // "Llest" quan n'hi ha 2 o més a la vegada. Amb 0 o 1 no hi ha res a
    // optimitzar — el panell es queda amagat. Si Google falla (adreça no
    // localitzable, quota, sense connexió...) es mostra un avís curt i es
    // continua funcionant amb la navegació individual de cada targeta —
    // això mai bloqueja marcar comandes com llestes/entregades.
    async function renderRoutePanel(readyGroups) {
      const panel = document.getElementById('route-panel');
      const stops = buildRouteWaypoints(readyGroups);
      if (stops.length < 2) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }

      panel.classList.remove('hidden');
      panel.innerHTML = '<p class="text-xs text-[#8B93A1]">Calculant ruta...</p>';

      try {
        const { DirectionsService } = await _getRoutesLib();
        const svc = new DirectionsService();
        const waypoints = stops.slice(0, -1).map(s => ({ location: s.address, stopover: true }));
        const result = await svc.route({
          origin: KITCHEN_ORIGIN,
          destination: stops[stops.length - 1].address,
          waypoints,
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING,
        });
        const order = result.routes[0].waypoint_order;
        const orderedStops = [...order.map(i => stops[i]), stops[stops.length - 1]];
        const listHtml = orderedStops.map((s, i) => `<li>${i + 1}. ${escapeHtml(s.label)} — ${escapeHtml(s.address)}</li>`).join('');
        const mapsUrl = buildMultiStopMapsUrl(KITCHEN_ORIGIN, orderedStops);
        panel.innerHTML = `
          <div class="bg-[#16A34A]/10 border border-[#16A34A]/30 rounded-xl p-3 space-y-2">
            <p class="text-xs font-bold uppercase tracking-wide text-[#16A34A]">Ruta suggerida</p>
            <ol class="text-sm space-y-1 list-none">${listHtml}</ol>
            <a href="${mapsUrl}" target="_blank" class="block text-center py-2.5 rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white font-semibold text-sm transition-all">🗺️ Navegar ruta completa</a>
          </div>`;
      } catch (e) {
        console.error('[route]', e);
        panel.innerHTML = '<p class="text-xs text-[#DC2626]">No s\'ha pogut calcular la ruta — utilitza la navegació individual de cada comanda.</p>';
      }
    }
```

- [ ] **Step 4: Afegir els botons de Maps/Waze a `renderOrderCard` quan l'etapa és "ready"**

Dins `renderOrderCard`, substitueix el final de la funció (el bloc que ja existeix):

```js
            ${isGroup ? `
              <div class="border-t border-[#E5E7EB] pt-3 flex items-center justify-between text-sm">
                <span class="text-[#4B5563] font-semibold">Total combinat</span>
                <span class="font-black text-lg">${fmt(grandTotal)}</span>
              </div>
            ` : ''}
            ${allSameStatus ? `<div class="border-t border-[#E5E7EB] pt-3">${actionsRow(group.map(o => o.id), stage, 'lg')}</div>` : ''}
          </div>
        </div>
      `;
    }
```

Per:

```js
            ${isGroup ? `
              <div class="border-t border-[#E5E7EB] pt-3 flex items-center justify-between text-sm">
                <span class="text-[#4B5563] font-semibold">Total combinat</span>
                <span class="font-black text-lg">${fmt(grandTotal)}</span>
              </div>
            ` : ''}
            ${stage === 'ready' ? `
              <div class="flex gap-2 pt-1">
                <a href="${buildMapsUrl(formatAddress(first))}" target="_blank" class="flex-1 text-center py-2 rounded-lg border border-[#D1D5DB] text-sm font-semibold hover:border-[#2563EB]/40 hover:text-[#2563EB] transition-all">🗺️ Maps</a>
                <a href="${buildWazeUrl(formatAddress(first))}" target="_blank" class="flex-1 text-center py-2 rounded-lg border border-[#D1D5DB] text-sm font-semibold hover:border-[#2563EB]/40 hover:text-[#2563EB] transition-all">🚗 Waze</a>
              </div>
            ` : ''}
            ${allSameStatus ? `<div class="border-t border-[#E5E7EB] pt-3">${actionsRow(group.map(o => o.id), stage, 'lg')}</div>` : ''}
          </div>
        </div>
      `;
    }
```

- [ ] **Step 5: Cridar `renderRoutePanel` des de `renderOrders`**

Al final de `renderOrders` (just abans del `}` de tancament de la funció), afegeix la crida:

```js
      document.getElementById('col-ready').innerHTML     = renderColumnWithTimeHeaders(readyGroups);
      renderRoutePanel(readyGroups);
    }
```

(Substitueix la línia `document.getElementById('col-ready')...` existent per aquestes dues línies juntes — `renderRoutePanel` és `async` però no cal `await` aquí: `renderOrders` és síncrona i cridada sovint (cada canvi de Realtime); deixem que el panell de ruta s'actualitzi en segon pla sense bloquejar el render de les targetes.)

- [ ] **Step 6: Comprovar la sintaxi de tot el fitxer**

Mateixa comanda del Step 7 de Task 1. Expected: `syntax OK`.

- [ ] **Step 7: Commit**

```bash
git add cocina.html
git commit -m "feat(cocina): navegació Maps/Waze i ruta optimitzada per al repartidor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Verificació manual (requereix navegador + dades reals — no automatitzable)**

1. Obre `cocina.html`, entra amb les credencials de cuina.
2. Marca 2-3 comandes de prova (amb adreces reals de Matadepera) fins a "Llest".
3. Confirma que apareix el panell "Ruta suggerida" amb una llista numerada i el botó "Navegar ruta completa".
4. Clica el botó — confirma que Google Maps s'obre amb totes les parades carregades.
5. En una sola comanda a "Llest", confirma que el panell de ruta NO apareix, però els botons individuals 🗺️/🚗 sí.
6. Prova els botons individuals des d'un mòbil real — confirma que obren l'app corresponent amb l'adreça correcta.

---

### Task 4: Avís sonor quan arriba una comanda nova

**Files:**
- Modify: `cocina.html` (nova funció `playNewOrderSound`, nova funció `detectNewPendingOrders`, modificar `loadOrders`)

**Interfaces:**
- Consumes: cap (independent de les altres tasques).
- Produces: cap altra tasca en depèn.

- [ ] **Step 1: Verificar en Node la detecció de comandes noves abans de tocar el fitxer**

Crea `C:\Users\nacho\AppData\Local\Temp\claude\verify-task4.js`:

```js
function detectNewPendingOrders(newOrders, seenIds) {
  const newIds = newOrders.filter(o => o.status === 'pending' && !seenIds.has(o.id)).map(o => o.id);
  newOrders.forEach(o => seenIds.add(o.id));
  return newIds;
}

const assert = require('assert');
const seen = new Set();

// Primera càrrega: 2 comandes pending existents.
let result = detectNewPendingOrders([{ id: 'a', status: 'pending' }, { id: 'b', status: 'preparing' }], seen);
assert.deepStrictEqual(result, ['a']);
assert.ok(seen.has('a') && seen.has('b'));

// Segona càrrega: mateixes 2 + una de nova pending.
result = detectNewPendingOrders([{ id: 'a', status: 'pending' }, { id: 'b', status: 'preparing' }, { id: 'c', status: 'pending' }], seen);
assert.deepStrictEqual(result, ['c'], 'només "c" és nova, "a" ja s\'havia vist');

// Tercera càrrega: cap de nova.
result = detectNewPendingOrders([{ id: 'a', status: 'pending' }, { id: 'c', status: 'pending' }], seen);
assert.deepStrictEqual(result, []);

console.log('Task 4 logic OK');
```

Run: `node C:\Users\nacho\AppData\Local\Temp\claude\verify-task4.js`
Expected: `Task 4 logic OK`.

- [ ] **Step 2: Afegir `playNewOrderSound` i `detectNewPendingOrders` a cocina.html**

Just abans de `async function loadOrders() {`, afegeix:

```js
    // Avís sonor quan arriba una comanda nova a "Sense afegir" — generat amb
    // Web Audio API (dos tons curts), sense necessitar cap fitxer d'àudio.
    // En alguns mòbils (sobretot iPhone/Safari) el navegador bloqueja l'àudio
    // fins que hi ha hagut una interacció prèvia amb la pàgina — si falla,
    // ho ignorem en silenci, mai talla el funcionament del tauler.
    function playNewOrderSound() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const tone = (freq, delay) => setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        }, delay);
        tone(880, 0);
        tone(1175, 180);
      } catch (e) { /* àudio bloquejat o no suportat — silenci */ }
    }

    // Compara les comandes rebudes contra les ja vistes en aquesta sessió de
    // pàgina i retorna els IDs de comandes "pending" genuïnament noves.
    // Muta `seenIds` afegint-hi totes les IDs rebudes (noves i ja vistes).
    function detectNewPendingOrders(newOrders, seenIds) {
      const newIds = newOrders.filter(o => o.status === 'pending' && !seenIds.has(o.id)).map(o => o.id);
      newOrders.forEach(o => seenIds.add(o.id));
      return newIds;
    }

    const _seenOrderIds = new Set();
```

- [ ] **Step 3: Cridar-ho des de `loadOrders`**

Substitueix:

```js
    async function loadOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name, phone, email), addresses(street, floor, postal_code, city, notes), order_items(*)')
        .order('created_at', { ascending: true });
      if (error) { console.error(error); return; }
      ordersCache = data || [];
      renderOrders();
    }
```

Per:

```js
    async function loadOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*, customers(name, phone, email), addresses(street, floor, postal_code, city, notes), order_items(*)')
        .order('created_at', { ascending: true });
      if (error) { console.error(error); return; }
      const isFirstLoad = _seenOrderIds.size === 0;
      const newIds = detectNewPendingOrders(data || [], _seenOrderIds);
      ordersCache = data || [];
      renderOrders();
      if (!isFirstLoad && newIds.length > 0) playNewOrderSound();
    }
```

- [ ] **Step 4: Comprovar la sintaxi de tot el fitxer**

Mateixa comanda del Step 7 de Task 1. Expected: `syntax OK`.

- [ ] **Step 5: Commit**

```bash
git add cocina.html
git commit -m "feat(cocina): avís sonor quan arriba una comanda nova

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Verificació manual (requereix navegador + una comanda real nova — no automatitzable)**

1. Obre `cocina.html` en una pestanya, entra amb les credencials.
2. Sense recarregar la pàgina, fes un pedido de prova des de `pedido.html` en una altra pestanya.
3. Confirma que sona el to a `cocina.html` quan arriba (pot caldre haver clicat abans a qualsevol lloc de la pàgina de cuina perquè el navegador permeti l'àudio).
4. Recarrega `cocina.html` amb comandes ja existents — confirma que NO sona res a la primera càrrega.

---

### Task 5: Accessos ràpids a cada columna en mòbil

**Files:**
- Modify: `cocina.html:45-60` (bloc `<header>`)

**Interfaces:**
- Consumes: `#section-pending`, `#section-preparing`, `#section-ready` (Task 1).
- Produces: cap.

- [ ] **Step 1: Reestructurar el `<header>` amb la barra d'accessos ràpids**

Substitueix el bloc `<header>` complet (línies 45-60 actuals):

```html
    <header class="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-[#15181D] border-b border-white/8">
      <div class="flex items-center gap-3">
        <h1 class="font-black tracking-tight text-2xl">Comandes</h1>
        <span id="order-count" class="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold"></span>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 pr-3 border-r border-white/10">
          <button onclick="setDateScope('today')" id="scope-today" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 transition-all">Avui (pase)</button>
          <button onclick="setDateScope('week')" id="scope-week" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 transition-all">Setmana</button>
        </div>
        <button onclick="openHistory()" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 hover:bg-white/5 transition-all">Historial</button>
        <button onclick="doLogout()" class="px-4 py-2 rounded-lg text-sm font-semibold text-[#8B93A1] hover:text-[#E8EAED] transition-colors">
          Sortir
        </button>
      </div>
    </header>
```

Per:

```html
    <header class="sticky top-0 z-20 bg-[#15181D] border-b border-white/8">
      <div class="flex items-center justify-between px-6 py-4">
        <div class="flex items-center gap-3">
          <h1 class="font-black tracking-tight text-2xl">Comandes</h1>
          <span id="order-count" class="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold"></span>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 pr-3 border-r border-white/10">
            <button onclick="setDateScope('today')" id="scope-today" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 transition-all">Avui (pase)</button>
            <button onclick="setDateScope('week')" id="scope-week" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 transition-all">Setmana</button>
          </div>
          <button onclick="openHistory()" class="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 hover:bg-white/5 transition-all">Historial</button>
          <button onclick="doLogout()" class="px-4 py-2 rounded-lg text-sm font-semibold text-[#8B93A1] hover:text-[#E8EAED] transition-colors">
            Sortir
          </button>
        </div>
      </div>
      <div class="md:hidden flex gap-2 px-6 pb-3 overflow-x-auto">
        <a href="#section-pending" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F59E0B]/15 text-[#F59E0B]">Sense afegir</a>
        <a href="#section-preparing" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#3B82F6]/15 text-[#3B82F6]">Preparant</a>
        <a href="#section-ready" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#16A34A]/15 text-[#16A34A]">Llest</a>
      </div>
    </header>
```

- [ ] **Step 2: Comprovar la sintaxi de tot el fitxer**

Mateixa comanda del Step 7 de Task 1. Expected: `syntax OK`.

- [ ] **Step 3: Commit**

```bash
git add cocina.html
git commit -m "feat(cocina): accessos ràpids a cada columna en mòbil

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verificació manual (requereix navegador amb amplada mòbil — no automatitzable)**

1. Obre `cocina.html` amb les eines de desenvolupador en mode mòbil (o en un mòbil real).
2. Confirma que la barra "Sense afegir / Preparant / Llest" apareix sota el títol i és desplaçable horitzontalment si cal.
3. Clica cada botó — confirma que la pàgina salta directament a la columna corresponent.
4. Confirma que en pantalla d'escriptori (ample ≥ 768px) la barra NO es mostra.

---

## Desplegament final

`cocina.html` és un fitxer estàtic servit per Vercel des del mateix repositori que la resta del lloc — un `git push origin main` després de l'últim commit ja el publica, sense cap pas addicional a Supabase (no es toca cap Edge Function ni taula).

- [ ] Fer `git push origin main` un cop totes les tasques estiguin comitejades.
- [ ] Confirmar en producció (`https://micsasff.com/cocina.html`) que el canvi ha arribat, amb la mateixa comprovació de desplegament fet servir durant tota la sessió (petició HTTP sense caché, comprovar que el contingut inclou algun marcador del canvi nou, p. ex. `id="section-ready"`).
