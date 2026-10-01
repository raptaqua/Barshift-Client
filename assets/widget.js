// Upotettava tapahtumawidget: <iframe src="…/widget.html?n=5&color=E14D2A&theme=dark">
// Ei riippuvuuksia; kaikki teksti asetetaan textContent-arvona (ei HTML-injektiota).
(function () {
  var q = new URLSearchParams(location.search), root = document.getElementById('w');
  var n = Math.max(1, Math.min(20, parseInt(q.get('n'), 10) || 5));
  if (q.get('theme') === 'dark') document.body.classList.add('dark');
  if (/^[0-9a-fA-F]{6}$/.test(q.get('color') || '')) document.documentElement.style.setProperty('--accent', '#' + q.get('color'));
  var MONTHS = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function empty(msg) { root.textContent = ''; root.appendChild(el('div', 'empty', msg)); }
  fetch('api.php?action=public_events').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    var bar = d.pub; if (!bar) return empty('Baarin julkista profiilia ei ole julkaistu.');
    var today = new Date(), iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var list = d.events.filter(function (e) { return e.date >= iso; }).slice(0, n);
    root.textContent = '';
    root.appendChild(el('h1', '', bar.name + ' – tapahtumat'));
    if (!list.length) root.appendChild(el('div', 'empty', 'Ei tulevia tapahtumia.'));
    list.forEach(function (e) {
      var a = el('a', 'ev'); a.href = 'tapahtumat.html'; a.target = '_blank'; a.rel = 'noopener';
      var dt = e.date.split('-'), box = el('div', 'date'); box.appendChild(el('b', '', String(parseInt(dt[2], 10)))); box.appendChild(el('span', '', MONTHS[parseInt(dt[1], 10) - 1]));
      var info = el('div'); info.appendChild(el('div', 't', e.title));
      var when = e.start ? 'klo ' + e.start + (e.end ? '–' + e.end : '') : 'koko päivän';
      info.appendChild(el('div', 'm', when));
      a.appendChild(box); a.appendChild(info); root.appendChild(a);
    });
    var foot = el('div', 'foot'), all = el('a', '', 'Kaikki tapahtumat →'); all.href = 'tapahtumat.html'; all.target = '_blank'; all.rel = 'noopener';
    foot.appendChild(all); root.appendChild(foot);
  }).catch(function () { empty('Tapahtumia ei voitu ladata.'); });
})();
