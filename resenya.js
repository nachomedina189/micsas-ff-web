// Enllaç per deixar una ressenya a Google (carta i pantalla de confirmació).
//
// GOOGLE_REVIEW_URL: enganxa aquí l'enllaç "Pedir reseñas" de Google Business
// Profile (format https://g.page/r/XXXX/review). Mentre estigui buit, els
// botons de ressenya queden amagats perquè no portin a un enllaç trencat.
(function () {
  var GOOGLE_REVIEW_URL = 'https://g.page/r/CWL_rSnGnmppEBM/review';

  // Animació cridanera (llum pulsant al botó i estrelles que "respiren").
  function injectStyles() {
    var st = document.createElement('style');
    st.textContent =
      '@keyframes resenya-glow{0%,100%{box-shadow:0 0 0 0 rgba(245,179,1,.55),0 10px 24px rgba(0,0,0,.2)}50%{box-shadow:0 0 0 12px rgba(245,179,1,0),0 10px 24px rgba(0,0,0,.2)}}' +
      '@keyframes resenya-star{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}' +
      '.resenya-cta{display:flex;animation:resenya-glow 2.4s ease-in-out infinite}' +
      '.resenya-cta.hidden{display:none}' +
      '.resenya-star{animation:resenya-star 1.8s ease-in-out infinite}' +
      '.resenya-star:nth-child(2){animation-delay:.12s}.resenya-star:nth-child(3){animation-delay:.24s}' +
      '.resenya-star:nth-child(4){animation-delay:.36s}.resenya-star:nth-child(5){animation-delay:.48s}' +
      '@media (prefers-reduced-motion:reduce){.resenya-cta,.resenya-star{animation:none}}';
    document.head.appendChild(st);
  }

  function init() {
    injectStyles();
    document.querySelectorAll('[data-review-link]').forEach(function (el) {
      if (GOOGLE_REVIEW_URL) {
        el.href = GOOGLE_REVIEW_URL;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
