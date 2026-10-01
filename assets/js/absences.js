// ===================== ABSENCES VIEW =====================
// ===================== VUOSILOMA (lomalaskenta: leave.js) =====================
function leaveHoursInMonth(userId) {   // toteutuneet työtunnit: leimaukset, muuten menneet suunnitellut vuorot
    const today = getLocalDateString();
    const byMonth = {}, planned = {};
    (state.data.time_entries || []).forEach(t => {
        if (t.user_id != userId || !t.clock_out || String(t.clock_out).startsWith('0000')) return;
        const h = (new Date(t.clock_out.replace(' ', 'T')) - new Date(t.clock_in.replace(' ', 'T'))) / 3600000;
        if (h > 0 && h < 24) byMonth[t.clock_in.slice(0, 7)] = (byMonth[t.clock_in.slice(0, 7)] || 0) + h;
    });
    (state.data.shifts || []).forEach(sh => {
        if (sh.userId != userId || !sh.date || sh.date >= today) return;
        let h = (parseInt(sh.end.slice(0, 2)) * 60 + parseInt(sh.end.slice(3, 5)) - parseInt(sh.start.slice(0, 2)) * 60 - parseInt(sh.start.slice(3, 5))) / 60;
        if (h <= 0) h += 24;
        planned[sh.date.slice(0, 7)] = (planned[sh.date.slice(0, 7)] || 0) + h;
    });
    return ym => byMonth[ym] || planned[ym] || 0;
}
function userLeave(userId, opts = {}) {
    const u = (state.data.users || []).find(x => x.id == userId);
    if (!u || !window.BSLeave) return null;
    return BSLeave.summary(u, state.data.absences || [], Object.assign({ today: getLocalDateString(), hoursInMonth: leaveHoursInMonth(userId) }, opts));
}
const fnum = n => BSLeave.fmtNum(n);
function fullDate(str) { const d = new Date(str + 'T00:00:00'); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; }
function tenureText(startDate) {
    if (!startDate) return '';
    const s = new Date(startDate + 'T00:00:00'), n = new Date();
    let m = (n.getFullYear() - s.getFullYear()) * 12 + n.getMonth() - s.getMonth() - (n.getDate() < s.getDate() ? 1 : 0);
    if (m < 0) return 'ei vielä aloittanut';
    const y = Math.floor(m / 12); m = m % 12;
    return [y ? `${y} v` : '', m || !y ? `${m} kk` : ''].filter(Boolean).join(' ');
}

/** Lomasaldo: full = iso kortti (profiili/poissaolot), muuten tiivis rivi (hyväksyntäkortti). req = {days, type}. */
function renderLeaveBlock(userId, opts = {}) {
    const u = (state.data.users || []).find(x => x.id == userId) || {};
    const sum = userLeave(userId, opts.leaveOpts || {});
    if (!sum) return '';
    const canEdit = state.user.role === 'admin';
    if (!sum.hasStart) {
        return `<div class="leave-box warn"><i class="bi bi-exclamation-triangle"></i> Työsuhteen aloituspäivä puuttuu, joten lomaa ei voi laskea.${canEdit ? ` <a href="#" onclick="event.preventDefault(); openUserModal(${u.id})">Lisää aloituspäivä</a>` : ''}</div>`;
    }
    const req = opts.req, reqDays = req && req.type === 'vacation' ? req.days : 0;
    const after = sum.remaining - reqDays, over = reqDays > 0 && after < 0;
    const r = sum.leaveYear, range = `${fullDate(sum.range.start)} – ${fullDate(sum.range.end)}`;
    const type = u.employment_type === 'casual' ? 'Keikkalainen' : 'Vakituinen';
    const nextTxt = sum.next.complete ? '' : `Kertyy ensi lomavuodelle: ${sum.next.earned} pv tähän mennessä, arvio vuoden loppuun ${sum.next.projected} pv`;

    const stat = (label, value, cls = '') => `<div class="leave-stat ${cls}"><div class="leave-num">${value}</div><div class="leave-lbl">${label}</div></div>`;
    let html = `<div class="leave-box ${over ? 'warn' : ''}">
        <div class="leave-title"><i class="bi bi-umbrella"></i> Vuosiloma ${r}–${r + 1}
            <span class="leave-tag">${type}</span></div>
        <div class="leave-grid">
            ${stat('Kertynyt', fnum(sum.entitled) + ' pv')}
            ${stat('Käytetty', fnum(sum.used) + ' pv')}
            ${sum.pending > 0 ? stat('Odottaa', fnum(sum.pending) + ' pv') : ''}
            ${stat(reqDays > 0 ? 'Jäljellä nyt' : 'Jäljellä', fnum(sum.remaining) + ' pv', 'strong')}
            ${reqDays > 0 ? stat('Tämän jälkeen', fnum(after) + ' pv', over ? 'bad' : 'good') : ''}
        </div>`;
    if (req && req.type === 'vacation') html += `<div class="leave-line ${over ? 'bad' : ''}">Hakemus kuluttaa <b>${reqDays} loma-arkipäivää</b> (ma–la, ilman pyhiä)${over ? ` – <b>ylittää kertyneen lomasaldon ${fnum(-after)} pv</b>` : ''}.</div>`;
    else if (req) html += `<div class="leave-line">Muu poissaolo ei kuluta vuosilomaa.</div>`;
    if (!opts.compact) {
        html += `<div class="leave-line">Lomavuosi ${range}. Kertymä: ${fnum(sum.rate)} pv / täysi kuukausi (${sum.rate === 2.5 ? 'työsuhde kestänyt vähintään vuoden' : 'työsuhde alle vuoden'}).</div>`;
        if (nextTxt) html += `<div class="leave-line">${nextTxt}.</div>`;
        html += `<div class="leave-line muted">Aloittanut ${fullDate(u.start_date)} (${tenureText(u.start_date)}).</div>`;
    }
    if (sum.casual) html += `<div class="leave-line muted"><i class="bi bi-info-circle"></i> Keikkalaisella kuukausi kerryttää lomaa, kun työtunteja on vähintään 35 h. Loma voidaan korvata rahana: lomakorvaus ${fnum(sum.compensationPct)} % palkasta.</div>`;
    return html + `</div>`;
}

// ===================== POISSAOLOT =====================
const ABS_TYPES = { sick: { label: 'Sairasloma', icon: '🤒' }, vacation: { label: 'Loma', icon: '✈️' }, other: { label: 'Muu poissaolo', icon: '❓' } };
const ABS_STATUS = {
    pending:  { label: 'Odottaa käsittelyä', color: '#F59E0B' },
    approved: { label: 'Hyväksytty',         color: '#0D9488' },
    rejected: { label: 'Hylätty',            color: '#E11D48' }
};

function absLeaveDays(a) { return BSLeave.leaveDays(a.start_date, a.end_date); }
function absDays(a) {
    const s = new Date(a.start_date + 'T00:00:00'), e = new Date(a.end_date + 'T00:00:00');
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}
function absShifts(a, onlyFreed = false) {   // käyttäjän vuorot poissaolon aikana (tai vapautetut vuorot)
    return (state.data.shifts || []).filter(sh => sh.date >= a.start_date && sh.date <= a.end_date &&
        (onlyFreed ? (!sh.userId && sh.original_userId == a.user_id) : sh.userId == a.user_id));
}
function absOverlaps(a) {   // muut hyväksytyt poissaolot samalla ajalla
    return (state.data.absences || []).filter(x => x.id != a.id && x.status === 'approved' && x.user_id != a.user_id &&
        x.start_date <= a.end_date && x.end_date >= a.start_date)
        .map(x => (state.data.users.find(u => u.id == x.user_id) || {}).name).filter(Boolean);
}
function setAbsFilter(f) { state.absFilter = f; render(); }

function renderAbsenceCard(a, isAdmin) {
    const u = state.data.users.find(x => x.id == a.user_id) || {};
    const type = ABS_TYPES[a.type] || ABS_TYPES.other, st = ABS_STATUS[a.status] || ABS_STATUS.pending;
    const days = absDays(a), sameDay = a.start_date === a.end_date;
    const mine = a.user_id == state.user.id, pending = a.status === 'pending';
    const nShifts = absShifts(a).length, nFreed = absShifts(a, true).length, overlaps = absOverlaps(a);
    const created = a.created_at ? formatDate(a.created_at.split(' ')[0]) : '';

    const notes = [];
    if (nShifts > 0 && a.status !== 'rejected' && a.end_date >= getLocalDateString()) notes.push(`<span class="abs-note warn"><i class="bi bi-exclamation-triangle"></i> ${nShifts} vuoroa osuu jaksolle</span>`);
    if (nFreed > 0) notes.push(`<span class="abs-note"><i class="bi bi-unlock"></i> ${nFreed} vuoroa vapautettu</span>`);
    if (isAdmin && overlaps.length > 0 && pending) notes.push(`<span class="abs-note warn"><i class="bi bi-people"></i> Samaan aikaan poissa: ${overlaps.map(esc).join(', ')}</span>`);

    let actions = '';
    if (isAdmin && pending) {
        actions = `<button class="btn btn-sm abs-approve" onclick="decideAbsence(${a.id}, 'approved')"><i class="bi bi-check-lg"></i> Hyväksy</button>
                   <button class="btn btn-sm abs-reject" onclick="decideAbsence(${a.id}, 'rejected')"><i class="bi bi-x-lg"></i> Hylkää</button>`;
    } else if (isAdmin && a.status === 'approved') {
        actions = `<button class="btn btn-ghost btn-sm" onclick="decideAbsence(${a.id}, 'rejected')"><i class="bi bi-arrow-counterclockwise"></i> Peru hyväksyntä</button>`;
    } else if (isAdmin && a.status === 'rejected') {
        actions = `<button class="btn btn-ghost btn-sm" onclick="decideAbsence(${a.id}, 'approved')"><i class="bi bi-check-lg"></i> Hyväksy sittenkin</button>`;
    }
    const canEdit = mine && pending;
    const canDelete = (mine && (pending || a.status === 'rejected')) || isAdmin;

    return `
    <div class="card card-sm abs-card" style="border-left: 4px solid ${st.color};">
        <div class="abs-head">
            <div class="abs-who">
                <span class="abs-dot" style="background:${esc(u.color || '#94A3B8')}"></span>
                <div><div class="abs-name">${esc(u.name || 'Tuntematon')}${mine && isAdmin ? ' <span class="abs-you">(sinä)</span>' : ''}</div>
                <div class="abs-sub">${type.icon} ${type.label}${created ? ` · ilmoitettu ${created}` : ''}</div></div>
            </div>
            <span class="badge" style="background:${st.color}22; color:${st.color}; border:1px solid ${st.color}55;">${st.label}</span>
        </div>
        <div class="abs-dates"><i class="bi bi-calendar-range"></i> ${sameDay ? formatDate(a.start_date) : `${formatDate(a.start_date)} – ${formatDate(a.end_date)}`} <span class="abs-days">${days} ${days === 1 ? 'päivä' : 'päivää'}</span></div>
        ${a.description ? `<div class="abs-desc">“${esc(a.description)}”</div>` : ''}
        ${notes.length ? `<div class="abs-notes">${notes.join('')}</div>` : ''}
        ${(isAdmin || mine) && a.type !== 'sick' && pending ? renderLeaveBlock(a.user_id, { compact: true, leaveOpts: { refDate: a.start_date, excludeId: a.id }, req: { days: absLeaveDays(a), type: a.type } }) : ''}
        ${(actions || canEdit || canDelete) ? `<div class="abs-actions">
            <div class="abs-decide">${actions}</div>
            <div class="abs-manage">
                ${canEdit ? `<button class="btn btn-ghost btn-sm btn-icon" title="Muokkaa" aria-label="Muokkaa" onclick="openAbsenceModal(${a.id})"><i class="bi bi-pencil"></i></button>` : ''}
                ${canDelete ? `<button class="btn btn-danger btn-sm btn-icon" title="Poista" aria-label="Poista" onclick="deleteItem(${a.id}, 'absence')"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        </div>` : ''}
    </div>`;
}

function renderAbsences() {
    const isAdmin = can('absences.approve');
    const all = (state.data.absences || []).filter(a => isAdmin || a.user_id == state.user.id);
    const count = k => k === 'all' ? all.length : all.filter(a => a.status === k).length;
    let filter = state.absFilter || (count('pending') > 0 ? 'pending' : 'all');
    const shown = all.filter(a => filter === 'all' || a.status === filter)
        .sort((x, y) => filter === 'pending' ? x.start_date.localeCompare(y.start_date) : y.start_date.localeCompare(x.start_date));

    const pills = [['pending', 'Odottaa'], ['approved', 'Hyväksytyt'], ['rejected', 'Hylätyt'], ['all', 'Kaikki']]
        .map(([k, l]) => `<button class="pill ${filter === k ? 'active' : ''}" onclick="setAbsFilter('${k}')">${l} <span class="abs-pill-count">${count(k)}</span></button>`).join('');
    const emptyText = { pending: isAdmin ? 'Ei käsittelyä odottavia poissaoloja 🎉' : 'Ei odottavia hakemuksia', approved: 'Ei hyväksyttyjä poissaoloja', rejected: 'Ei hylättyjä poissaoloja', all: 'Ei poissaoloilmoituksia' }[filter];

    const view = state.absView || 'list';
    const viewTabs = `<div class="abs-pills" style="margin-bottom:12px;"><button class="pill ${view === 'list' ? 'active' : ''}" onclick="setAbsView('list')"><i class="bi bi-list-ul"></i> Lista</button><button class="pill ${view === 'calendar' ? 'active' : ''}" onclick="setAbsView('calendar')"><i class="bi bi-calendar3"></i> Poissaolokalenteri</button></div>`;
    if (view === 'calendar') return `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div class="page-title">Poissaolot</div>
            ${can('absences.request') || can('absences.approve') ? '<button class="btn btn-primary" onclick="openAbsenceModal()"><i class="bi bi-calendar-plus"></i> Ilmoita uusi poissaolo</button>' : ''}
        </div>${viewTabs}${renderAbsenceCalendar(isAdmin)}`;
    return `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div class="page-title">Poissaolot</div>
            ${can('absences.request') || can('absences.approve') ? '<button class="btn btn-primary" onclick="openAbsenceModal()"><i class="bi bi-calendar-plus"></i> Ilmoita uusi poissaolo</button>' : ''}
        </div>
        ${viewTabs}
        ${isAdmin && count('pending') > 0 && filter !== 'pending' ? `<div class="abs-banner" onclick="setAbsFilter('pending')"><i class="bi bi-bell"></i> ${count('pending')} poissaoloa odottaa käsittelyäsi <span>Näytä →</span></div>` : ''}
        ${!isAdmin ? renderLeaveBlock(state.user.id, {}) : ''}
        <div class="abs-pills">${pills}</div>
        ${shown.length === 0 ? `<div class="empty-state"><i class="bi bi-calendar-x"></i><p>${emptyText}</p></div>` : shown.map(a => renderAbsenceCard(a, isAdmin)).join('')}`;
}

// Päätös: hyväksy / hylkää / peru. Vuoroihin vaikuttavissa tapauksissa kysytään valinta ikkunassa.
function decideAbsence(id, status) {
    const a = (state.data.absences || []).find(x => x.id == id);
    if (!a) return;
    const u = state.data.users.find(x => x.id == a.user_id) || {};
    const type = ABS_TYPES[a.type] || ABS_TYPES.other;
    const nShifts = absShifts(a).length, nFreed = absShifts(a, true).length;
    const leaveInfo = a.type !== 'sick' ? renderLeaveBlock(a.user_id, { compact: true, leaveOpts: { refDate: a.start_date, excludeId: a.id }, req: { days: absLeaveDays(a), type: a.type } }) : '';
    const summary = `<div class="abs-modal-sum"><b>${esc(u.name || '')}</b> · ${type.icon} ${type.label}<br>${formatDate(a.start_date)} – ${formatDate(a.end_date)} (${absDays(a)} pv)${a.description ? `<br><i>“${esc(a.description)}”</i>` : ''}</div>` + (status === 'approved' ? leaveInfo : '');

    if (status === 'approved' && nShifts > 0) {
        const defFree = a.type === 'sick';
        const body = summary + `<div class="form-label" style="margin-bottom:8px;">Käyttäjällä on ${nShifts} vuoroa tällä jaksolla. Mitä niille tehdään?</div>
            <label class="abs-choice"><input type="radio" name="abs-shifts" value="free" ${defFree ? 'checked' : ''}><span><b>Vapauta avoimiksi vuoroiksi</b><br><small>Muut voivat napata ne. Push-ilmoitus lähtee tiimille.</small></span></label>
            <label class="abs-choice"><input type="radio" name="abs-shifts" value="keep" ${defFree ? '' : 'checked'}><span><b>Jätä vuorot ennalleen</b><br><small>Hoidat vuorot itse käsin.</small></span></label>`;
        const footer = `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
            <button class="btn abs-approve" onclick="confirmAbsenceDecision(${a.id}, 'approved')"><i class="bi bi-check-lg"></i> Hyväksy</button>`;
        return openModal('Hyväksy poissaolo', 'bi-calendar-check', body, footer);
    }
    if (status === 'rejected' && a.status === 'approved' && nFreed > 0) {
        const body = summary + `<div class="form-label" style="margin-bottom:8px;">Hyväksyntä perutaan. ${nFreed} vapautettua vuoroa voidaan palauttaa takaisin käyttäjälle.</div>
            <label class="abs-choice"><input type="radio" name="abs-shifts" value="restore" checked><span><b>Palauta vuorot käyttäjälle</b></span></label>
            <label class="abs-choice"><input type="radio" name="abs-shifts" value="keep"><span><b>Jätä vuorot avoimiksi</b></span></label>`;
        const footer = `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
            <button class="btn abs-reject" onclick="confirmAbsenceDecision(${a.id}, 'rejected')">Peru hyväksyntä</button>`;
        return openModal('Peru hyväksyntä', 'bi-arrow-counterclockwise', body, footer);
    }
    if (status === 'rejected') {
        const body = summary + `<div style="font-size:14px;">Hylätäänkö tämä poissaolo? Käyttäjä saa ilmoituksen päätöksestä.</div>`;
        const footer = `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
            <button class="btn abs-reject" onclick="confirmAbsenceDecision(${a.id}, 'rejected')"><i class="bi bi-x-lg"></i> Hylkää</button>`;
        return openModal('Hylkää poissaolo', 'bi-x-circle', body, footer);
    }
    handleAbsence(id, status);   // hyväksyntä ilman vaikutusta vuoroihin
}

function confirmAbsenceDecision(id, status) {
    const choice = (document.querySelector('input[name="abs-shifts"]:checked') || {}).value;
    closeModal();
    handleAbsence(id, status, { free_shifts: choice === 'free', restore_shifts: choice === 'restore' });
}

async function handleAbsence(id, status, opts = {}) {
    const res = await fetch('api.php?action=handle_absence', { method: 'POST', body: JSON.stringify({ id, status, free_shifts: !!opts.free_shifts, restore_shifts: !!opts.restore_shifts }) });
    let data = {}; try { data = await res.json(); } catch (e) {}
    if (data.error) return showToast(data.error, 'error');
    showToast(status === 'approved' ? 'Poissaolo hyväksytty' : 'Poissaolo hylätty');
    state.absFilter = null;   // näytä seuraavaksi oletusnäkymä (odottavat jos niitä on)
    load();
}

// ===================== ABSENCE MODAL =====================
function openAbsenceModal(absenceId = null) {
    const eb = absenceId ? state.data.absences.find(a => a.id == absenceId) : null;
    state.editingAbsence = eb;
    const today = getLocalDateString();
    const title = eb ? 'Muokkaa poissaoloa' : 'Ilmoita poissaolo';
    
    const body = `
        ${can('absences.approve') && !eb ? `<div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Työntekijä</label>
            <select id="abs-user" class="form-input">${(state.data.users || []).filter(x => x.role !== 'superadmin').map(x => `<option value="${x.id}" ${x.id == state.user.id ? 'selected' : ''}>${esc(x.name)}${x.id == state.user.id ? ' (minä)' : ''}</option>`).join('')}</select>
            <small style="color:var(--text3)">Kun valitset toisen työntekijän, poissaolo kirjataan suoraan hyväksyttynä (esim. jo pidetty loma).</small>
        </div>` : ''}
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Tyyppi</label>
            <select id="abs-type" class="form-input">
                <option value="sick" ${eb?.type==='sick'?'selected':''}>Sairasloma</option>
                <option value="vacation" ${eb?.type==='vacation'?'selected':''}>Loma</option>
                <option value="other" ${eb?.type==='other'?'selected':''}>Muu poissaolo</option>
            </select>
        </div>
        <div class="form-row" style="margin-bottom:16px;">
            <div class="form-group"><label class="form-label">Alkaa</label><input id="abs-start" type="date" class="form-input" value="${eb ? eb.start_date : today}"></div>
            <div class="form-group"><label class="form-label">Päättyy</label><input id="abs-end" type="date" class="form-input" value="${eb ? eb.end_date : today}"></div>
        </div>
        <div class="form-group" style="margin-bottom:8px;">
            <label class="form-label">Kuvaus / syy</label>
            <input id="abs-desc" class="form-input" placeholder="Vapaamuotoinen selite" value="${esc(eb ? eb.description : '')}">
        </div>
    `;
    
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="submitAbsence()"><i class="bi bi-send"></i> Lähetä ilmoitus</button>
    `;
    openModal(title, 'bi-calendar-x', body, footer);
}

async function submitAbsence() { 
    const data = { id: state.editingAbsence?.id || null, userId: (document.getElementById('abs-user') ? document.getElementById('abs-user').value : state.user.id), type: document.getElementById('abs-type').value, startDate: document.getElementById('abs-start').value, endDate: document.getElementById('abs-end').value, description: document.getElementById('abs-desc').value }; 
    if (!data.startDate || !data.endDate) return showToast("Valitse päivämäärät", "error"); 
    const ar = await (await fetch('api.php?action=absence', { method: 'POST', body: JSON.stringify(data) })).json();
    if (ar.error) return showToast(ar.error, 'error');
    closeModal(); showToast("Tallennettu!"); load(); 
}


// ===================== EVENTS VIEW =====================
window.selectEventIcon = function(el) {
    document.querySelectorAll('.icon-selector').forEach(i => { i.classList.remove('active'); i.style.borderColor = 'transparent'; });
    el.classList.add('active'); el.style.borderColor = 'var(--accent)';
};

function renderEvents() {
    const isAdmin = can('events.manage'); const today = getLocalDateString();
    let html = `<div class="page-header"><div class="page-title">Tapahtumat</div></div>`;
    
    if(isAdmin) {
        html += `<div style="margin-bottom: 20px;">
            <button class="btn btn-primary" onclick="openEventModal()"><i class="bi bi-plus-lg"></i> Lisää uusi tapahtuma</button>
        </div>`;
    }
    
    const upcomingAll = state.data.events.filter(e => e.date >= today).sort((a,b) => a.date > b.date ? 1 : -1);
    
    const renderCard = (e) => `
        <div class="event-card">
            <div style="display:flex; gap:14px; align-items:center;">
                <div class="event-dot"></div>
                <div>
                    <div class="event-date-label">${formatDate(e.date)} · klo ${e.time_start || e.time}${isAdmin ? eventRegBadge(e) : ''}</div>
                    <div class="event-title">${esc(e.title)}${isAdmin ? (e.is_public == 1 ? ' <span class="sl-badge trade" title="Näkyy julkisessa kalenterissa (jos profiili on julkinen)">Julkinen</span>' : ' <span class="sl-badge" style="background:var(--surface2); color:var(--text3);">Sisäinen</span>') : ''}</div>
                </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                ${guestBadge(e)}
                ${e.image_path ? `<a href="${esc(safeImg(e.image_path))}" target="_blank" class="btn btn-ghost btn-sm btn-icon"><i class="bi bi-image"></i></a>` : ''}
                ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="openEventModal(${e.id})"><i class="bi bi-pencil"></i></button><button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${e.id},'event')"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        </div>`;
        
    html += `<div class="section-header"><span class="section-title">Tulevat tapahtumat</span><div class="section-line"></div></div>`;
    html += upcomingAll.slice(0, state.eventsUpcomingLimit).map(renderCard).join('');
    return html;
}

// ===================== EVENT MODAL =====================
const EVENT_TYPES = [
    { id: 'music',  icon: '🎵', label: 'Musiikki' },
    { id: 'sports', icon: '⚽', label: 'Urheilu' },
    { id: 'quiz',   icon: '🧠', label: 'Visa / peli' },
    { id: 'theme',  icon: '🎉', label: 'Teemailta' },
    { id: 'other',  icon: '📌', label: 'Muu' }
];
function openEventModal(eventId = null) {
    const ev = eventId ? state.data.events.find(e => e.id == eventId) : null;
    state.editingEvent = ev;
    const today = getLocalDateString();
    const title = ev ? 'Muokkaa tapahtumaa' : 'Lisää uusi tapahtuma';
    
    const emojis = ['🎵', '🎤', '🎸', '🍻', '🍷', '🎟️', '🎉', '🎯'];
    let currentIcon = emojis[0]; let cleanTitle = ev?.title || '';
    if (ev) { for(let em of emojis) { if (cleanTitle.startsWith(em)) { currentIcon = em; cleanTitle = cleanTitle.substring(em.length).trim(); break; } } }

    const body = `
        <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label">Kuvake</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${emojis.map(em => `<div class="icon-selector ${currentIcon === em ? 'active' : ''}" data-icon="${em}" onclick="selectEventIcon(this)" style="${currentIcon === em ? 'border-color: var(--accent); background: rgba(225, 77, 42, 0.1);' : ''}">${em}</div>`).join('')}
            </div>
        </div>
        <div class="form-group" style="margin-bottom: 14px;"><label class="form-label">Tapahtuman nimi / Artisti</label><input id="e-title" class="form-input" value="${esc(cleanTitle)}"></div>
        <div class="form-group" style="margin-bottom: 14px;"><label class="form-label">Päivä</label><input id="e-date" type="date" class="form-input" value="${ev?.date || today}"></div>
        <div class="form-row" style="margin-bottom: 14px;">
            <div class="form-group"><label class="form-label">Alkaa</label><input id="e-time" type="time" class="form-input" value="${ev?.time_start || ev?.time || '21:00'}"></div>
            <div class="form-group"><label class="form-label">Päättyy</label><input id="e-time-end" type="time" class="form-input" value="${ev?.time_end || '04:00'}"></div>
        </div>
        <div class="form-row" style="margin-bottom: 14px;">
            <div class="form-group"><label class="form-label">Tyyppi</label>
                <select id="e-type" class="form-input">${EVENT_TYPES.map(t => `<option value="${t.id}" ${(ev?.type || 'music') === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select></div>
        </div>
        <div class="form-group" style="margin-bottom: 14px;"><label class="form-label">Kuvaus (valinnainen)</label><textarea id="e-desc" class="form-input" rows="3" maxlength="600" placeholder="Lyhyt esittely tapahtumasta, sisäänpääsy, ohjelma...">${esc(ev?.description || '')}</textarea></div>
        <div class="form-group" style="margin-bottom: 14px;"><label class="form-label">Mainoskuva</label><input id="e-image" type="file" class="form-input" accept="image/*"></div>
        <div class="form-group" style="margin-bottom: 14px;"><label class="form-label">Vieraslista: paikkamäärä (valinn.)</label><input id="e-guestcap" type="number" min="1" max="2000" class="form-input" placeholder="esim. 25" value="${ev && ev.guest_capacity != null ? ev.guest_capacity : ''}"><small style="color:var(--text3)">Jos täytät, työntekijät voivat lisätä tapahtumalle nimiä (esim. maistelutilaisuus). Lista näkyy vain baarin henkilökunnalle, ei koskaan julkisesti.</small></div>
        ${eventRegFields(ev)}
        <label class="abs-choice" style="margin-bottom:8px;"><input id="e-public" type="checkbox" ${(ev ? ev.is_public == 1 : true) ? 'checked' : ''}><span><b>Näytä julkisessa tapahtumakalenterissa</b><br><small>Näkyy vain, jos baarin julkinen profiili on julkaistu (Hallinta → Julkinen profiili).</small></span></label>
    `;
    
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveEvent()"><i class="bi bi-save"></i> Tallenna tapahtuma</button>
    `;
    openModal(title, 'bi-music-note-beamed', body, footer);
}

async function saveEvent() { 
    let titleInput = document.getElementById('e-title').value.trim(); const activeIcon = document.querySelector('.icon-selector.active');
    if (activeIcon) titleInput = activeIcon.dataset.icon + ' ' + titleInput;
    
    const formData = new FormData(); formData.append('id', state.editingEvent?.id || ''); formData.append('title', titleInput); formData.append('date', document.getElementById('e-date').value); formData.append('time_start', document.getElementById('e-time').value); formData.append('time_end', document.getElementById('e-time-end').value); formData.append('pub_name', state.user.pub_name);
    formData.append('type', document.getElementById('e-type').value); formData.append('description', document.getElementById('e-desc').value); formData.append('is_public', document.getElementById('e-public').checked ? '1' : '0');
    formData.append('guest_capacity', document.getElementById('e-guestcap').value);
    eventRegFormData(formData);
    const imgInput = document.getElementById('e-image'); if (imgInput && imgInput.files.length > 0) formData.append('image', imgInput.files[0]);
    
    const er = await (await fetch('api.php?action=event', { method:'POST', body: formData })).json();
    if (er.error) return showToast(er.error, 'error');
    closeModal(); showToast("Tapahtuma tallennettu!"); load(); 
}

// ===================== POISSAOLOKALENTERI (kuka on pois, kuukausittain) =====================
function setAbsView(v) { state.absView = v; render(); }
function shiftAbsMonth(d) {
    const [y, m] = (state.absMonth || getLocalDateString().slice(0, 7)).split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    state.absMonth = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); render();
}
function renderAbsenceCalendar(isAdmin) {
    const month = state.absMonth || getLocalDateString().slice(0, 7), [y, m] = month.split('-').map(Number);
    const days = new Date(y, m, 0).getDate(), today = getLocalDateString();
    const title = new Date(y, m - 1, 1).toLocaleString('fi-FI', { month: 'long', year: 'numeric' });
    const abs = (state.data.absences || []).filter(a => a.status !== 'rejected' && a.end_date >= `${month}-01` && a.start_date <= `${month}-${String(days).padStart(2, '0')}`);
    const users = (state.data.users || []).filter(u => u.role !== 'superadmin' && !u.anonymized_at)
        .filter(u => abs.some(a => a.user_id == u.id) || isAdmin || u.id == state.user.id);
    const color = a => a.type === 'vacation' ? '#F59E0B' : (a.type === 'sick' && isAdmin ? '#E11D48' : '#94A3B8');
    const label = a => (a.type === 'sick' && !isAdmin) ? 'Poissa' : (ABS_TYPES[a.type] || ABS_TYPES.other).label;
    const head = Array.from({ length: days }, (_, i) => { const d = i + 1, dt = new Date(y, m - 1, d), wk = dt.getDay() === 0 || dt.getDay() === 6;
        return `<th class="ac-day ${wk ? 'wk' : ''} ${`${month}-${String(d).padStart(2, '0')}` === today ? 'today' : ''}">${d}</th>`; }).join('');
    const rows = users.map(u => `<tr><td class="ac-name">${esc(u.name)}</td>${Array.from({ length: days }, (_, i) => {
        const ds = `${month}-${String(i + 1).padStart(2, '0')}`, a = abs.find(x => x.user_id == u.id && ds >= x.start_date && ds <= x.end_date);
        const wk = [0, 6].includes(new Date(y, m - 1, i + 1).getDay());
        return a ? `<td class="ac-cell ${a.status === 'pending' ? 'pending' : ''}" style="--c:${color(a)}" title="${esc(u.name)}: ${esc(label(a))}${a.status === 'pending' ? ' (odottaa hyväksyntää)' : ''}, ${formatDate(a.start_date)}–${formatDate(a.end_date)}"></td>` : `<td class="ac-cell empty ${wk ? 'wk' : ''}"></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="card card-sm">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
            <button class="btn btn-ghost btn-sm" onclick="shiftAbsMonth(-1)" aria-label="Edellinen kuukausi"><i class="bi bi-chevron-left"></i></button>
            <b style="text-transform:capitalize;">${title}</b>
            <button class="btn btn-ghost btn-sm" onclick="shiftAbsMonth(1)" aria-label="Seuraava kuukausi"><i class="bi bi-chevron-right"></i></button>
        </div>
        <div style="overflow-x:auto;"><table class="ac-table"><thead><tr><th class="ac-name"></th>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${days + 1}" style="text-align:center;color:var(--text3);padding:20px;">Ei poissaoloja</td></tr>`}</tbody></table></div>
        <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; font-size:12px; color:var(--text2);">
            <span><i class="ac-key" style="--c:#F59E0B"></i> Loma</span>
            ${isAdmin ? '<span><i class="ac-key" style="--c:#E11D48"></i> Sairasloma</span>' : ''}
            <span><i class="ac-key" style="--c:#94A3B8"></i> ${isAdmin ? 'Muu' : 'Poissa'}</span>
            <span><i class="ac-key pending" style="--c:#64748B"></i> Odottaa hyväksyntää</span>
        </div>
        ${isAdmin ? '' : '<p style="font-size:12px; color:var(--text3); margin:8px 0 0;">Kollegoiden poissaolojen syitä ei näytetä.</p>'}
    </div>`;
}
