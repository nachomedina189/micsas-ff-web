/* pedido-pro.js — peces de presentació per a l'aspecte "delivery" de
   pedido.html (vegeu pedido-pro.css). Només afegeix elements visuals
   (xips, categories, passos, resum, segells de pagament segur): no canvia
   cap càlcul, validació ni la crida a Stripe. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  };

  // ── Xips d'informació sota el títol ──
  const h1 = $('body > section h1');
  if (h1 && !$('.pp-chips')) {
    h1.insertAdjacentHTML('afterend', `
      <div class="pp-chips">
        <span class="pp-chip">${svg(ICON.truck)}Enviament gratuït</span>
        <span class="pp-chip">${svg(ICON.tag)}Sense comanda mínima</span>
        <span class="pp-chip">${svg(ICON.clock)}Dv i Dg · 20:00 – 22:30</span>
        <span class="pp-chip">${svg(ICON.pin)}Matadepera</span>
      </div>`);
  }

  // ── Barra de categories amb scroll-spy ──
  const menuWrap = $('#menu-casa')?.closest('.max-w-6xl');
  if (menuWrap && !$('.pp-cats')) {
    const groups = $$(':scope > .mb-16', menuWrap);
    const nav = document.createElement('nav');
    nav.className = 'pp-cats';
    nav.setAttribute('aria-label', 'Categories');
    groups.forEach((g, i) => {
      g.id = g.id || 'cat-' + i;
      const a = document.createElement('a');
      a.href = '#' + g.id;
      a.textContent = $('h2', g)?.textContent.trim() || '';
      nav.appendChild(a);
    });
    menuWrap.prepend(nav);
    const links = $$('a', nav);
    const spy = () => {
      let cur = 0;
      groups.forEach((g, i) => { if (g.getBoundingClientRect().top < 160) cur = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === cur));
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }

  // ── Escriptori: la cistella és una columna fixa, no un calaix ──
  const lg = window.matchMedia('(min-width: 1024px)');
  if (typeof window.openCartDrawer === 'function') {
    const orig = window.openCartDrawer;
    window.openCartDrawer = function () { if (!lg.matches) return orig.apply(this, arguments); };
  }

  // ── Checkout: indicador de passos ──
  const header = $('#checkout-fullscreen > div > div:first-child');
  if (header && !$('.pp-steps')) {
    header.insertAdjacentHTML('afterend', `
      <div class="pp-steps" aria-hidden="true">
        <span class="pp-step" data-s="1"><i>1</i>Hora</span><span class="bar"></span>
        <span class="pp-step" data-s="2"><i>2</i>Dades</span><span class="bar"></span>
        <span class="pp-step" data-s="3"><i>3</i>Pagament</span>
      </div>`);
  }
  const visible = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
  function syncSteps() {
    const steps = $('.pp-steps');
    if (!steps) return;
    let cur = visible('cf-time-step') ? 1 : visible('cf-scroll') ? 2 : 0;
    if (visible('stripe-overlay')) cur = 3;
    if (visible('cf-success')) cur = 4;
    steps.style.display = cur === 4 ? 'none' : '';
    $$('.pp-step', steps).forEach((s) => {
      const n = +s.dataset.s;
      s.classList.toggle('on', n === cur);
      s.classList.toggle('done', n < cur);
      $('i', s).textContent = n < cur ? '✓' : n;
    });
  }

  // ── Checkout: resum del lliurament (dia, hora i adreça triats) ──
  const scrollInner = $('#cf-scroll > div');
  if (scrollInner && !$('.pp-recap')) {
    scrollInner.insertAdjacentHTML('afterbegin', `
      <div class="pp-recap">${svg(ICON.truck)}<div><b class="pp-recap-when"></b><span class="pp-recap-where"></span></div></div>`);
  }
  function fmtDay(iso) {
    try {
      if (typeof todayISO === 'function' && iso === todayISO()) return 'Avui';
      const d = new Date(iso + 'T12:00:00');
      const s = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    } catch (e) { return ''; }
  }
  function syncRecap() {
    const when = $('.pp-recap-when'), where = $('.pp-recap-where');
    if (!when) return;
    let t = '', d = '', a = '';
    try { t = cfSelectedTime || ''; } catch (e) {}
    try { d = cfDeliveryDate || ''; } catch (e) {}
    try { a = cfPlacesAddress || ''; } catch (e) {}
    if (t === 'Com més aviat millor' && window._cfEarliestSlot) t = 'Com més aviat millor (cap a les ' + window._cfEarliestSlot + ')';
    when.textContent = 'Lliurament · ' + [fmtDay(d), t].filter(Boolean).join(', ');
    where.textContent = a || 'A domicili · Matadepera';
  }

  // ── Checkout: segells de pagament segur sota "Pagar amb targeta" ──
  const cardBtn = $('#checkout-card-btn');
  if (cardBtn && !$('.pp-trust')) {
    cardBtn.insertAdjacentHTML('afterend', `
      <div class="pp-trust">
        <div class="brands" aria-label="Targetes acceptades">
          <span class="visa">VISA</span><span class="mc" title="Mastercard"><i></i><i></i></span>
          <span>Apple Pay</span><span>Google Pay</span>
        </div>
        <p>${svg(ICON.shield)}Pagament segur i xifrat amb Stripe. No guardem les dades de la targeta.</p>
      </div>`);
  }

  // ── Finestra de Stripe: etiqueta sobre l'import ──
  const amt = $('#stripe-amount-label');
  if (amt && !$('.pp-paylabel')) {
    const wrap = document.createElement('div');
    amt.parentNode.insertBefore(wrap, amt);
    wrap.innerHTML = '<span class="pp-paylabel">Total a pagar</span>';
    wrap.appendChild(amt);
  }

  // Obrim el desglossament del total la primera vegada que es veu el formulari
  let summaryOpened = false;
  function openSummaryOnce() {
    if (summaryOpened || !visible('cf-scroll') || !visible('checkout-fullscreen')) return;
    summaryOpened = true;
    const btn = $('#cf-summary-btn');
    if (btn && btn.getAttribute('aria-expanded') !== 'true' && typeof toggleOrderSummary === 'function') toggleOrderSummary();
  }

  const sync = () => { syncSteps(); syncRecap(); openSummaryOnce(); };
  const mo = new MutationObserver(sync);
  ['cf-time-step', 'cf-scroll', 'cf-success', 'stripe-overlay', 'checkout-fullscreen'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  sync();
})();
