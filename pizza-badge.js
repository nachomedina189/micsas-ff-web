// Pinta el aviso de pizzas que quedan dentro de `el` a partir de la
// respuesta de get_pizza_status ({status, remaining}). Solo se vuelve a dibujar cuando
// cambia el estado, para que el número "salte" únicamente al cambiar.
window.renderPizzaBadge = function (el, st) {
  if (!el) return;
  var key = st ? st.status + ':' + st.remaining : '';
  if (el.getAttribute('data-pzb') === key) return;
  el.setAttribute('data-pzb', key);
  el.textContent = '';
  if (!st || st.status === 'ok') { el.style.display = 'none'; return; }
  function span(cls, text) { var s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }
  var b = document.createElement('span');
  b.className = 'pzb';
  b.setAttribute('role', 'status');
  if (st.status === 'soldout') {
    b.className += ' pzb-out';
    b.appendChild(span('pzb-flame', '❤️'));
    b.appendChild(span('', 'Sold ooout, moltes gràcies família!'));
  } else if (st.status === 'few') {
    var n = Number(st.remaining) || 0;
    if (n <= 5) b.className += ' pzb-urgent';
    b.appendChild(span('pzb-flame', '🔥'));
    b.appendChild(span('pzb-num', String(n)));
    b.appendChild(span('', n === 1 ? 'pizza restant' : 'pizzes restants'));
  } else {
    b.appendChild(span('pzb-flame', '🔥'));
    b.appendChild(span('', 'Està arribant el sold out'));
  }
  el.appendChild(b);
  el.style.display = 'flex';
};
