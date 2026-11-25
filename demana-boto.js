// Botó "Demana ja!" que canvia segons l'hora (carta.html i menu.html).
//  · Dv/Dg abans de les 20:00 → "Demana per a avui"
//  · Dv/Dg de 20:00 a 22:15   → "Demana ja!"
//  · Tancat o esgotat avui    → "Reserva per divendres/diumenge"
// L'estat de pizzes el dona pizza-counter.js (event "micsas:pizza-status").
(function () {
  var TXT = {
    ca: { now: 'Demana ja! →', today: 'Demana per a avui →', reserve: 'Reserva per {d} →', days: { 5: 'divendres', 0: 'diumenge' } },
    es: { now: '¡Pide ya! →', today: 'Pide para hoy →', reserve: 'Reserva para el {d} →', days: { 5: 'viernes', 0: 'domingo' } },
  };
  var OPEN = 20 * 60, CUTOFF = 22 * 60 + 15;   // mateix tall que pizza-counter.js
  var soldOutDate = null;                       // 'AAAA-MM-DD' esgotat
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function isService(d) { return d.getDay() === 5 || d.getDay() === 0; }
  function nextServiceAfterToday() {
    var d = new Date(); d.setDate(d.getDate() + 1);
    while (!isService(d)) d.setDate(d.getDate() + 1);
    return d;
  }
  function label() {
    var lang = (localStorage.getItem('micsas_lang') || document.documentElement.lang || 'ca') === 'es' ? 'es' : 'ca';
    var T = TXT[lang], now = new Date(), min = now.getHours() * 60 + now.getMinutes();
    if (isService(now) && min < CUTOFF && soldOutDate !== iso(now)) return min >= OPEN ? T.now : T.today;
    return T.reserve.replace('{d}', T.days[nextServiceAfterToday().getDay()]);
  }
  function paint() {
    var text = label();
    document.querySelectorAll('[data-i18n="demana"]').forEach(function (el) {
      var arrow = el.querySelector('.arrow');
      if (arrow) {   // conserva la fletxa animada
        el.firstChild.nodeType === 3 ? (el.firstChild.nodeValue = text.replace(/ →$/, ' ')) : el.insertBefore(document.createTextNode(text.replace(/ →$/, ' ')), arrow);
      } else el.textContent = text;
    });
  }
  // Després de canviar d'idioma (i18n.js reescriu el text), es torna a pintar.
  var orig = window.applyLang;
  if (typeof orig === 'function') window.applyLang = function () { var r = orig.apply(this, arguments); paint(); return r; };
  document.addEventListener('micsas:pizza-status', function (e) {
    var st = e.detail && e.detail.status;
    soldOutDate = st && st.status === 'soldout' ? e.detail.date : null;
    paint();
  });
  paint();
  setInterval(paint, 60000);
})();
