// ===================== YHTEISHAKU (Ctrl/⌘+K tai yläpalkin suurennuslasi) =====================
const SEARCH_TYPES = {
    user: ['bi-person', 'Työntekijä'], event: ['bi-music-note-beamed', 'Tapahtuma'], shift: ['bi-calendar-week', 'Vuoro'], notice: ['bi-megaphone', 'Ilmoitus'], document: ['bi-file-earmark-text', 'Dokumentti'],
    shopping: ['bi-cart', 'Puutelista'], message: ['bi-chat-dots', 'Viesti'], cash: ['bi-cash-coin', 'Kassatilitys'], booking: ['bi-calendar2-check', 'Varaus'], guest: ['bi-person-heart', 'Vieras'], event_guest: ['bi-list-check', 'Vieraslista']
};
function openSearch() {
    openModal('Haku', 'bi-search', `<input id="sr-q" class="form-input" placeholder="Hae työntekijöitä, vuoroja, tapahtumia, viestejä…" autocomplete="off" oninput="runSearchSoon(this.value)" onkeydown="if(event.key==='Enter'){const f=document.querySelector('.sr-item'); if(f) f.click();}">
        <div id="sr-out" style="margin-top:10px; max-height:55vh; overflow:auto;"><div class="tool-empty">Kirjoita vähintään 2 merkkiä.</div></div>`, '');
    document.getElementById('modal-footer-el').innerHTML = '';
    setTimeout(() => { const i = document.getElementById('sr-q'); if (i) i.focus(); }, 50);
}
let _srT = null, _srSeq = 0;
function runSearchSoon(q) { clearTimeout(_srT); _srT = setTimeout(() => runSearch(q), 250); }
async function runSearch(q) {
    const out = document.getElementById('sr-out'); if (!out) return;
    q = q.trim(); if (q.length < 2) { out.innerHTML = '<div class="tool-empty">Kirjoita vähintään 2 merkkiä.</div>'; return; }
    const seq = ++_srSeq;
    const r = await (await fetch('api.php?action=search&q=' + encodeURIComponent(q))).json().catch(() => ({}));
    if (seq !== _srSeq || !document.getElementById('sr-out')) return;
    state.searchResults = r.results || [];
    out.innerHTML = state.searchResults.length ? state.searchResults.map((x, i) => { const t = SEARCH_TYPES[x.type] || ['bi-search', '']; return `<div class="att-row sr-item" style="cursor:pointer;" onclick="openSearchResult(${i})"><div style="display:flex; gap:10px; align-items:center;"><i class="bi ${t[0]}" style="color:var(--accent); font-size:18px;"></i><div><b>${esc(x.label)}</b><br><small style="color:var(--text2);">${t[1]}${x.sub ? ' · ' + esc(x.sub) : ''}</small></div></div></div>`; }).join('') : '<div class="tool-empty">Ei tuloksia.</div>';
}
function openSearchResult(i) {
    const x = (state.searchResults || [])[i]; if (!x) return;
    closeModal();
    switch (x.type) {
        case 'user': if (state.user.role === 'admin') { setAdminTab('users'); nav('admin'); openUserModal(x.id); } else nav('team'); break;
        case 'event': nav('events'); break;
        case 'shift': state.shiftGridDate = new Date(x.date + 'T12:00:00'); state.currentDate = new Date(x.date + 'T12:00:00'); nav('list'); break;
        case 'notice': nav('dashboard'); break;
        case 'document': case 'shopping': nav(x.type === 'document' ? 'team' : 'dashboard'); break;
        case 'message': nav('messages'); setTimeout(() => openChatModal(x.id), 50); break;
        case 'cash': openCashModal(x.date); break;
        case 'booking': setAdminTab('bookings'); nav('admin'); break;
        case 'guest': setAdminTab('guests'); nav('admin'); setTimeout(() => openGuestModal(x.id), 100); break;
        case 'event_guest': nav('events'); setTimeout(() => openGuestList(x.id), 100); break;
    }
}
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.user && !state.need2fa) { e.preventDefault(); openSearch(); }
});
