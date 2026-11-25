// Portada: "Hola, Marta · Torna a demanar" per a qui ja ha fet una comanda
// des d'aquest dispositiu (perfil.js), i el vídeo de la moto (només es
// reprodueix quan es veu i si el client no té "reduir moviment").
(function () {
  var TXT = {
    ca: { hi: 'Hola, {n}!', last: "L'última vegada:", repeat: 'Repetir comanda', notme: 'No sóc jo' },
    es: { hi: '¡Hola, {n}!', last: 'La última vez:', repeat: 'Repetir pedido', notme: 'No soy yo' },
  };
  function lang() { return (localStorage.getItem('micsas_lang') || document.documentElement.lang) === 'es' ? 'es' : 'ca'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function renderWelcome() {
    var box = document.getElementById('benvinguda');
    if (!box) return;
    var p = window.MicsasPerfil && MicsasPerfil.get();
    var items = p && p.last && p.last.items || [];
    if (!p || !items.length) { box.hidden = true; box.innerHTML = ''; return; }
    var T = TXT[lang()];
    var name = (p.firstName || p.name || '').split(' ')[0];
    box.innerHTML =
      '<p class="font-bold text-[17px]">' + esc(name ? T.hi.replace('{n}', name) : T.hi.replace(', {n}', '').replace(' {n}', '')) + '</p>' +
      '<p class="text-sm opacity-90 mt-1">' + esc(T.last) + ' ' + items.map(function (i) { return esc(i.qty + '× ' + i.name); }).join(' · ') + '</p>' +
      '<div class="flex items-center justify-center gap-4 mt-3">' +
        '<button type="button" data-repeat class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-[#F2E6CE] text-[#F2E6CE] font-semibold text-[15px] hover:bg-[#F2E6CE] hover:text-[#c80a07] transition-colors">↻ ' + esc(T.repeat) + '</button>' +
        '<button type="button" data-notme class="text-xs underline underline-offset-2 opacity-80 hover:opacity-100">' + esc(T.notme) + '</button>' +
      '</div>';
    box.hidden = false;
    box.querySelector('[data-repeat]').onclick = function () {
      try { sessionStorage.setItem('micsas_repeat', JSON.stringify(items)); } catch (_) {}
      location.href = 'pre-pedido.html';
    };
    box.querySelector('[data-notme]').onclick = function () { MicsasPerfil.forget(); renderWelcome(); };
  }

  function setupVideo() {
    var v = document.getElementById('hero-moto');
    if (!v) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)');
    var visible = false;
    function sync() {
      if (reduce.matches || !visible) { v.pause(); return; }
      if (v.preload === 'none') v.preload = 'auto';
      var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }, { rootMargin: '150px' }).observe(v);
    } else { visible = true; sync(); }
    if (reduce.addEventListener) reduce.addEventListener('change', sync);
  }

  var orig = window.applyLang;
  if (typeof orig === 'function') window.applyLang = function () { var r = orig.apply(this, arguments); renderWelcome(); return r; };
  renderWelcome();
  setupVideo();
})();
