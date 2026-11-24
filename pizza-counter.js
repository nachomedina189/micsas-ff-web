// Contador de pizzes del proper dia de servei (menu.html i carta.html). Pinta dins
// de #pizza-counter; només es mostra quan en queden poques, ho decideix la funció
// get_pizza_status de Supabase. Cal carregar abans pizza-badge.js.
(function () {
  var bar = document.getElementById('pizza-counter');
  if (!bar) return;
  var URL = 'https://mbcssuvitqgrdqahqomc.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iY3NzdXZpdHFncmRxYWhxb21jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTc1MTIsImV4cCI6MjA5NTQ3MzUxMn0.LkVkXzKjTgLYZSpxWLcdA4-COdDoAnWrSqnwAbtmTaU';
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  // Proper divendres o diumenge; avui compta només abans de l'última franja (22:30).
  function nextServiceDate() {
    var d = new Date();
    if (d.getHours() * 60 + d.getMinutes() >= 22 * 60 + 15) d.setDate(d.getDate() + 1);
    for (var i = 0; i < 7; i++) {
      if (d.getDay() === 5 || d.getDay() === 0) return d;
      d.setDate(d.getDate() + 1);
    }
    return d;
  }
  var DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
  function load() {
    var d = nextServiceDate();
    fetch(URL + '/rest/v1/rpc/get_pizza_status', {
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_delivery_date: iso(d) })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) {
      var st = Array.isArray(rows) ? rows[0] : rows;
      var today = iso(d) === iso(new Date());
      window.renderPizzaBadge(bar, st, today ? 'avui' : 'al ' + DAYS[d.getDay()]);
    }).catch(function () {});
  }
  load();
  setInterval(load, 60000);
})();

