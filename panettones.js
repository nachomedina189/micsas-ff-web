// Especial Nadal: catàleg de panettones, estoc en directe i cistella.
// Ho fan servir nadal.html (la prestatgeria) i pedido.html (la comanda).
//
// El preu, el nom de la comanda i les unitats que queden els decideix
// SEMPRE Supabase (taula panettones, funció get_panettone_stock); aquí
// només hi ha el que cal per pintar-los (textos, fotos, colors). place-order
// torna a comprovar l'estoc amb un bloqueig, així que dues persones no poden
// comprar l'últim panettone alhora.
//
// window.MicsasNadal:
//   items, byId(id), t(obj), lang()
//   refresh(), onChange(fn) → l'estoc es torna a llegir cada 20 s
//   remaining(id) → null (sense unitats posades), 0 (esgotat) o N
//   status(id)    → 'soon' | 'soldout' | 'few' | 'ok'
//   deliveryDate  → 'YYYY-MM-DD' o null (data per confirmar)
//   cart.*        → cistella de nadal.html (localStorage)
//   checkout(delivery) → passa la cistella a pre-pedido/pedido
(function () {
  var URL = 'https://mbcssuvitqgrdqahqomc.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3NzdXZpdHFncmRxYWhxb21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTc1MTIsImV4cCI6MjA5NTQ3MzUxMn0.LkVkXzKjTgLYZSpxWLcdA4-COdDoAnWrSqnwAbtmTaU';
  var CART_KEY = 'micsas_nadal_cart';
  var CHECKOUT_KEY = 'micsas_nadal_checkout';
  var FEW = 5; // a partir d'aquí es diu "Últimes unitats"

  // Mateixos ids que la taula panettones (i que les línies de comanda).
  var ITEMS = [
    {
      id: 'pn-tradicional', price: 32, color: '#6B2FD0', img: 'images/nadal/panettone-tradicional',
      name: { ca: 'Tradicional', es: 'Tradicional' },
      order: 'Panettone Tradicional',
      tag: { ca: 'Panses i taronja confitada', es: 'Pasas y naranja confitada' },
      desc: {
        ca: 'El clàssic de Nadal: massa de fermentació lenta, molt esponjosa, amb panses i daus de taronja confitada.',
        es: 'El clásico de Navidad: masa de fermentación lenta, muy esponjosa, con pasas y dados de naranja confitada.'
      },
      allergens: { ca: 'Gluten, ou i llet.', es: 'Gluten, huevo y leche.' }
    },
    {
      id: 'pn-festuc', price: 37, color: '#6E9B2F', img: 'images/nadal/panettone-festuc',
      name: { ca: 'Festuc', es: 'Pistacho' },
      order: 'Panettone Festuc',
      tag: { ca: 'Glaçat i crema de festuc', es: 'Glaseado y crema de pistacho' },
      desc: {
        ca: 'Coberta blanca amb festuc picat i farcit de crema de festuc. El més golós de la prestatgeria.',
        es: 'Cobertura blanca con pistacho picado y relleno de crema de pistacho. El más goloso de la estantería.'
      },
      allergens: { ca: 'Gluten, ou, llet i fruits secs (festuc).', es: 'Gluten, huevo, leche y frutos secos (pistacho).' }
    },
    {
      id: 'pn-xocolata', price: 33, color: '#1F5FB0', img: 'images/nadal/panettone-xocolata',
      name: { ca: 'Xocolata siciliana', es: 'Chocolate siciliano' },
      order: 'Panettone Xocolata siciliana',
      tag: { ca: 'Banyat de xocolata negra', es: 'Bañado en chocolate negro' },
      desc: {
        ca: 'Massa amb trossos de xocolata, banyada de xocolata negra i acabada amb fideus de xocolata.',
        es: 'Masa con trozos de chocolate, bañada en chocolate negro y terminada con fideos de chocolate.'
      },
      allergens: { ca: 'Gluten, ou i llet.', es: 'Gluten, huevo y leche.' }
    },
    {
      id: 'pn-gotes', price: 33, color: '#E0731C', img: 'images/nadal/panettone-gotes',
      name: { ca: 'Gotes de xocolata', es: 'Gotas de chocolate' },
      order: 'Panettone Gotes de xocolata',
      tag: { ca: 'Massa daurada amb gotes de xocolata', es: 'Masa dorada con gotas de chocolate' },
      desc: {
        ca: 'Massa daurada plena de gotes de xocolata, coberta de xocolata i fideus de xocolata.',
        es: 'Masa dorada llena de gotas de chocolate, cubierta de chocolate y fideos de chocolate.'
      },
      allergens: { ca: 'Gluten, ou i llet.', es: 'Gluten, huevo y leche.' }
    }
  ];
  var byId = {};
  ITEMS.forEach(function (it) { byId[it.id] = it; });

  function lang() {
    var l = '';
    try { l = localStorage.getItem('micsas_lang') || ''; } catch (e) {}
    return l === 'es' ? 'es' : 'ca';
  }
  function t(obj) { return obj == null ? '' : (typeof obj === 'string' ? obj : (obj[lang()] || obj.ca || '')); }

  // ── Estoc ────────────────────────────────────────────────────────────
  var state = { loaded: false, failed: false, stock: {}, deliveryDate: null };
  var listeners = [];
  function emit() {
    listeners.forEach(function (fn) { try { fn(api); } catch (e) { console.error(e); } });
    document.dispatchEvent(new CustomEvent('micsas:panettones', { detail: api }));
  }

  var inflight = null;
  function refresh() {
    if (inflight) return inflight;
    inflight = fetch(URL + '/rest/v1/rpc/get_panettone_stock', {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var stock = {};
      ((data && data.items) || []).forEach(function (row) {
        stock[row.id] = {
          remaining: row.remaining == null ? null : Math.max(0, Number(row.remaining) || 0),
          active: row.active !== false,
          price: Number(row.price) || null
        };
      });
      state.stock = stock;
      state.deliveryDate = (data && data.delivery_date) || null;
      state.loaded = true;
      state.failed = false;
      clampCart();
      emit();
    }).catch(function (err) {
      console.warn('[panettones] estoc', err);
      state.failed = true;
      if (!state.loaded) emit();
    }).then(function () { inflight = null; });
    return inflight;
  }

  function remaining(id) {
    var s = state.stock[id];
    if (!s || !s.active) return s ? 0 : null;
    return s.remaining;
  }
  function status(id) {
    if (!state.loaded) return 'soon';
    var r = remaining(id);
    if (r == null) return 'soon';
    if (r <= 0) return 'soldout';
    if (r <= FEW) return 'few';
    return 'ok';
  }
  function price(id) {
    var s = state.stock[id];
    return (s && s.price) || (byId[id] && byId[id].price) || 0;
  }

  // ── Cistella (només nadal.html; pedido.html té la seva) ─────────────
  function readCart() {
    try {
      var c = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      // Una cistella oblidada fa més de 3 dies no es recupera.
      if (c && c.v === 1 && Date.now() - (c.at || 0) < 3 * 864e5) return c;
    } catch (e) {}
    return { v: 1, items: {}, delivery: 'order', at: Date.now() };
  }
  var cart = readCart();
  function saveCart() {
    cart.at = Date.now();
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('micsas:nadal-cart', { detail: api }));
  }
  function maxQty(id) {
    var r = remaining(id);
    return r == null ? 0 : Math.min(r, 10);
  }
  function clampCart() {
    var changed = false;
    Object.keys(cart.items).forEach(function (id) {
      if (!byId[id]) { delete cart.items[id]; changed = true; return; }
      var max = maxQty(id);
      if (cart.items[id] > max) { cart.items[id] = max; changed = true; }
      if (cart.items[id] <= 0) { delete cart.items[id]; changed = true; }
    });
    if (changed) saveCart();
  }
  var cartApi = {
    lines: function () {
      return ITEMS.filter(function (it) { return cart.items[it.id] > 0; })
        .map(function (it) { return { id: it.id, qty: cart.items[it.id] }; });
    },
    qty: function (id) { return cart.items[id] || 0; },
    set: function (id, qty) {
      if (!byId[id]) return 0;
      var q = Math.max(0, Math.min(maxQty(id), Math.floor(qty) || 0));
      if (q) cart.items[id] = q; else delete cart.items[id];
      saveCart();
      return q;
    },
    add: function (id, n) { return cartApi.set(id, cartApi.qty(id) + (n || 1)); },
    clear: function () { cart.items = {}; saveCart(); },
    count: function () { return cartApi.lines().reduce(function (s, l) { return s + l.qty; }, 0); },
    total: function () { return cartApi.lines().reduce(function (s, l) { return s + l.qty * price(l.id); }, 0); },
    delivery: function () { return cart.delivery === 'panettone_day' ? 'panettone_day' : 'order'; },
    setDelivery: function (v) { cart.delivery = v === 'panettone_day' ? 'panettone_day' : 'order'; saveCart(); }
  };

  // Passa la cistella al flux de comanda de sempre: pre-pedido (adreça i,
  // si cal, dia i hora) → pedido (dades i pagament). Amb "dia d'entrega de
  // panettones" pre-pedido només demana l'adreça.
  function checkout() {
    var lines = cartApi.lines();
    if (!lines.length) return false;
    var delivery = cartApi.delivery();
    try {
      sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ v: 1, items: lines, delivery: delivery, at: Date.now() }));
    } catch (e) { return false; }
    location.href = delivery === 'panettone_day' ? 'pre-pedido.html?entrega=panettones' : 'pre-pedido.html';
    return true;
  }
  function takeCheckout() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || 'null');
      if (c && c.v === 1 && Array.isArray(c.items) && Date.now() - (c.at || 0) < 6 * 3600e3) return c;
    } catch (e) {}
    return null;
  }
  function clearCheckout() {
    try { sessionStorage.removeItem(CHECKOUT_KEY); } catch (e) {}
    cart.items = {};
    saveCart();
  }

  function fmtPrice(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',').replace(',00', '');
    return s + ' €';
  }
  var MONTHS = { ca: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'],
                 es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] };
  var DAYS = { ca: ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'],
               es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] };
  // "dissabte 20 de desembre" / "sábado 20 de diciembre"; null → null
  function fmtDate(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    var l = lang(), m = MONTHS[l][d.getMonth()];
    var de = l === 'ca' ? (/^[aeiouà]/.test(m) ? "d'" : 'de ') : 'de ';
    return DAYS[l][d.getDay()] + ' ' + d.getDate() + ' ' + de + m;
  }

  var api = {
    items: ITEMS,
    byId: function (id) { return byId[id] || null; },
    isPanettoneId: function (id) { return typeof id === 'string' && id.indexOf('pn-') === 0; },
    lang: lang, t: t, fmtPrice: fmtPrice, fmtDate: fmtDate,
    refresh: refresh,
    onChange: function (fn) { listeners.push(fn); if (state.loaded || state.failed) fn(api); },
    remaining: remaining, status: status, price: price, maxQty: maxQty,
    get loaded() { return state.loaded; },
    get failed() { return state.failed; },
    get deliveryDate() { return state.deliveryDate; },
    cart: cartApi,
    checkout: checkout, takeCheckout: takeCheckout, clearCheckout: clearCheckout
  };
  window.MicsasNadal = api;

  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  // Una altra pestanya ha tocat la cistella.
  window.addEventListener('storage', function (e) {
    if (e.key === CART_KEY) { cart = readCart(); document.dispatchEvent(new CustomEvent('micsas:nadal-cart', { detail: api })); }
  });
})();
