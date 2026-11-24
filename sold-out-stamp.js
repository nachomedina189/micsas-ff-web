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
      '<button type="button" class="sos-btn">Tria un altre dia</button>' +
      '<form class="sos-alert" novalidate>' +
      '<label for="sos-contact">Vols que t\'avisem quan tornem a obrir comandes?</label>' +
      '<div class="sos-alert-row"><input id="sos-contact" type="text" inputmode="email" autocomplete="tel" maxlength="120" placeholder="Telèfon o email" required>' +
      '<button type="submit">Avisa\'m</button></div>' +
      '<p class="sos-alert-note" aria-live="polite">Només el farem servir per avisar-te del pròxim servei.</p>' +
      '</form>';
    document.body.appendChild(root);
    root.querySelector('.sos-alert').addEventListener('submit', submitAlert);
  }
  var currentKey = null;
  async function submitAlert(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var input = form.querySelector('input');
    var note = form.querySelector('.sos-alert-note');
    var contact = input.value.trim();
    if (contact.length < 5) { note.textContent = 'Escriu un telèfon o un email.'; input.focus(); return; }
    if (!window.supabase) { note.textContent = "No s'ha pogut desar. Torna-ho a provar."; return; }
    form.querySelector('button').disabled = true;
    var res = await window.supabase.from('soldout_alerts').insert({ contact: contact, delivery_date: currentKey || null });
    if (res.error) {
      form.querySelector('button').disabled = false;
      note.textContent = "No s'ha pogut desar. Torna-ho a provar.";
      return;
    }
    form.querySelector('.sos-alert-row').hidden = true;
    form.querySelector('label').hidden = true;
    note.textContent = "Fet! T'avisarem quan tornem a obrir comandes.";
  }
  window.hideSoldOut = function () { if (root) root.hidden = true; };
  window.showSoldOut = function (key, onOther) {
    if (shown[key]) return;
    shown[key] = true;
    currentKey = key;
    if (!root) build();
    root.hidden = false;
    root.querySelector('.sos-btn').onclick = function () { window.hideSoldOut(); if (onOther) onOther(); };
  };
})();
