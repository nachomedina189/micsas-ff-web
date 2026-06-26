/*
 * Banner de consentiment de cookies — micsas.ff
 * Sense llibreries externes. Guarda la decisió en una cookie pròpia
 * (no localStorage) i només carrega Google Analytics si hi ha consentiment
 * analític explícit.
 */
(function () {
  // TODO: pega aquí tu ID real de Google Analytics (G-XXXXXXXXXX). Mientras
  // sea este valor de ejemplo, el script de GA NO se carga nunca, aunque el
  // usuario acepte — así no hay error en consola ni una petición fallida.
  const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

  const COOKIE_NAME = 'micsas_consent';
  const COOKIE_DAYS = 365;

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }

  function getCookie(name) {
    const match = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return match ? decodeURIComponent(match[2]) : null;
  }

  function readConsent() {
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function saveConsent(analytics) {
    setCookie(COOKIE_NAME, JSON.stringify({ tecniques: true, analitiques: !!analytics, data: new Date().toISOString() }), COOKIE_DAYS);
  }

  function loadGoogleAnalytics() {
    if (!GA_MEASUREMENT_ID || GA_MEASUREMENT_ID === 'G-XXXXXXXXXX') {
      console.warn('[cookie-consent] GA_MEASUREMENT_ID no configurat — no es carrega Google Analytics.');
      return;
    }
    if (window._gaLoaded) return;
    window._gaLoaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  }

  function applyConsent(consent) {
    if (consent && consent.analitiques) loadGoogleAnalytics();
  }

  // ── UI ──
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #cc-banner, #cc-prefs { font-family: 'League_Spartan', sans-serif; }
      #cc-banner { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10000; background: #F2D7B8; border-top: 3px solid #c80a07; box-shadow: 0 -4px 20px rgba(0,0,0,0.12); }
      #cc-prefs-overlay { position: fixed; inset: 0; z-index: 10001; background: rgba(42,26,15,0.45); display: flex; align-items: center; justify-content: center; padding: 1rem; }
      #cc-prefs { background: #F2D7B8; border-radius: 1rem; max-width: 28rem; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.25); }
      .cc-btn { font-weight: 600; font-size: 0.9rem; padding: 0.75rem 1.25rem; border-radius: 999px; cursor: pointer; transition: all .15s ease; border: 2px solid transparent; flex: 1; text-align: center; }
      .cc-btn-accept { background: #c80a07; color: #F2D7B8; }
      .cc-btn-accept:hover { background: #a30806; }
      .cc-btn-reject { background: transparent; color: #c80a07; border-color: #c80a07; }
      .cc-btn-reject:hover { background: rgba(200,10,7,0.08); }
      .cc-btn-link { background: none; border: none; color: #5A3E28; text-decoration: underline; font-size: 0.8rem; cursor: pointer; padding: 0.5rem; }
    `;
    document.head.appendChild(style);
  }

  function showBanner() {
    const el = document.createElement('div');
    el.id = 'cc-banner';
    el.innerHTML = `
      <div style="max-width:64rem;margin:0 auto;padding:1.25rem 1.5rem;display:flex;flex-wrap:wrap;align-items:center;gap:1rem;">
        <p style="flex:1 1 16rem;font-size:0.875rem;color:#2A1A0F;margin:0;line-height:1.5;">
          Utilitzem cookies tècniques (necessàries) i, si ho acceptes, cookies analítiques per millorar la web.
          Consulta la nostra <a href="cookies.html" style="text-decoration:underline;color:#c80a07;">Política de Cookies</a>.
        </p>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;align-items:center;">
          <button type="button" class="cc-btn-link" id="cc-config-btn">Configurar</button>
          <button type="button" class="cc-btn cc-btn-reject" id="cc-reject-btn">Rebutjar</button>
          <button type="button" class="cc-btn cc-btn-accept" id="cc-accept-btn">Acceptar</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    document.getElementById('cc-accept-btn').addEventListener('click', () => {
      saveConsent(true);
      applyConsent({ analitiques: true });
      el.remove();
    });
    document.getElementById('cc-reject-btn').addEventListener('click', () => {
      saveConsent(false);
      el.remove();
    });
    document.getElementById('cc-config-btn').addEventListener('click', () => {
      el.remove();
      showPreferences();
    });
  }

  function showPreferences() {
    const current = readConsent();
    const overlay = document.createElement('div');
    overlay.id = 'cc-prefs-overlay';
    overlay.innerHTML = `
      <div id="cc-prefs">
        <div style="padding:1.5rem;">
          <h2 style="font-weight:800;font-size:1.25rem;color:#2A1A0F;margin:0 0 1rem;">Configurar cookies</h2>

          <label style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:1rem;cursor:not-allowed;">
            <input type="checkbox" checked disabled style="margin-top:0.2rem;accent-color:#c80a07;">
            <span style="font-size:0.875rem;color:#2A1A0F;">
              <strong>Necessàries</strong><br>
              <span style="color:#5A3E28;">Imprescindibles per al funcionament de la web (idioma, comanda en curs). No es poden desactivar.</span>
            </span>
          </label>

          <label style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:1.5rem;cursor:pointer;">
            <input type="checkbox" id="cc-analytics-checkbox" ${current && current.analitiques ? 'checked' : ''} style="margin-top:0.2rem;accent-color:#c80a07;">
            <span style="font-size:0.875rem;color:#2A1A0F;">
              <strong>Analítiques</strong><br>
              <span style="color:#5A3E28;">Google Analytics — ens ajuda a entendre com s'utilitza la web. Opcional.</span>
            </span>
          </label>

          <div style="display:flex;gap:0.6rem;">
            <button type="button" class="cc-btn cc-btn-reject" id="cc-prefs-cancel">Cancel·lar</button>
            <button type="button" class="cc-btn cc-btn-accept" id="cc-prefs-save">Guardar preferències</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('cc-prefs-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('cc-prefs-save').addEventListener('click', () => {
      const analytics = document.getElementById('cc-analytics-checkbox').checked;
      saveConsent(analytics);
      applyConsent({ analitiques: analytics });
      overlay.remove();
    });
  }

  // Permet reobrir la configuració des de cookies.html en qualsevol moment.
  window.reabrirConsentimentCookies = function () {
    showPreferences();
  };

  function init() {
    injectStyles();
    const consent = readConsent();
    if (consent) {
      applyConsent(consent);
    } else {
      showBanner();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
