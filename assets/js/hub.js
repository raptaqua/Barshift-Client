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
    if (decision === 'accepted' && !confirm('Hyväksytäänkö hakija? Muut tämän vuoron hakijat hylätään ja hakijan yhteystiedot tulevat näkyviin.')) return;
    const r = await (await fetch('api.php?action=hub_decide', { method: 'POST', body: JSON.stringify({ id, decision }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Päätös tallennettu'); state.gigApps = undefined; load();
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
