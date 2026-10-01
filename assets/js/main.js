// ===================== LOGIN =====================
function renderLogin() {
    return `<div class="login-page"><div class="login-card">
        <div class="login-logo">Bar<span>Shift</span></div>
        <div class="card">
            <div class="form-group" style="margin-bottom:16px;"><label class="form-label">Käyttäjätunnus</label><input id="li-u" class="form-input" placeholder="tunnus" onkeydown="if(event.key==='Enter')login()"></div>
            <div class="form-group" style="margin-bottom:24px;"><label class="form-label">Salasana</label><input id="li-p" type="password" class="form-input" placeholder="••••••••" onkeydown="if(event.key==='Enter')login()"></div>
            <button class="btn btn-primary" onclick="login()" style="width:100%; justify-content:center; padding:12px;">Kirjaudu sisään</button>
            <div style="text-align:center; margin-top:14px; font-size:13px;"><a href="#" onclick="openForgot(); return false;" style="color:var(--accent); font-weight:600;">Unohtuiko salasana?</a></div>
            <div style="text-align:center; margin-top:10px; font-size:12px;" data-no-i18n>${Object.keys(window.bsLangs).map(k => `<a href="#" onclick="bsSetLang('${k}'); return false;" style="margin:0 6px; ${bsLang() === k ? 'font-weight:700;' : 'color:var(--text3);'}">${window.bsLangs[k]}</a>`).join('·')}</div>
            <div style="text-align:center; margin-top:10px; font-size:12px;"><a href="tietosuoseloste.html" target="_blank" rel="noopener" style="color:var(--text3);">Tietosuojaseloste</a></div>
        </div>
    </div></div>`;
}

async function login() {
    const uInput = document.getElementById('li-u').value.trim(); const p = document.getElementById('li-p').value;
    const username = uInput.split('@')[0];   // yhden baarin asennus: baaria ei tarvitse kirjoittaa
    if (!username) return showToast('Anna tunnus', 'error');

    try {
        const res = await fetch('api.php?action=login', { method: 'POST', body: JSON.stringify({ username, password: p }) });
        const text = await res.text(); const data = JSON.parse(text);
        if (data.error) return showToast(data.error, 'error');
        if (data.needs_2fa) return show2faStep();
        if (data.success) {
            state.user = data.user;
            localStorage.setItem('barshift_user', JSON.stringify(state.user));
            state.view = 'dashboard';
            load();
        } else { showToast('Väärä tunnus tai salasana', 'error'); }
    } catch(e) { showToast('Yhteys palvelimeen epäonnistui', 'error'); }
}

// Kaksivaiheinen tunnistautuminen: salasanan jälkeen kysytään koodi
function show2faStep() {
    const card = document.querySelector('.login-card .card');
    card.innerHTML = `<div style="text-align:center; margin-bottom:14px;"><i class="bi bi-shield-lock" style="font-size:32px; color:var(--accent);"></i>
        <div style="font-weight:700; margin-top:6px;">Vahvista kirjautuminen</div>
        <div style="font-size:13px; color:var(--text2); margin-top:4px;">Anna todennussovelluksen 6-numeroinen koodi tai palautuskoodi.</div></div>
        <div class="form-group" style="margin-bottom:16px;"><input id="li-c" class="form-input" inputmode="text" autocomplete="one-time-code" autofocus placeholder="123456" style="text-align:center; font-size:20px; letter-spacing:3px;" onkeydown="if(event.key==='Enter')login2fa()"></div>
        <button class="btn btn-primary" onclick="login2fa()" style="width:100%; justify-content:center; padding:12px;">Vahvista</button>
        <div style="text-align:center; margin-top:12px; font-size:12px;"><a href="#" onclick="location.reload(); return false;" style="color:var(--text3);">Peruuta</a></div>`;
    document.getElementById('li-c').focus();
}
async function login2fa() {
    const code = document.getElementById('li-c').value.trim();
    try {
        const res = await fetch('api.php?action=login_2fa', { method: 'POST', body: JSON.stringify({ code }) });
        const data = await res.json();
        if (data.error) { if (res.status === 401 && /vanheni/.test(data.error)) { showToast(data.error, 'error'); return setTimeout(() => location.reload(), 1200); } return showToast(data.error, 'error'); }
        state.user = data.user;
        localStorage.setItem('barshift_user', JSON.stringify(state.user));
        state.view = 'dashboard';
        load();
    } catch (e) { showToast('Yhteys palvelimeen epäonnistui', 'error'); }
}

// Salasanan palautus sähköpostilla
function openForgot() {
    const cur = (document.getElementById('li-u') || {}).value || '';
    openModal('Unohtuiko salasana?', 'bi-key', `<p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Anna käyttäjätunnuksesi. Jos tunnukselle on tallennettu sähköpostiosoite, lähetämme sinne linkin uuden salasanan asettamiseen. Jos osoitetta ei ole, pyydä linkki baarin ylläpitäjältä.</p>
        <div class="form-group"><label class="form-label">Käyttäjätunnus</label><input id="fg-u" class="form-input" placeholder="tunnus" value="${esc(cur.trim())}" onkeydown="if(event.key==='Enter')requestReset()"></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="requestReset()"><i class="bi bi-envelope"></i> Lähetä linkki</button>`);
}
async function requestReset() {
    const v = document.getElementById('fg-u').value.trim();
    const username = v.split('@')[0];
    if (!username) return showToast('Anna tunnus', 'error');
    try {
        const r = await (await fetch('api.php?action=request_reset', { method: 'POST', body: JSON.stringify({ username }) })).json();
        if (r.error) return showToast(r.error, 'error');
        closeModal(); showToast(r.message);
    } catch (e) { showToast('Yhteys palvelimeen epäonnistui', 'error'); }
}

load();
