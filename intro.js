// Intro de la portada: el vídeo de la moto, accelerat (x2, uns 3 s), una
// sola vegada per visita. Es pot saltar tocant la pantalla. No surt si el
// client té "reduir moviment" o estalvi de dades, ni si ja l'ha vist en
// aquesta visita. Mentre dura, l'entrada de la portada espera (classe
// intro-on), així "Demana ja!" apareix just quan acaba.
(function () {
  var box = document.getElementById('intro');
  var v = document.getElementById('intro-video');
  if (!box || !v) return;
  var seen = false;
  try { seen = sessionStorage.getItem('micsas_intro_vista') === '1'; } catch (_) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (seen || reduce || saveData) return;
  try { sessionStorage.setItem('micsas_intro_vista', '1'); } catch (_) {}

  var root = document.documentElement, done = false;
  box.hidden = false;
  root.classList.add('intro-on');
  function end() {
    if (done) return; done = true;
    box.classList.add('intro-out');
    root.classList.remove('intro-on');
    setTimeout(function () { box.remove(); }, 400);
  }
  v.playbackRate = 2;
  v.addEventListener('loadedmetadata', function () { v.playbackRate = 2; });
  v.addEventListener('ended', end);
  v.addEventListener('error', end);
  box.addEventListener('click', end);
  var p = v.play();
  if (p && p.catch) p.catch(end);          // si el navegador no deixa reproduir, directe a la portada
  setTimeout(end, 4500);                    // xarxa lenta: mai més de 4,5 s
})();
