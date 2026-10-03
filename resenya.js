// Enllaç per deixar una ressenya a Google (carta i pantalla de confirmació).
//
// GOOGLE_REVIEW_URL: enganxa aquí l'enllaç "Pedir reseñas" de Google Business
// Profile (format https://g.page/r/XXXX/review). Mentre estigui buit, els
// botons de ressenya queden amagats perquè no portin a un enllaç trencat.
(function () {
  var GOOGLE_REVIEW_URL = '';

  function init() {
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
