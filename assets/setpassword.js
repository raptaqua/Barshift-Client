// Salasanan asetus kutsu-/palautuslinkistä. Tunniste on osoitteen #-osassa (ei mene palvelimen lokeihin eikä Referer-otsikkoon).
(function () {
  var root = document.getElementById('content');
  var token = (new URLSearchParams(location.hash.slice(1))).get('t') || '';
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function show() { root.textContent = ''; Array.prototype.slice.call(arguments).forEach(function (n) { root.appendChild(n); }); }
  function fail(msg) { var d = el('div', { 'class': 'err', style: 'display:block' }, msg); show(el('h1', {}, 'Linkki ei toimi'), d, el('p', { style: 'margin-top:14px' }, 'Voit pyytää uuden linkin kirjautumissivun "Unohtuiko salasana?" -toiminnolla tai ylläpitäjältä.'), Object.assign(el('a', { href: 'index.php' }, 'Kirjautumissivulle'))); }

  if (!/^[0-9a-f]{64}$/.test(token)) return fail('Linkistä puuttuu tunniste.');
  history.replaceState(null, '', location.pathname);   // poistetaan tunniste osoiteriviltä

  function linkChoice(j) {
    var pub = j.login.split('@')[1] || '';
    var yes = el('button', { type: 'button' }, 'Kyllä, yhdistä tunnukseeni');
    var no = el('button', { type: 'button', style: 'background:#fff; color:#0F172A; border:1px solid #CBD5E1; margin-top:8px' }, 'Ei, luo uusi salasana');
    show(el('h1', {}, 'Tervetuloa baariin ' + pub), el('p', {}, 'Hei ' + j.name + '! Sinut on kutsuttu baarin ' + pub + ' työntekijäksi. Onko sinulla jo BarShift-tunnus toisessa baarissa? Voit liittää tämän baarin siihen ja vaihtaa baarien välillä yhdellä kirjautumisella.'), yes, no);
    no.addEventListener('click', function () { window.__forceNew = true; load(); });
    yes.addEventListener('click', function () {
      var u = el('input', { id: 'lu', autocomplete: 'username', placeholder: 'tunnus@baari' }), pw = el('input', { id: 'lp', type: 'password', autocomplete: 'current-password' }), code = el('input', { id: 'lc', autocomplete: 'one-time-code', placeholder: '(vain jos 2FA käytössä)' });
      var err = el('div', { 'class': 'err' }), btn = el('button', { type: 'button' }, 'Yhdistä');
      var f = document.createElement('div');
      [el('h1', {}, 'Yhdistä olemassa olevaan tunnukseen'), el('p', {}, 'Anna nykyisen tunnuksesi tiedot todistaaksesi, että se on sinun.'), el('label', { 'for': 'lu' }, 'Nykyinen tunnus'), u, el('label', { 'for': 'lp' }, 'Salasana'), pw, el('label', { 'for': 'lc' }, 'Kaksivaiheisen koodi'), code, err, btn].forEach(function (n) { f.appendChild(n); });
      show(f);
      function go() {
        err.style.display = 'none'; var parts = u.value.trim().split('@');
        if (parts.length !== 2 || !parts[0] || !parts[1]) { err.textContent = 'Anna tunnus muodossa tunnus@baari'; err.style.display = 'block'; return; }
        btn.disabled = true;
        fetch('api.php?action=accept_link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, username: parts[0], pub_name: parts[1], password: pw.value, code: code.value }) })
          .then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); })
          .then(function (r) {
            if (!r.ok) { btn.disabled = false; err.textContent = r.x.error || 'Yhdistäminen epäonnistui'; err.style.display = 'block'; return; }
            var done = el('div', { 'class': 'ok' });
            done.appendChild(el('h1', {}, 'Baari yhdistetty ✓'));
            done.appendChild(el('p', {}, 'Kirjaudu tunnuksellasi ' + r.x.login + ' – baarien välillä vaihdat sivun ylälaidan valinnasta.'));
            done.appendChild(el('a', { href: 'index.php' }, 'Kirjaudu sisään →'));
            show(done);
          }).catch(function () { btn.disabled = false; err.textContent = 'Yhteys palvelimeen epäonnistui'; err.style.display = 'block'; });
      }
      btn.addEventListener('click', go); pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    });
  }
  function load() {
  return fetch('api.php?action=token_info&token=' + token).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
    if (!res.ok) return fail(res.j.error || 'Linkki on virheellinen tai vanhentunut.');
    var j = res.j, invite = j.kind !== 'reset';
    if (j.kind === 'link' && !window.__forceNew) return linkChoice(j);
    var err = el('div', { 'class': 'err' });
    var p1 = el('input', { type: 'password', id: 'p1', autocomplete: 'new-password', minlength: '8' });
    var p2 = el('input', { type: 'password', id: 'p2', autocomplete: 'new-password', minlength: '8' });
    var btn = el('button', { type: 'button' }, invite ? 'Aseta salasana' : 'Vaihda salasana');
    var form = document.createElement('div');
    [el('h1', {}, (invite ? 'Tervetuloa, ' : 'Hei, ') + j.name), el('p', {}, 'Valitse salasana (vähintään 8 merkkiä). Kirjautumistunnuksesi:'), el('div', { 'class': 'login-id' }, j.login),
     el('label', { 'for': 'p1' }, 'Uusi salasana'), p1, el('label', { 'for': 'p2' }, 'Salasana uudelleen'), p2, err, btn].forEach(function (n) { form.appendChild(n); });
    show(form);
    function submit() {
      err.style.display = 'none';
      if (p1.value.length < 8) { err.textContent = 'Salasanan on oltava vähintään 8 merkkiä.'; err.style.display = 'block'; return; }
      if (p1.value !== p2.value) { err.textContent = 'Salasanat eivät täsmää.'; err.style.display = 'block'; return; }
      btn.disabled = true;
      fetch('api.php?action=set_password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token, password: p1.value }) })
        .then(function (r) { return r.json().then(function (x) { return { ok: r.ok, x: x }; }); })
        .then(function (r) {
          if (!r.ok) { btn.disabled = false; err.textContent = r.x.error || 'Salasanan asetus epäonnistui'; err.style.display = 'block'; return; }
          var done = el('div', { 'class': 'ok' });
          done.appendChild(el('h1', {}, 'Salasana asetettu ✓'));
          done.appendChild(el('p', {}, 'Voit nyt kirjautua tunnuksella ' + r.x.login + '.'));
          done.appendChild(el('a', { href: 'index.php' }, 'Kirjaudu sisään →'));
          show(done);
        }).catch(function () { btn.disabled = false; err.textContent = 'Yhteys palvelimeen epäonnistui'; err.style.display = 'block'; });
    }
    btn.addEventListener('click', submit);
    p2.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }).catch(function () { fail('Yhteys palvelimeen epäonnistui.'); });
  }
  load();
})();
