// Julkinen pöytävaraus (?pub=TUNNISTE) ja varauksen/ilmoittautumisen peruutus (#cancel=TOKEN). Kaikki teksti asetetaan textContentilla.
(function () {
  var root = document.getElementById('root'), q = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
  function el(tag, attrs, text) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function show() { root.textContent = ''; Array.prototype.slice.call(arguments).forEach(function (n) { root.appendChild(n); }); }
  function api(action, opts, query) { return fetch('api.php?action=' + action + (query || ''), opts).then(function (r) { return r.text().then(function (txt) { var j = {}; try { j = JSON.parse(txt); } catch (e) { j = { error: 'Palvelinvirhe (' + r.status + '). Yritä hetken päästä uudelleen tai ota yhteyttä baariin.' }; } return { ok: r.ok, j: j }; }); }); }
  function post(action, body) { return api(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  function field(label, node, id) { var l = el('label', { 'for': id }, label); return [l, node]; }
  function add(parent, arr) { arr.forEach(function (n) { parent.appendChild(n); }); }

  // ---- Peruutus ----
  var tok = hash.get('cancel') || q.get('cancel');   // ?cancel= toimii, jos sähköpostiohjelma pudottaa #-osan
  if (tok) {
    if (!/^[0-9a-f]{48}$/.test(tok)) return show(el('h1', {}, 'Linkki ei toimi'), el('p', { 'class': 'sub' }, 'Linkistä puuttuu osa. Kopioi koko osoite sähköpostista tai ota yhteyttä baariin.'));
    history.replaceState(null, '', location.pathname);
    var go = el('button', { 'class': 'go', type: 'button' }, 'Vahvista peruutus'), msg = el('div', { 'class': 'msg' });
    show(el('h1', {}, 'Peru varaus'), el('p', { 'class': 'sub' }, 'Peruuta pöytävaraus tai tapahtumaan ilmoittautuminen. Peruutusta ei voi kumota.'), go, msg);
    go.addEventListener('click', function () {
      go.disabled = true;
      post('public_cancel', { token: tok }).then(function (r) {
        if (r.ok) { show(el('h1', {}, r.j.already ? 'Jo peruttu ✓' : 'Peruttu ✓'), el('p', { 'class': 'sub' }, r.j.already ? 'Tämä varaus on jo peruttu.' : 'Kiitos ilmoituksesta. Tervetuloa toiste!')); }
        else { msg.textContent = r.j.error || 'Peruutus epäonnistui'; msg.className = 'msg err'; go.disabled = false; }
      }).catch(function () { msg.textContent = 'Yhteys palvelimeen epäonnistui'; msg.className = 'msg err'; go.disabled = false; });
    });
    return;
  }

  // ---- Palaute (#feedback=TOKEN) ----
  var fb = hash.get('feedback');
  if (fb) {
    if (!/^[0-9a-f]{48}$/.test(fb)) return show(el('h1', {}, 'Linkki ei toimi'));
    history.replaceState(null, '', location.pathname);
    api('public_feedback_info', {}, '&token=' + fb).then(function (r) {
      if (!r.ok) return show(el('h1', {}, 'Linkki ei toimi'), el('p', { 'class': 'sub' }, r.j.error || 'Linkki on virheellinen tai vanhentunut.'));
      if (r.j.answered) return show(el('h1', {}, 'Kiitos!'), el('p', { 'class': 'sub' }, 'Olet jo antanut palautteen.'));
      var score = 0, stars = [], row = el('div', { 'class': 'stars', role: 'radiogroup', 'aria-label': 'Arvosana' }), text = el('textarea', { rows: 4, maxlength: 500, placeholder: 'Mikä oli hyvää? Mitä voisimme tehdä paremmin? (valinnainen)' });
      var send = el('button', { 'class': 'go', type: 'button', disabled: 'disabled' }, 'Lähetä palaute'), msg = el('div', { 'class': 'msg', role: 'status' });
      function paint() { stars.forEach(function (b, i) { b.textContent = i < score ? '★' : '☆'; b.setAttribute('aria-checked', String(i + 1 === score)); }); }
      for (var i = 1; i <= 5; i++) (function (n) { var b = el('button', { type: 'button', role: 'radio', 'aria-label': n + ' / 5', style: 'background:none;border:0;font-size:38px;cursor:pointer;color:#F59E0B;padding:0 4px;width:auto;' }, '☆'); b.addEventListener('click', function () { score = n; paint(); send.disabled = false; }); stars.push(b); row.appendChild(b); })(i);
      show(el('h1', {}, r.j.title), el('p', { 'class': 'sub' }, 'Miten viihdyit? Palaute auttaa meitä tekemään tapahtumista parempia.'), row, text, send, msg);
      send.addEventListener('click', function () {
        send.disabled = true;
        post('public_feedback', { token: fb, rating: score, text: text.value }).then(function (x) {
          if (x.ok) show(el('h1', {}, 'Kiitos palautteesta ✓'), el('p', { 'class': 'sub' }, 'Tervetuloa toistekin!'));
          else { msg.textContent = x.j.error || 'Lähetys epäonnistui'; msg.className = 'msg err'; send.disabled = false; }
        });
      });
    });
    return;
  }

  // ---- Varaus ----
  var pub = q.get('pub') || '';
  if (!/^p[0-9a-f]{12}$/.test(pub)) return show(el('h1', {}, 'Pöytävaraus'), el('p', { 'class': 'sub' }, 'Osoitteesta puuttuu baarin tunniste.'));
  api('public_booking_info', {}, '&pub=' + pub).then(function (r) {
    if (!r.ok) return show(el('h1', {}, 'Pöytävaraus'), el('p', { 'class': 'sub' }, 'Tämän baarin pöytävaraukset eivät ole käytössä.'));
    var info = r.j, chosen = null, today = new Date(), iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    document.title = 'Pöytävaraus – ' + info.name;
    var party = el('select', { id: 'pt' }); for (var i = 1; i <= info.max_party; i++) party.appendChild(el('option', { value: i }, i + (i === 1 ? ' henkilö' : ' henkilöä'))); party.value = Math.min(2, info.max_party);
    var max = new Date(Date.now() + info.days_ahead * 864e5);
    var date = el('input', { id: 'dt', type: 'date', min: iso(today), max: iso(max), value: iso(today) });
    var slots = el('div', { 'class': 'slots', id: 'sl', 'aria-live': 'polite' });
    var name = el('input', { id: 'nm', maxlength: 100, autocomplete: 'name' }), email = el('input', { id: 'em', type: 'email', maxlength: 150, autocomplete: 'email' }), phone = el('input', { id: 'ph', maxlength: 30, autocomplete: 'tel' });
    var note = el('textarea', { id: 'nt', rows: 2, maxlength: 300, placeholder: 'Erityistoiveet (valinnainen)' }), hp = el('input', { 'class': 'hp', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true', name: 'website' });
    var btn = el('button', { 'class': 'go', type: 'button', disabled: 'disabled' }, 'Varaa pöytä'), msg = el('div', { 'class': 'msg', role: 'status' });
    var h = el('div'); add(h, [el('h1', {}, info.name), el('p', { 'class': 'sub' }, [info.address, info.city].filter(Boolean).join(', ') || 'Pöytävaraus')]);
    add(h, field('Henkilömäärä', party, 'pt')); add(h, field('Päivä', date, 'dt')); add(h, [el('label', {}, 'Kellonaika'), slots]);
    add(h, field('Nimi', name, 'nm')); add(h, field('Sähköposti', email, 'em')); add(h, field('Puhelin (valinnainen)', phone, 'ph')); add(h, field('Lisätiedot', note, 'nt')); h.appendChild(hp);
    add(h, [btn, msg, el('p', { 'class': 'hint' }, 'Tietojasi käytetään vain varauksen hoitamiseen ja ne poistetaan 12 kk kuluttua. ' + (info.auto_confirm ? 'Varaus vahvistuu heti, kun aika on vapaana.' : 'Baari vahvistaa varauksen sähköpostilla.'))]);
    show(h);
    function loadSlots() {
      chosen = null; btn.disabled = true; slots.textContent = 'Haetaan aikoja…';
      api('public_slots', {}, '&pub=' + pub + '&date=' + encodeURIComponent(date.value) + '&party=' + party.value).then(function (r) {
        slots.textContent = '';
        if (!r.ok) { slots.textContent = r.j.error || 'Aikoja ei voitu hakea'; return; }
        if (!r.j.slots.length) { slots.textContent = 'Ei vapaita aikoja tälle päivälle. Kokeile toista päivää tai pienempää ryhmää.'; return; }
        r.j.slots.forEach(function (s) {
          var b = el('button', { 'class': 'slot', type: 'button', 'aria-pressed': 'false' }, s.time);
          b.addEventListener('click', function () { chosen = s.time; slots.querySelectorAll('.slot').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); btn.disabled = false; });
          slots.appendChild(b);
        });
      }).catch(function () { slots.textContent = 'Yhteys palvelimeen epäonnistui'; });
    }
    party.addEventListener('change', loadSlots); date.addEventListener('change', loadSlots); loadSlots();
    btn.addEventListener('click', function () {
      msg.textContent = ''; msg.className = 'msg'; btn.disabled = true;
      post('public_book', { pub: pub, name: name.value, email: email.value, phone: phone.value, note: note.value, party: +party.value, date: date.value, time: chosen, website: hp.value }).then(function (r) {
        if (!r.ok) { msg.textContent = r.j.error || 'Varaus epäonnistui'; msg.className = 'msg err'; btn.disabled = false; if (/vapaana/.test(r.j.error || '')) loadSlots(); return; }
        show(el('h1', {}, r.j.status === 'confirmed' ? 'Varaus vahvistettu ✓' : 'Varauspyyntö vastaanotettu ✓'),
          el('p', { 'class': 'sub' }, (r.j.status === 'confirmed' ? 'Pöytäsi on varattu.' : 'Baari vahvistaa varauksen sähköpostilla.') + ' Varauskoodi: ' + r.j.code + '. Vahvistus ja peruutuslinkki on lähetetty sähköpostiisi.'));
      }).catch(function () { msg.textContent = 'Yhteys palvelimeen epäonnistui'; msg.className = 'msg err'; btn.disabled = false; });
    });
  }).catch(function () { show(el('h1', {}, 'Pöytävaraus'), el('p', { 'class': 'sub' }, 'Yhteys palvelimeen epäonnistui.')); });
})();
