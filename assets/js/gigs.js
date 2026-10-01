// ===================== KEIKKALAISET: oma näkyvyys, kutsut muista baareista, työhistoria =====================
// Keikkalainen päättää itse, näkyykö hän muiden baarien ylläpidolle (oletuksena ei). Näkyvissä vain lyhennetty nimi ja oma kuvaus; ei yhteystietoja.
function renderGigCard() {
    const u = state.data.users.find(x => x.id == state.user.id) || state.user;
    if (state.gigHistory === undefined) loadGigHistory();
    const h = state.gigHistory || [];
    return `<div class="card card-sm" style="max-width:600px; margin-bottom:24px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-briefcase"></i> Keikkatyö</span><div class="section-line"></div></div>
        <label class="abs-choice" style="margin-bottom:10px;"><input id="gig-on" type="checkbox" ${u.gig_available == 1 ? 'checked' : ''}><span><b>Olen haettavissa keikkatöihin</b><br><small>Muiden baarien ylläpito voi löytää sinut ja lähettää kutsun. Heille näkyy vain nimesi lyhennettynä ja alla oleva kuvaus, ei yhteystietojasi eikä nykyisiä työpaikkojasi. Voit poistaa näkyvyyden milloin tahansa.</small></span></label>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Kuvaus (kokemus, roolit, milloin voit)</label><textarea id="gig-note" class="form-input" rows="2" maxlength="300" placeholder="Esim. Baarimestari, anniskelupassi, viikonloput">${esc(u.gig_note || '')}</textarea></div>
        <button class="btn btn-primary btn-sm" onclick="saveGigProfile()"><i class="bi bi-save"></i> Tallenna</button>
        ${h.length ? `<div class="section-header" style="margin-top:22px;"><span class="section-title">Työhistoriasi baareissa</span><div class="section-line"></div></div>
        <table class="bs-table"><thead><tr><th>Baari</th><th>Ensimmäinen leimaus</th><th style="text-align:right">12 kk</th><th style="text-align:right">Yhteensä</th></tr></thead><tbody>${h.map(x => `<tr><td><b>${esc(x.pub)}</b></td><td>${x.first ? formatDate(x.first) : '–'}</td><td style="text-align:right">${x.hours_12m} h</td><td style="text-align:right">${x.hours_total} h</td></tr>`).join('')}</tbody></table>
        <small style="color:var(--text3)">Näet vain omat tietosi; baarit eivät näe toistensa tietoja.</small>` : ''}
    </div>`;
}
async function loadGigHistory() {
    state.gigHistory = [];
    try { const r = await (await fetch('api.php?action=my_history')).json(); if (!r.error) state.gigHistory = r.history; } catch (e) {}
    render();
}
async function saveGigProfile() {
    const r = await postJson('gig_profile', { available: document.getElementById('gig-on').checked, note: document.getElementById('gig-note').value });
    if (r) { showToast('Tallennettu'); load(); }
}

// ---- Saapuvat kutsut (etusivun huomio-ryhmä) ----
function gigInviteRows() {
    return (state.data.gig_incoming || []).map(g => `<div class="att-row" style="flex-wrap:wrap; gap:8px;"><div style="flex:1; min-width:180px;"><b>🏢 ${esc(g.pub_display)}</b> kutsuu sinut keikkalaiseksi
        ${g.message ? `<br><small>“${esc(g.message)}”</small>` : ''}${g.s_date ? `<br><small>Vuoro: ${formatDate(g.s_date)} ${g.s_start.slice(0, 5)}–${g.s_end.slice(0, 5)} ${esc(g.s_role || '')}</small>` : ''}</div>
        <div style="display:flex; gap:6px;"><button class="btn btn-primary btn-sm" style="background:var(--teal); border:none;" onclick="respondGig(${g.id}, true)">Hyväksy</button><button class="btn btn-ghost btn-sm" onclick="respondGig(${g.id}, false)">Hylkää</button></div></div>`).join('');
}
async function respondGig(id, accept) {
    if (accept && !confirm('Hyväksytäänkö kutsu? Sinulle luodaan jäsenyys kyseiseen baariin samalla tunnuksella, ja voit vaihtaa baarien välillä ylälaidan valinnasta. Baarin ylläpito näkee nimesi ja työvuorosi vain heidän baarissaan.')) return;
    const r = await postJson('gig_respond', { inviteId: id, accept });
    if (r) { showToast(accept ? 'Kutsu hyväksytty – baari lisätty' : 'Kutsu hylätty'); state.gigHistory = undefined; load(); }
}

// ---- Admin: keikkalaiset-välilehti ----
function adminTabGigs() {
    if (state.gigPool === undefined) loadGigPool('');
    const pool = state.gigPool || [], out = state.data.gig_outgoing || [];
    const stLabel = { pending: 'Odottaa', accepted: 'Hyväksytty', declined: 'Hylätty', cancelled: 'Peruttu' };
    return `<div class="card card-sm" style="max-width:720px; margin-bottom:16px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-search"></i> Keikkalaiset muista baareista</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Henkilöt, jotka ovat itse ilmoittautuneet haettaviksi keikkatöihin. Näet vain lyhennetyn nimen ja heidän kuvauksensa. Kun henkilö hyväksyy kutsun, hän liittyy baariisi keikkalaisena (aseta tuntipalkka työntekijän tiedoissa).</p>
        <div style="display:flex; gap:8px; margin-bottom:10px;"><input id="gig-q" class="form-input" placeholder="Hae kuvauksesta tai nimestä" onkeydown="if(event.key==='Enter')loadGigPool(this.value)"><button class="btn btn-ghost" onclick="loadGigPool(document.getElementById('gig-q').value)"><i class="bi bi-search"></i></button></div>
        ${pool.length ? pool.map(p => `<div class="att-row" style="align-items:center; gap:8px;"><div style="flex:1; min-width:0;"><b>${esc(p.name)}</b>${p.note ? `<br><small>${esc(p.note)}</small>` : '<br><small style="color:var(--text3)">Ei kuvausta</small>'}</div>
            ${p.invited ? '<span class="badge">Kutsuttu</span>' : `<button class="btn btn-primary btn-sm" onclick="openGigInvite(${p.id})"><i class="bi bi-send"></i> Kutsu</button>`}</div>`).join('') : '<div class="tool-empty">Ei haettavissa olevia keikkalaisia</div>'}
    </div>
    <div class="card card-sm" style="max-width:720px;">
        <div class="section-header"><span class="section-title">Lähetetyt kutsut</span><div class="section-line"></div></div>
        ${out.length ? out.map(g => `<div class="att-row" style="align-items:center;"><div><b>${esc(g.worker)}</b> · ${formatDate(g.created_at.slice(0, 10))}${g.message ? `<br><small>“${esc(g.message)}”</small>` : ''}</div><div style="display:flex; gap:6px; align-items:center;"><span class="badge ${g.status === 'accepted' ? 'badge-teal' : ''}">${stLabel[g.status]}</span>${g.status === 'pending' ? `<button class="btn btn-ghost btn-sm" onclick="cancelGig(${g.id})">Peru</button>` : ''}</div></div>`).join('') : '<div class="tool-empty">Ei lähetettyjä kutsuja</div>'}
    </div>`;
}
async function loadGigPool(q) {
    state.gigPool = state.gigPool || [];
    try { const r = await (await fetch('api.php?action=gig_pool&q=' + encodeURIComponent(q || ''))).json(); if (!r.error) state.gigPool = r.pool; } catch (e) {}
    render();
}
function openGigInvite(userId) {
    const today = getLocalDateString(), open = state.data.shifts.filter(s => !s.userId && s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 30);
    openModal('Kutsu keikkalainen', 'bi-send', `
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Viesti</label><textarea id="gi-msg" class="form-input" rows="3" maxlength="300" placeholder="Esim. Tarvitsemme baarimestaria lauantaille, tuntipalkka sovitaan erikseen."></textarea></div>
        <div class="form-group"><label class="form-label">Avoin vuoro (valinn.)</label><select id="gi-shift" class="form-input"><option value="">Ei tiettyä vuoroa</option>${open.map(s => `<option value="${s.id}">${formatDate(s.date)} ${s.start.slice(0, 5)}–${s.end.slice(0, 5)} ${esc(s.role || '')}</option>`).join('')}</select>
        <small style="color:var(--text3)">Jos valitset vuoron, se annetaan henkilölle automaattisesti kun hän hyväksyy kutsun.</small></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="sendGigInvite(${userId})">Lähetä kutsu</button>`);
}
async function sendGigInvite(userId) {
    const r = await postJson('gig_invite', { userId, message: document.getElementById('gi-msg').value, shiftId: document.getElementById('gi-shift').value || null });
    if (r) { closeModal(); showToast('Kutsu lähetetty'); state.gigPool = undefined; load(); }
}
async function cancelGig(id) { if (await postJson('gig_cancel', { id })) load(); }
