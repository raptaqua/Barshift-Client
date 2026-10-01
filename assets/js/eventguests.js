// ===================== TAPAHTUMAN VIERASLISTA (sisäinen) =====================
// Henkilökunta lisää nimiä tapahtumaan (esim. maistelutilaisuus, 25 paikkaa). Tiedot näkyvät vain kirjautuneille baarin työntekijöille,
// eikä niitä palauteta julkisiin rajapintoihin (kalenteri, RSS, iCal, widget).
function eventGuestsOf(eid) { return (state.data.event_guests || []).filter(g => g.event_id == eid); }
function guestBadge(e) {
    if (e.guest_capacity === null || e.guest_capacity === undefined) return '';
    return `<button class="btn btn-ghost btn-sm" onclick="openGuestList(${e.id})"><i class="bi bi-list-check"></i> Vieraslista ${eventGuestsOf(e.id).length}/${e.guest_capacity}</button>`;
}
function openGuestList(eid) {
    const e = (state.data.events || []).find(x => x.id == eid); if (!e) return;
    const list = eventGuestsOf(eid), cap = e.guest_capacity, full = list.length >= cap, mgr = can('events.manage');
    const who = id => { const u = (state.data.users || []).find(x => x.id == id); return u ? u.name.split(' ')[0] : ''; };
    const rows = list.map((g, i) => {
        return `<div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-top:1px solid var(--border);">
            <span style="width:26px; color:var(--text3); font-size:12px;">${i + 1}.</span>
            <div style="flex:1; min-width:0;"><b>${esc(g.name)}</b>${g.note ? `<br><small style="color:var(--text2)">${esc(g.note)}</small>` : ''}<small style="color:var(--text3); display:block;">lisännyt ${esc(who(g.added_by) || '–')}</small></div>
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Muokkaa" onclick="editGuest(${eid}, ${g.id})"><i class="bi bi-pencil"></i></button><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="removeGuest(${eid}, ${g.id})"><i class="bi bi-x-lg"></i></button></div>`;
    }).join('');
    openModal(`Vieraslista: ${esc(e.title)}`, 'bi-list-check', `
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;"><span>${formatDate(e.date)} klo ${(e.time_start || e.time || '').slice(0, 5)}</span><b style="color:${full ? 'var(--red, #dc2626)' : 'var(--teal)'}">${list.length} / ${cap} ${full ? '· täynnä' : '· ' + (cap - list.length) + ' vapaana'}</b></div>
        <div class="leave-box" style="font-size:12px; margin-bottom:10px;"><i class="bi bi-lock"></i> Lista näkyy vain baarin työntekijöille – ei koskaan baarin ulkopuolelle.</div>
        ${full ? '' : `<div class="form-row" style="margin-bottom:10px;"><input id="gl-name" class="form-input" maxlength="100" placeholder="Nimi" onkeydown="if(event.key==='Enter')addGuest(${eid})"><input id="gl-note" class="form-input" maxlength="200" placeholder="Huomio (valinn.)" onkeydown="if(event.key==='Enter')addGuest(${eid})"><button class="btn btn-primary" onclick="addGuest(${eid})"><i class="bi bi-plus-lg"></i></button></div>`}
        ${rows || '<div class="tool-empty">Ei vielä nimiä.</div>'}`,
        `${mgr && list.length ? `<a class="btn btn-ghost" href="api.php?action=event_guests_csv&event_id=${eid}"><i class="bi bi-download"></i> CSV</a>` : ''}<button class="btn btn-primary" onclick="closeModal()">Valmis</button>`);
    setTimeout(() => { const i = document.getElementById('gl-name'); if (i) i.focus(); }, 50);
}
async function guestSave(eid, body) {
    const res = await fetch('api.php?action=event_guest', { method: 'POST', body: JSON.stringify({ event_id: eid, ...body }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(j.error || 'Tallennus epäonnistui', 'error'); return false; }
    await load(); openGuestList(eid); return true;
}
function addGuest(eid) { const n = document.getElementById('gl-name').value.trim(); if (!n) return; guestSave(eid, { name: n, note: document.getElementById('gl-note').value.trim() }); }
function editGuest(eid, gid) {
    const g = eventGuestsOf(eid).find(x => x.id == gid); if (!g) return;
    const n = prompt('Nimi', g.name); if (n === null || !n.trim()) return;
    const note = prompt('Huomio (tyhjä = ei huomiota)', g.note || ''); if (note === null) return;
    guestSave(eid, { id: gid, name: n.trim(), note: note.trim() });
}
async function removeGuest(eid, gid) {
    const res = await fetch(`api.php?id=${gid}&type=event_guest`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json().catch(() => ({})); return showToast(j.error || 'Poisto epäonnistui', 'error'); }
    await load(); openGuestList(eid);
}
