// Pantalla de sold out a página completa (pre-pedido). window.showSoldOut(key, onOther)
// la abre una vez por clave (fecha); window.hideSoldOut() la cierra.
(function () {
  var shown = {};
  var root = null;
  function build() {
    root = document.createElement('div');
    root.className = 'sos';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-label', 'Sold out');
    root.innerHTML =
      '<div class="sos-stamp"><svg viewBox="0 0 760 300" aria-hidden="true">' +
      '<defs><filter id="sos-rough" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="4" result="n"/>' +
      '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -22 14.6" result="holes"/>' +
      '<feComposite in="SourceGraphic" in2="holes" operator="in"/></filter></defs>' +
      '<g filter="url(#sos-rough)" fill="none" stroke="#E23F2E">' +
      '<rect x="12" y="12" width="736" height="276" rx="26" stroke-width="12"/>' +
      '<rect x="36" y="36" width="688" height="228" rx="14" stroke-width="5"/>' +
      '<text x="380" y="190" text-anchor="middle" fill="#E23F2E" stroke="none" ' +
      'font-family="League Spartan, sans-serif" font-weight="900" font-size="150" textLength="620" lengthAdjust="spacingAndGlyphs">SOLD OUT</text>' +
      '</g></svg></div>' +
      '<p class="sos-msg">Sold ooout, moltes gràcies família!<span class="sos-sub" style="display:block">Ja no queden pizzes per a aquest dia.</span></p>' +
      '<button type="button" class="sos-btn">Tria un altre dia</button>';
    document.body.appendChild(root);
  }
  window.hideSoldOut = function () { if (root) root.hidden = true; };
  window.showSoldOut = function (key, onOther) {
    if (shown[key]) return;
    shown[key] = true;
    if (!root) build();
    root.hidden = false;
    root.querySelector('.sos-btn').onclick = function () { window.hideSoldOut(); if (onOther) onOther(); };
  };
})();
