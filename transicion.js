// Fallback de transición para navegadores sin View Transitions API.
// Intercepta clicks en enlaces internos y aplica la animación de salida
// antes de redirigir. En navegadores con soporte nativo, no hace nada
// y deja que el navegador gestione la transición.

document.addEventListener('DOMContentLoaded', () => {
  // Solo saltar si el navegador soporta View Transitions CROSS-document (Chrome 126+, Safari 18.2+)
  // document.startViewTransition existe desde Chrome 111 (same-doc), pero NO garantiza cross-doc
  if ('onpagereveal' in window) return;

  document.querySelectorAll('a[href]').forEach(link => {
    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }

    // Solo enlaces al mismo dominio
    if (url.origin !== location.origin) return;
    // Saltar anchors dentro de la misma página
    if (url.pathname === location.pathname && url.hash) return;
    // Respetar enlaces que abren en nueva pestaña
    if (link.target === '_blank') return;

    link.addEventListener('click', (e) => {
      // Dejar pasar atajos para abrir en nueva pestaña
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Solo click izquierdo
      if (e.button !== 0) return;

      e.preventDefault();
      document.body.classList.add('zoom-out');
      setTimeout(() => {
        window.location.href = link.href;
      }, 400);
    });
  });
});
