// ===================== VIERASKORTISTO (valinnainen ominaisuus; Hallinta → Vieraat) =====================
// Kanta-asiakkaat, VIP-merkinnät, allergiat ja käyntihistoria (varaukset ja tapahtumailmoittautumiset). Vain henkilökunnalle.
function guestBookingBadges(b) {
    if (!pubFeature('guests')) return '';
    if (b.guest_id) return ` <a href="#" onclick="openGuestModal(${b.guest_id}); return false;" title="Avaa vieraskortti">${b.vip ? '<span class="badge" style="background:#F59E0B33; color:#B45309;">⭐ VIP</span>' : '<span class="badge" style="background:var(--surface2); color:var(--text2);">kortistossa</span>'}${b.allergies ? ` <span class="badge" style="background:#E11D4822; color:#E11D48;" title="Allergiat">⚠ ${esc(b.allergies)}</span>` : ''}</a>`;
    return can('events.manage') ? ` <a href="#" style="font-size:12px;" onclick="guestFromBooking(${b.id}); return false;">+ kortistoon</a>` : '';
}
async function guestFromBooking(bid) {
    const res = await fetch('api.php?action=guest_from_booking', { method: 'POST', body: JSON.stringify({ booking_id: bid }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Lisäys epäonnistui', 'error');
    await load(); openGuestModal(j.id);
}
async function loadGuests() {
    const q = state.guestQuery || ''; state.guestsLoading = q;
    try { const r = await (await fetch('api.php?action=guests&q=' + encodeURIComponent(q))).json(); state.guestsData = { q, list: r.guests || [], error: r.error }; }
    catch (e) { state.guestsData = { q, list: [], error: 'Lataus epäonnistui' }; }
    render();
}
function setGuestQuery(v) { clearTimeout(window._gqT); window._gqT = setTimeout(() => { state.guestQuery = v.trim(); state.guestsData = null; render(); setTimeout(() => { const i = document.getElementById('guest-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 50); }, 300); }
function adminTabGuests() {
    if (!pubFeature('guests')) return '<div class="card card-sm"><p style="margin:0; color:var(--text2);">Vieraskortisto ei ole käytössä. Ota se käyttöön kohdassa <b>Hallinta → Baari → Muut valinnaiset ominaisuudet</b>.</p></div>';
    const q = state.guestQuery || '';
    if ((!state.guestsData || state.guestsData.q !== q) && state.guestsLoading !== q) loadGuests();
    const d = state.guestsData && state.guestsData.q === q ? state.guestsData : null;
    let body;
    if (!d) body = '<div class="tool-empty">Ladataan…</div>';
    else if (d.error) body = `<div class="leave-box warn">${esc(d.error)}</div>`;
    else if (!d.list.length) body = `<div class="tool-empty">${q ? 'Ei hakua vastaavia vieraita.' : 'Kortisto on tyhjä. Lisää vieraita yllä tai "+ kortistoon" -linkistä Varaukset-välilehdellä.'}</div>`;
    else body = d.list.map(g => `<div class="att-row" onclick="openGuestModal(${g.id})" style="cursor:pointer;"><div><b>${g.vip == 1 ? '⭐ ' : ''}${esc(g.name)}</b>${g.no_shows > 0 ? ` <span class="badge" style="background:#E11D4822; color:#E11D48;">${g.no_shows}× ei tullut</span>` : ''}${g.allergies ? ` <span class="badge" style="background:#E11D4822; color:#E11D48;">⚠ ${esc(g.allergies)}</span>` : ''}
        <br><small style="color:var(--text2);">${g.phone ? '📞 ' + esc(g.phone) + ' ' : ''}${g.email ? '✉ ' + esc(g.email) : ''}${g.tags ? ' · ' + esc(g.tags) : ''}</small></div>
        <div style="text-align:right; font-size:12px; color:var(--text3);">${g.visits} käyntiä${g.last_visit ? '<br>viim. ' + fullDate(g.last_visit.slice(0, 10)) : ''}</div></div>`).join('');
    return `<div class="card card-sm" style="max-width:800px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-person-heart"></i> Vieraskortisto</span><div class="section-line"></div></div>
        <div style="display:flex; gap:8px; margin-bottom:12px;"><input id="guest-q" class="form-input" placeholder="Hae nimellä, sähköpostilla, puhelimella tai tunnisteella" value="${esc(q)}" oninput="setGuestQuery(this.value)"><button class="btn btn-primary" onclick="openGuestModal()"><i class="bi bi-plus-lg"></i></button></div>
        ${body}
        <div style="font-size:12px; color:var(--text3); margin-top:12px;"><i class="bi bi-lock"></i> Tiedot näkyvät vain henkilökunnalle. Vieraat, joilla ei ole ollut käyntejä 24 kuukauteen, poistetaan automaattisesti. Poista vieras pyynnöstä vieraskortin roskakorista.</div></div>`;
}
async function openGuestModal(id) {
    let g = {}, hist = null;
    if (id) {
        const all = (state.guestsData && state.guestsData.list) || []; g = all.find(x => x.id == id) || null;
        if (!g) { const r = await (await fetch('api.php?action=guests&q=')).json().catch(() => ({})); g = (r.guests || []).find(x => x.id == id) || {}; }
        hist = await (await fetch('api.php?action=guest_history&id=' + id)).json().catch(() => null);
    }
    state.editingGuest = id || null;
    const STAT = { confirmed: 'vahvistettu', seated: 'paikalla', no_show: 'ei tullut', cancelled: 'peruttu', declined: 'hylätty', pending: 'odottaa' };
    const histHtml = hist && !hist.error ? `<div style="margin-top:14px; font-size:13px;"><b>Käyntihistoria</b>
        ${(hist.bookings || []).slice(0, 12).map(b => `<div style="padding:3px 0; border-top:1px solid var(--border);">${fullDate(b.starts_at.slice(0, 10))} ${b.starts_at.slice(11, 16)} · ${b.party_size} hlö · ${STAT[b.status] || b.status}${b.note ? ' · ' + esc(b.note) : ''}</div>`).join('')}
        ${(hist.events || []).slice(0, 8).map(e => `<div style="padding:3px 0; border-top:1px solid var(--border);">${fullDate(e.date)} · ${esc(e.title)} · ${e.qty} hlö${e.arrived == 1 ? ' · saapui' : ''}</div>`).join('')}
        ${!(hist.bookings || []).length && !(hist.events || []).length ? '<div class="tool-empty">Ei käyntejä.</div>' : ''}</div>` : '';
    const f = (idn, label, val, extra = '') => `<div class="form-group" style="margin-bottom:10px;"><label class="form-label">${label}</label><input id="${idn}" class="form-input" ${extra} value="${esc(val || '')}"></div>`;
    openModal(id ? 'Vieraskortti' : 'Uusi vieras', 'bi-person-heart', `
        ${f('gu-name', 'Nimi', g.name, 'maxlength="100"')}
        <div class="form-row">${f('gu-email', 'Sähköposti', g.email, 'type="email" maxlength="150"')}${f('gu-phone', 'Puhelin', g.phone, 'maxlength="30"')}</div>
        <label class="abs-choice" style="margin-bottom:10px;"><input id="gu-vip" type="checkbox" ${g.vip == 1 ? 'checked' : ''}><span><b>⭐ VIP / kanta-asiakas</b></span></label>
        ${f('gu-allergies', 'Allergiat / ruokavalio', g.allergies, 'maxlength="200"')}
        ${f('gu-tags', 'Tunnisteet (pilkulla erotettuna)', g.tags, 'maxlength="200" placeholder="esim. viiniharrastaja, yritysasiakas"')}
        <div class="form-group"><label class="form-label">Muistiinpanot</label><textarea id="gu-notes" class="form-input" rows="3" maxlength="600">${esc(g.notes || '')}</textarea></div>${histHtml}`,
        `${id ? `<button class="btn btn-danger" onclick="deleteGuest(${id})"><i class="bi bi-trash"></i></button>` : ''}<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="saveGuest()">Tallenna</button>`);
}
async function saveGuest() {
    const v = i => document.getElementById(i).value.trim();
    const body = { id: state.editingGuest, name: v('gu-name'), email: v('gu-email'), phone: v('gu-phone'), vip: document.getElementById('gu-vip').checked ? 1 : 0, allergies: v('gu-allergies'), tags: v('gu-tags'), notes: document.getElementById('gu-notes').value };
    if (!body.name) return showToast('Anna nimi', 'error');
    const res = await fetch('api.php?action=guest', { method: 'POST', body: JSON.stringify(body) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    closeModal(); showToast('Tallennettu'); state.guestsData = null; load();
}
async function deleteGuest(id) {
    if (!confirm('Poistetaanko vieras kortistosta? Varaushistoria säilyy varauksissa.')) return;
    await fetch(`api.php?id=${id}&type=guest`, { method: 'DELETE' }); closeModal(); showToast('Poistettu'); state.guestsData = null; load();
}
