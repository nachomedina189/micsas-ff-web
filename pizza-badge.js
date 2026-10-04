// Pinta el aviso de pizzas que quedan dentro de `el` a partir de la
// respuesta de get_pizza_status ({status, remaining}). `when` es un texto
// opcional como "avui" o "al diumenge". Solo se vuelve a dibujar cuando
// cambia el estado, para que el número "salte" únicamente al cambiar.
window.renderPizzaBadge = function (el, st, when) {
  if (!el) return;
  var key = st ? st.status + ':' + st.remaining + ':' + (when || '') : '';
  if (el.getAttribute('data-pzb') === key) return;
  el.setAttribute('data-pzb', key);
  el.textContent = '';
  if (!st || st.status === 'ok') { el.style.display = 'none'; return; }
  function span(cls, text) { var s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }
  var b = document.createElement('span');
  b.className = 'pzb';
  b.setAttribute('role', 'status');
  var suffix = when ? ' ' + when : '';
  if (st.status === 'soldout') {
    b.className += ' pzb-out';
    b.appendChild(span('pzb-flame', '😢'));
    b.appendChild(span('', 'Pizzes exhaurides' + suffix));
  } else if (st.status === 'few') {
    var n = Number(st.remaining) || 0;
    if (n <= 5) b.className += ' pzb-urgent';
    b.appendChild(span('pzb-flame', '🔥'));
    b.appendChild(span('', n === 1 ? 'Només en queda' : 'Només en queden'));
    b.appendChild(span('pzb-num', String(n)));
    b.appendChild(span('', (n === 1 ? 'pizza' : 'pizzes') + suffix + '!'));
  } else {
    b.appendChild(span('pzb-flame', '🔥'));
    b.appendChild(span('', "S'estan esgotant les pizzes" + suffix + '!'));
  }
  el.appendChild(b);
  el.style.display = 'flex';
};
