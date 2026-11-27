// Desplaçament suau (Lenis) a tota la web de clients.
// · Només amb roda i trackpad; al mòbil el dit fa servir el desplaçament natiu.
// · Sense interruptor: s'apaga sol si el client té "reduir moviment".
// · Mentre un menú, la cistella o el pagament bloquegen la pàgina
//   (body overflow:hidden), la pàgina de darrere no es mou.
// · Si Lenis no carrega (CDN caigut), la web funciona amb el desplaçament normal.
(function () {
  var st = document.createElement('style');
  st.textContent = 'html.lenis,html.lenis body{height:auto}html.lenis{scroll-behavior:auto!important}' +
    '.lenis:not(.lenis-autoToggle).lenis-stopped{overflow:clip}.lenis [data-lenis-prevent]{overscroll-behavior:contain}';
  document.head.appendChild(st);

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  // Mòbils i tauletes (només dit): Lenis no hi fa res però tenia un bucle
  // a cada frame; millor no engegar-lo i deixar el scroll natiu tot sol.
  var touchOnly = matchMedia('(hover: none) and (pointer: coarse)');
  var lenis = null;
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 4); };

  function locked() {
    var b = document.body;
    return !!b && (b.style.overflow === 'hidden' || getComputedStyle(b).overflowY === 'hidden');
  }
  function syncLock() { if (lenis) { locked() ? lenis.stop() : lenis.start(); } }
  function setSmooth(on) {
    if (on && !lenis && window.Lenis) {
      lenis = new Lenis({ autoRaf: true, lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false, allowNestedScroll: true });
      syncLock();
    } else if (!on && lenis) { lenis.destroy(); lenis = null; }
  }
  // Hueco de la capçalera fixa: només amb scroll-padding-top (Lenis el suma).
  function headerGap() {
    var nav = document.querySelector('nav.fixed, header.fixed, #navbar');
    if (nav && getComputedStyle(nav).position === 'fixed') document.documentElement.style.scrollPaddingTop = (nav.offsetHeight + 16) + 'px';
  }

  // Per a menú, logo i botons: baixa amb la mateixa corba i passa el focus.
  window.micsasScrollTo = function (el) {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: 1.2, easing: easeOut, force: true });
    else el.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
    if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  // Enllaços interns que la pàgina no gestiona ella mateixa.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    var target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    window.micsasScrollTo(target);
    if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  });

  function init() {
    headerGap();
    setSmooth(!reduce.matches && !touchOnly.matches);
    if (document.body) new MutationObserver(syncLock).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  if (reduce.addEventListener) reduce.addEventListener('change', function () { setSmooth(!reduce.matches && !touchOnly.matches); });
  addEventListener('resize', headerGap);
})();
