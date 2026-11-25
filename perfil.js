// "Perfil sense compte": després d'una comanda, aquest dispositiu recorda
// nom, contacte, adreça i l'última comanda per poder repetir-la amb un toc.
// Només es desa al navegador del client (localStorage); "No sóc jo" ho esborra.
(function () {
  var KEY = 'micsas_perfil', PENDING = 'micsas_perfil_pending';
  function read(store, k) { try { var p = JSON.parse(store.getItem(k) || 'null'); return p && p.v === 1 ? p : null; } catch (_) { return null; } }
  window.MicsasPerfil = {
    get: function () { return read(localStorage, KEY); },
    // Es prepara en crear la comanda i es confirma quan el pagament ha anat bé.
    stash: function (d, cart) {
      try {
        sessionStorage.setItem(PENDING, JSON.stringify({
          v: 1,
          firstName: d.firstName || '', lastName: d.lastName || '', name: d.name || '', email: d.email || '', phone: d.phone || '',
          address: { street: d.street || '', floor: d.floor || '', zip: d.postalCode || '', city: d.city || '',
                     lat: typeof d.lat === 'number' ? d.lat : null, lng: typeof d.lng === 'number' ? d.lng : null },
          last: { items: (cart || []).map(function (i) { return { id: i.id, name: i.name, price: i.price, qty: i.qty, note: i.note || '' }; }), total: d.total || null },
        }));
      } catch (_) {}
    },
    commit: function () {
      var p = read(sessionStorage, PENDING);
      if (!p) return;
      try {
        p.savedAt = new Date().toISOString();
        localStorage.setItem(KEY, JSON.stringify(p));
        localStorage.setItem('micsas_guest', JSON.stringify({ name: p.name, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone }));
        sessionStorage.removeItem(PENDING);
      } catch (_) {}
    },
    forget: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem('micsas_guest'); sessionStorage.removeItem(PENDING); } catch (_) {}
    },
  };
})();
