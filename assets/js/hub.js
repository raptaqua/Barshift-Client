// ===================== KESKUSPALVELIN (BarShift Hub): keikkahakemukset =====================
// Keikkavuoro julkaistaan keskukseen vain aikana, roolina ja palkkatekstinä. Hakijan yhteystiedot näkyvät vasta, kun hyväksyt hakemuksen.
function adminTabGigApps() {
    if (!pubFeature('hub_gigs')) return `<div class="card card-sm" style="max-width:640px;"><p style="margin:0; color:var(--text2);">Keikkatyöpörssi ei ole käytössä. Ota se käyttöön kohdassa Baari → Asetukset → Keskuspalvelin.</p></div>`;
    if (state.gigApps === undefined) loadGigApps();
    const list = state.gigApps || [];
    if (!list.length) return `<div class="card card-sm" style="max-width:760px;"><p style="margin:0; color:var(--text2);">Ei hakemuksia. Merkitse avoin vuoro keikkatyöksi vuoron muokkauksessa.</p></div>`;
    return `<div class="card card-sm" style="max-width:760px;">${list.map(a => `<div class="att-row" style="flex-wrap:wrap; gap:8px; align-items:flex-start;">
        <div style="flex:1; min-width:220px;"><b>${esc(a.name)}</b> <small>${esc(a.city || '')}</small><br>
        <small>${formatDate(a.date)} ${esc(String(a.start).slice(0, 5))}–${esc(String(a.end).slice(0, 5))} ${esc(a.role || '')}</small><br>
        ${a.skills ? `<small>Taidot: ${esc(a.skills)}</small><br>` : ''}${a.message ? `<small>“${esc(a.message)}”</small><br>` : ''}
        ${a.status === 'accepted' ? `<small><b>Hyväksytty.</b> ${a.email ? '✉ ' + esc(a.email) : ''} ${a.phone ? '☎ ' + esc(a.phone) : ''}</small>` : (a.status === 'declined' ? '<small>Hylätty</small>' : '')}</div>
        ${a.status === 'pending' ? `<div style="display:flex; gap:6px;"><button class="btn btn-primary btn-sm" onclick="hubDecide(${a.id}, 'accepted')">Hyväksy</button><button class="btn btn-ghost btn-sm" onclick="hubDecide(${a.id}, 'declined')">Hylkää</button></div>` : ''}
    </div>`).join('')}</div>`;
}
async function loadGigApps() {
    state.gigApps = [];
    try { const r = await (await fetch('api.php?action=hub_applications', { method: 'POST', body: '{}' })).json(); if (!r.error) state.gigApps = r.applications; } catch (e) {}
    render();
}
async function hubDecide(id, decision) {
    if (decision === 'accepted' && !confirm('Hyväksytäänkö hakija? Hänelle luodaan keikkalaistunnus ja hänet asetetaan vuoroon, muut tämän vuoron hakijat hylätään ja hakijan yhteystiedot tulevat näkyviin.')) return;
    const r = await (await fetch('api.php?action=hub_decide', { method: 'POST', body: JSON.stringify({ id, decision }) })).json();
    if (r.error) return showToast(r.error, 'error');
    state.gigApps = undefined; await load();
    if (r.worker) return hubWorkerModal(r.worker);
    showToast('Päätös tallennettu');
}
// Hyväksytyn keikkalaisen tunnus ja kutsulinkki (linkki näytetään vain tässä; uuden saa Ylläpito → Työntekijät)
function hubWorkerModal(w) {
    const body = w.existing
        ? `<p style="margin:0 0 8px;"><b>${esc(w.name)}</b> on jo baarin käyttäjä (tunnus <b>${esc(w.username)}</b>). Hänet asetettiin vuoroon${w.assigned ? '' : ' (vuoro oli jo varattu, joten asetusta ei tehty)'}.</p>`
        : `<p style="margin:0 0 8px;">Keikkalaiselle <b>${esc(w.name)}</b> luotiin tunnus <b>${esc(w.username)}</b> (keikkalainen) ja hänet asetettiin vuoroon.</p>
           ${w.emailed ? `<p style="margin:0 0 8px;">Kutsulinkki lähetettiin osoitteeseen <b>${esc(w.email)}</b>. Linkistä hän asettaa salasanansa (voimassa 7 päivää).</p>` : `<p style="margin:0 0 8px;">Anna tämä linkki hakijalle (voimassa 7 päivää), jolloin hän asettaa itse salasanansa:</p>
           <input class="form-input" readonly value="${esc(w.link || '')}" onclick="this.select()" style="font-size:12px;">`}
           ${w.phone || w.email ? `<p style="margin:8px 0 0; font-size:13px; color:var(--text2);">Yhteystiedot: ${w.phone ? '☎ ' + esc(w.phone) : ''} ${w.email ? '✉ ' + esc(w.email) : ''}</p>` : ''}`;
    openModal('Keikkalainen lisätty', 'bi-person-check', body, `<button class="btn btn-primary" onclick="closeModal()">Valmis</button>`);
}
async function hubSyncNow() {
    const box = document.getElementById('hub-status'); if (box) box.textContent = 'Synkronoidaan…';
    try {
        const res = await fetch('api.php?action=hub_sync_now', { method: 'POST', body: '{}' }); const text = await res.text(); let r; try { r = JSON.parse(text); } catch (e) { r = { error: 'Palvelin vastasi virheellisesti (' + res.status + ')' }; }
        if (box) box.textContent = r.error ? '⚠️ ' + r.error : `✓ Yhteys toimii. Lähetetty ${r.sent} muutosta, uusia hakemuksia ${r.new_applications}.${r.note ? ' ' + r.note : ''}`;
    } catch (e) { if (box) box.textContent = '⚠️ Yhteysvirhe'; }
}
async function hubPair() {
    const box = document.getElementById('hub-status'); const url = document.getElementById('hub-url').value.trim(), code = document.getElementById('hub-code').value.trim();
    if (!url || !code) return showToast('Anna keskuksen osoite ja liitoskoodi', 'error');
    if (box) box.textContent = 'Liitetään…';
    try {
        const res = await fetch('api.php?action=hub_pair', { method: 'POST', body: JSON.stringify({ url, code }) }); const text = await res.text(); let r; try { r = JSON.parse(text); } catch (e) { r = { error: 'Palvelin vastasi virheellisesti (' + res.status + ')' }; }
        if (r.error) { if (box) box.textContent = '⚠️ ' + r.error; return showToast(r.error, 'error'); }
        showToast('Liitetty keskukseen' + (r.name ? ': ' + r.name : '') + '. Valitse alta, mitä julkaistaan, ja tallenna asetukset.'); await load();
    } catch (e) { if (box) box.textContent = '⚠️ Yhteysvirhe'; }
}
async function hubDisconnect() {
    if (!confirm('Katkaistaanko yhteys keskukseen? Baarin julkaisemat tapahtumat ja keikkavuorot poistetaan keskuksesta. Voit liittää baarin myöhemmin uudelleen uudella liitoskoodilla.')) return;
    const r = await (await fetch('api.php?action=hub_disconnect', { method: 'POST', body: '{}' })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast(r.note || 'Yhteys katkaistu'); load();
}

// ===================== MUIDEN BAARIEN VAPAAT VUOROT (Keikat) =====================
// Keskus välittää toisten baarien avoimet vuorot. Hakemus lähtee keskuksen kautta vain vuoron tarjonneelle baarille.
async function loadGigFeed() {
    state.gigFeed = state.gigFeed || { loading: true, shifts: [], applications: [] };
    try {
        const r = await (await fetch('api.php?action=hub_feed', { method: 'POST', body: '{}' })).json();
        state.gigFeed = r.error ? { shifts: [], applications: [], error: r.error } : r;
    } catch (e) { state.gigFeed = { shifts: [], applications: [], error: 'Yhteysvirhe' }; }
    if (state.view === 'gigs') render();
}
function gigTime(s) { return String(s.time_start).slice(0, 5) + '–' + String(s.time_end).slice(0, 5); }
function renderGigs() {
    if (!state.gigFeed) loadGigFeed();
    const f = state.gigFeed || { loading: true, shifts: [], applications: [] };
    const head = `<div class="page-header"><h2>Keikat muissa baareissa</h2></div><p style="color:var(--text2); font-size:13px; max-width:720px;">Muiden baarien avoimet vuorot yhteisen keskuksen kautta. Kun haet vuoroa, nimesi, yhteystietosi ja viestisi lähetetään vain sille baarille, jonka vuoroa haet.</p>`;
    if (f.loading) return head + `<div class="card card-sm"><p style="margin:0; color:var(--text2);">Haetaan uusia vuoroja…</p></div>`;
    if (f.error) return head + `<div class="card card-sm"><p style="margin:0; color:var(--red);">${esc(f.error)}</p></div>`;
    if (f.enabled === false) return head + `<div class="card card-sm"><p style="margin:0; color:var(--text2);">Toiminto ei ole käytössä tässä baarissa.</p></div>`;
    const mine = (f.applications || []);
    const stat = { pending: 'Odottaa vastausta', accepted: 'Hyväksytty', declined: 'Ei valittu' };
    const myHtml = mine.length ? `<div class="card card-sm" style="max-width:760px; margin-bottom:14px;"><h3 style="margin:0 0 8px; font-size:15px;">Omat hakemukseni</h3>${mine.map(a => `<div class="att-row" style="flex-wrap:wrap; gap:8px;">
        <div style="flex:1; min-width:200px;"><b>${esc(a.bar_name)}</b> <small>${esc(a.city || '')}</small><br><small>${formatDate(a.date)} ${esc(gigTime(a))} ${esc(a.role || '')}</small>
        ${a.status === 'accepted' ? `<br><small><b>Hyväksytty.</b> Baari ottaa sinuun yhteyttä antamillasi yhteystiedoilla.${a.address ? ' Osoite: ' + esc(a.address) : ''}</small>` : ''}</div>
        <span class="badge ${a.status === 'accepted' ? 'badge-green' : ''}">${stat[a.status] || ''}</span>
        ${a.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="gigWithdraw(${a.id})">Peru</button>` : ''}</div>`).join('')}</div>` : '';
    const list = f.shifts || [];
    const body = list.length ? `<div class="card card-sm" style="max-width:760px;">${list.map(s => `<div class="att-row" style="flex-wrap:wrap; gap:8px; align-items:flex-start;">
        <div style="flex:1; min-width:220px;"><b>${esc(s.bar_name)}</b> <small>${esc(s.city || '')}</small><br>
        <span>Haetaan työntekijää${s.role ? ' (' + esc(s.role) + ')' : ''}</span><br>
        <small>${formatDate(s.date)} klo ${esc(gigTime(s))}${s.pay_text ? ' · ' + esc(s.pay_text) : ''}</small>${s.note ? `<br><small>${esc(s.note)}</small>` : ''}</div>
        ${s.my_status ? `<span class="badge">${stat[s.my_status] || 'Haettu'}</span>` : `<button class="btn btn-primary btn-sm" onclick="gigApplyModal(${s.id})">Hae vuoroa</button>`}
    </div>`).join('')}</div>` : `<div class="card card-sm" style="max-width:760px;"><p style="margin:0; color:var(--text2);">Ei avoimia vuoroja muissa baareissa juuri nyt. Voit ottaa ilmoitukset käyttöön omassa profiilissasi.</p></div>`;
    return head + myHtml + body;
}
function gigApplyModal(id) {
    const f = state.gigFeed || {}; const s = (f.shifts || []).find(x => x.id === id); if (!s) return;
    const pr = f.profile || {};
    const body = `<p style="margin:0 0 10px; font-size:14px;"><b>${esc(s.bar_name)}</b>, ${formatDate(s.date)} klo ${esc(gigTime(s))}${s.role ? ' (' + esc(s.role) + ')' : ''}</p>
        <div class="form-group"><label class="form-label">Puhelinnumero</label><input id="gig-phone" class="form-input" maxlength="40" value="${esc(pr.phone || '')}"></div>
        <div class="form-group"><label class="form-label">Sähköposti</label><input id="gig-email" type="email" class="form-input" maxlength="190" value="${esc(pr.email || '')}"></div>
        <div class="form-group"><label class="form-label">Viesti baarille (valinnainen)</label><textarea id="gig-msg" class="form-input" maxlength="500" rows="3" placeholder="Esim. kokemus ja milloin pääset paikalle"></textarea></div>
        <p style="font-size:12px; color:var(--text3); margin:0;">Nimesi (${esc(pr.name || '')}), yhteystietosi ja viestisi lähetetään vain baarille ${esc(s.bar_name)}. Oma baarisi ei näe, mitä lähetät.</p>`;
    openModal('Hae vuoroa toisesta baarista', 'bi-send', body, `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="gigApply(${id})">Lähetä hakemus</button>`);
}
async function gigApply(id) {
    const phone = document.getElementById('gig-phone').value.trim(), email = document.getElementById('gig-email').value.trim(), message = document.getElementById('gig-msg').value.trim();
    if (!phone && !email) return showToast('Anna puhelinnumero tai sähköposti, jotta baari voi ottaa yhteyttä', 'error');
    const r = await (await fetch('api.php?action=hub_apply', { method: 'POST', body: JSON.stringify({ shiftId: id, phone, email, message }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Hakemus lähetetty'); state.gigFeed = undefined; loadGigFeed();
}
async function gigWithdraw(id) {
    if (!confirm('Perutaanko hakemus?')) return;
    const r = await (await fetch('api.php?action=hub_withdraw', { method: 'POST', body: JSON.stringify({ id }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Hakemus peruttu'); state.gigFeed = undefined; loadGigFeed();
}
