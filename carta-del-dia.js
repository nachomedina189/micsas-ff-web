/* Carta del dia: pizzes i begudes que cuina ha apagat a cocina.html i que
   no es poden demanar. Ho decideix get_menu_availability a Supabase (el
   mateix que fa servir place-order per rebutjar-les).

   - window.fetchMenuOff(dataISO) → Promise<{ id: { until_notice, missing } }>
     Si la consulta falla, torna {}: la web no amaga res i place-order ho
     torna a comprovar igualment.
   - A les pàgines amb targetes de pizza (.pizza-grid-card[data-id] a
     menu.html, [data-menu-id] a carta.html) les marca soles per al proper
     dia de servei: "Tornem aviat!" si és fins a nou avís, "Exhaurida avui"
     si només és d'aquell dia. Ho torna a mirar cada 30 s. */
(function () {
  var URL = 'https://mbcssuvitqgrdqahqomc.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3NzdXZpdHFncmRxYWhxb21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTc1MTIsImV4cCI6MjA5NTQ3MzUxMn0.LkVkXzKjTgLYZSpxWLcdA4-COdDoAnWrSqnwAbtmTaU';

  window.fetchMenuOff = function (date) {
    return fetch(URL + '/rest/v1/rpc/get_menu_availability', {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_delivery_date: date })
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
      var off = {};
      (Array.isArray(rows) ? rows : []).forEach(function (r) { off[r.product_id] = r; });
      return off;
    }).catch(function () { return {}; });
  };

  var cards = document.querySelectorAll('.pizza-grid-card[data-id], [data-menu-id]');
  if (!cards.length) return;

  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Proper divendres o diumenge; avui compta només abans de l'última franja
  // (mateix criteri que el comptador de pizzes de menu.html).
  function nextServiceDate() {
    var d = new Date();
    if (d.getHours() * 60 + d.getMinutes() >= 22 * 60 + 30) d.setDate(d.getDate() + 1);
    for (var i = 0; i < 7; i++) {
      if (d.getDay() === 5 || d.getDay() === 0) return d;
      d.setDate(d.getDate() + 1);
    }
    return d;
  }
  var DAYS = {
    ca: ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'],
    es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  };
  function stampText(o, d) {
    var es = false;
    try { es = localStorage.getItem('micsas_lang') === 'es'; } catch (e) {}
    if (o.until_notice) return es ? '¡Volvemos<br>pronto!' : 'Tornem<br>aviat!';
    var when = iso(d) === iso(new Date()) ? (es ? 'hoy' : 'avui') : (es ? 'el ' : '') + DAYS[es ? 'es' : 'ca'][d.getDay()];
    return (es ? 'Agotada' : 'Exhaurida') + '<br>' + when;
  }

  function apply(off, d) {
    cards.forEach(function (card) {
      var o = off[card.getAttribute('data-menu-id') || card.getAttribute('data-id')];
      var host = card.querySelector('.pizza-card-front') || card;
      var stamp = host.querySelector(':scope > .menu-off-stamp');
      card.classList.toggle('menu-off', !!o);
      if (!o) { if (stamp) stamp.remove(); return; }
      if (!stamp) {
        stamp = document.createElement('div');
        stamp.className = 'menu-off-stamp';
        host.appendChild(stamp);
      }
      stamp.innerHTML = stampText(o, d);
    });
  }

  function load() {
    var d = nextServiceDate();
    window.fetchMenuOff(iso(d)).then(function (off) { apply(off, d); });
  }
  load();
  setInterval(load, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
