// ===================== CALENDAR =====================
function renderCalendar() {
    const now = state.currentDate;
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    const todayStr = getLocalDateString();
    const weekDays = ['Ma','Ti','Ke','To','Pe','La','Su'];
    const weekDates = Array.from({length: 7}, (_, i) => {
        const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return getLocalDateString(d);
    });

    const shifts = state.data.shifts.filter(s => weekDates.includes(s.date));
    const events = state.data.events.filter(e => weekDates.includes(e.date));

    let minH = 12, maxH = 16; 
    const allItems = [...shifts.filter(s => !state.onlyMine || s.userId == state.user.id || !s.userId || s.userId == 0), ...events];
    if (allItems.length > 0) {
        let hours = [];
        allItems.forEach(i => {
            const startStr = i.start || i.time_start || i.time || "12:00"; const endStr = i.end || i.time_end;
            const s = parseInt(startStr.split(':')[0]); hours.push(s);
            if (endStr) { let e = parseInt(endStr.split(':')[0]); if (e < s) e += 24; if (parseInt(endStr.split(':')[1]||0) > 0) e += 1; hours.push(e); } 
            else hours.push(s + 2);
        });
        minH = Math.min(...hours); maxH = Math.max(...hours);
    }

    let html = `<div class="filter-bar">
        <button class="pill ${!state.onlyMine && !state.availabilityMode ?'active':''}" onclick="state.onlyMine=false; state.availabilityMode=false; render()">Kaikki</button>
        <button class="pill ${state.onlyMine && !state.availabilityMode ?'active':''}" onclick="state.onlyMine=true; state.availabilityMode=false; render()">Omat</button>
        <button class="pill ${state.availabilityMode ?'active':''}" onclick="state.availabilityMode=!state.availabilityMode; render()" style="border-color:var(--teal); color:${state.availabilityMode?'#fff':'var(--teal)'}; background:${state.availabilityMode?'var(--teal)':'transparent'}"><i class="bi bi-hand-thumbs-up"></i> Työtoiveet</button>
        <div style="flex:1"></div>
        <div class="week-nav">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="changeDate(-7)"><i class="bi bi-chevron-left"></i></button>
            <span class="week-label">Vko ${getWeekNumber(startOfWeek)}</span>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="changeDate(7)"><i class="bi bi-chevron-right"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="state.currentDate=new Date(); render()">Tänään</button>
        </div>
    </div>`;

    if (state.availabilityMode) {
        html += `<div style="background:rgba(13, 148, 136, 0.1); padding:12px; border-radius:8px; margin-bottom:16px; font-size:13px;">
            👉 <b>Työtoiveiden muokkaus:</b> Klikkaa kalenterin päiviä muuttaaksesi toivettasi: <span class="badge" style="background:#0D9488; color:white;">Vapaa</span> / <span class="badge" style="background:#E11D48; color:white;">Ei pääse</span>
        </div>`;
    }

    html += `<div class="cal-wrapper"><div class="cal-grid"><div class="time-header-corner"></div>`;
    weekDates.forEach((d, i) => {
        let availClass = '';
        let targetUserId = state.user.id;
        if (can('shifts.manage') && state.selectedUserId && state.selectedUserId !== 'all') { targetUserId = state.selectedUserId; }
        const myAvail = state.data.availability.find(a => a.user_id == targetUserId && a.date === d);
        if (myAvail) { availClass = myAvail.status === 'available' ? 'avail-yes' : 'avail-no'; }
        const clickAction = state.availabilityMode ? `onclick="toggleAvailability('${d}')" style="cursor:pointer;"` : '';

        html += `<div class="cal-header ${todayStr === d ? 'today' : ''} ${availClass}" ${clickAction}>
                    <span>${weekDays[i]}</span><span class="day-num">${parseInt(d.split('-')[2])}</span>
                 </div>`;
    });

    for (let h = minH; h < maxH; h++) {
        html += `<div class="time-label">${h%24}:00</div>`;
        weekDates.forEach(date => {
            html += `<div class="time-cell">`;
            const starting = itemsStartingAt(date, h);
            starting.forEach(item => {
                const count = getOverlappingCount(item, date); const order = getOverlapOrder(item, date);
                const width = 94 / count; const left = 3 + (order * width);
                if (item.userId !== undefined) html += renderShiftBlock(item, width, left); else html += renderEventBlock(item, width, left);
            });
            html += `</div>`;
        });
    }
    return html + `</div></div>`;
}

async function toggleAvailability(date) {
    const existing = state.data.availability.find(a => a.user_id == state.user.id && a.date === date);
    let nextStatus = 'available';
    if (existing) { if (existing.status === 'available') nextStatus = 'unavailable'; else if (existing.status === 'unavailable') nextStatus = 'none'; }
    if (nextStatus === 'none') { state.data.availability = state.data.availability.filter(a => !(a.user_id == state.user.id && a.date === date)); } 
    else {
        if (existing) existing.status = nextStatus;
        else state.data.availability.push({ user_id: state.user.id, date: date, status: nextStatus, pub_name: state.user.pub_name });
    }
    render();
    await fetch('api.php?action=availability', { method: 'POST', body: JSON.stringify({ userId: state.user.id, pub_name: state.user.pub_name, date: date, status: nextStatus }) });
}

function itemsStartingAt(date, h) { return [...state.data.shifts.filter(s => s.date === date && (!state.onlyMine || s.userId == state.user.id || !s.userId || s.userId == 0)), ...state.data.events.filter(e => e.date === date)].filter(i => parseInt((i.start || i.time_start || i.time).split(':')[0]) === h); }
function getOverlappingCount(item, date) { const s = timeToDec(item.start || item.time_start || item.time); let e = timeToDec(item.end || item.time_end || "23:59"); if (e <= s) e += 24; const day = [...state.data.shifts.filter(s => s.date === date && (!state.onlyMine || s.userId == state.user.id || !s.userId || s.userId == 0)), ...state.data.events.filter(e => e.date === date)]; return Math.max(1, day.filter(o => { const os = timeToDec(o.start || o.time_start || o.time); let oe = timeToDec(o.end || o.time_end || "23:59"); if (oe <= os) oe += 24; return (s < oe && e > os); }).length); }
function getOverlapOrder(item, date) { const day = [...state.data.shifts.filter(s => s.date === date && (!state.onlyMine || s.userId == state.user.id || !s.userId || s.userId == 0)), ...state.data.events.filter(e => e.date === date)].sort((a,b) => timeToDec(a.start || a.time_start || a.time) - timeToDec(b.start || b.time_start || b.time)); return day.findIndex(x => x.id === item.id && ((x.userId !== undefined && item.userId !== undefined && x.userId === item.userId) || (x.userId === undefined && item.userId === undefined))); }
function timeToDec(t) { const p = t.split(':'); return parseInt(p[0]) + (parseInt(p[1])/60); }

function renderShiftBlock(s, w, l) {
    const sh = parseInt(s.start.split(':')[0]), sm = parseInt(s.start.split(':')[1]);
    let eh = parseInt(s.end.split(':')[0]), em = parseInt(s.end.split(':')[1]); if (eh < sh) eh += 24;
    const top = (sm/60)*48; const h = ((eh + em/60) - (sh + sm/60))*48;
    
    const isAvoin = (!s.userId || s.userId == 0);
    const u = isAvoin ? {name: 'AVOIN VUORO'} : state.data.users.find(x => x.id == s.userId);
    const isOwn = s.userId == state.user.id;
    const absence = !isAvoin && (state.data.absences || []).find(a => a.user_id == s.userId && a.status === 'approved' && s.date >= a.start_date && s.date <= a.end_date);
    
    let blockClass = (isAvoin ? 'avoin-vuoro' : (absence ? 'others' : (isOwn ? 'own' : 'others'))) + (s.status === 'draft' ? ' draft' : '');
    let absenceInfo = absence ? `<div style="font-size:9px; font-weight:800; margin-top:2px;">🤒 POISSAOLO</div>` : '';
    const clickAttr = isAvoin ? `onclick="takeOpenShift(${s.id})" style="cursor:pointer;"` : (can('shifts.manage') ? `onclick="openShiftModal(${s.id})" style="cursor:pointer;"` : '');
    
    return `<div class="shift-block ${blockClass}" style="top:${top}px; height:${Math.max(h,24)}px; width:${w}%; left:${l}%;" title="${esc(u ? u.name : '')}" ${clickAttr}>
        <strong>${s.start.substring(0,5)}–${s.end.substring(0,5)}</strong>
        <span class="shift-name">${getRoleIcon(s.role)} ${esc(u ? u.name.split(' ')[0] : '')}</span>
        ${absenceInfo}
    </div>`;
}

function renderEventBlock(e, w, l) {
    const start = e.time_start || e.time; const sh = parseInt(start.split(':')[0]), sm = parseInt(start.split(':')[1]);
    let eh = parseInt(e.time_end || "23:59"); if (eh < sh) eh += 24;
    const hasGuests = e.guest_capacity !== null && e.guest_capacity !== undefined;
    const clickAttr = hasGuests ? `onclick="openGuestList(${e.id})" style="cursor:pointer;"` : (can('events.manage') ? `onclick="openEventModal(${e.id})" style="cursor:pointer;"` : '');
    return `<div class="event-block" style="top:${(sm/60)*48}px; height:${Math.max(48, (eh-sh)*48)}px; width:${w}%; left:${l}%;" ${clickAttr}><strong>TAPAHTUMA</strong><span class="shift-name">${esc(e.title)}</span></div>`;
}

// ===================== SHIFTS LIST VIEW (GRID + MASS COPY) =====================
function renderShiftWeek(isAdmin, today) {
    // --- 1. GRID VIEW ---
    const d = new Date(state.shiftGridDate || new Date());
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0 = Ma, 6 = Su
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - day);
    
    const weekDates = Array.from({length: 7}, (_, i) => {
        const nd = new Date(startOfWeek);
        nd.setDate(startOfWeek.getDate() + i);
        return getLocalDateString(nd);
    });
    const weekDaysFi = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

    // Haetaan vuorot näkyvälle viikolle
    const weekShifts = state.data.shifts.filter(s => s.date >= weekDates[0] && s.date <= weekDates[6]);

    let html = `
        <div class="filter-bar" style="background:var(--surface); padding:12px; border-radius:var(--radius); border:1px solid var(--border); margin-bottom:20px; justify-content:space-between;">
            <div class="week-nav">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="changeShiftGridWeek(-7)"><i class="bi bi-chevron-left"></i></button>
                <span class="week-label" style="min-width: 140px;">Viikko ${getWeekNumber(startOfWeek)} <br><span style="font-size:11px; color:var(--text3); font-weight:normal;">${formatDate(weekDates[0])} - ${formatDate(weekDates[6])}</span></span>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="changeShiftGridWeek(7)"><i class="bi bi-chevron-right"></i></button>
                <button class="btn btn-ghost btn-sm" onclick="state.shiftGridDate=new Date(); render()">Tämä viikko</button>
            </div>
            ${isAdmin ? `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px; background:var(--surface2); border-radius:var(--radius-sm); border:1px solid var(--border);">
                <span style="font-size:12px; font-weight:700; color:var(--text2); text-transform:uppercase;"><i class="bi bi-files"></i> Massakopiointi:</span>
                <select id="mass-copy-weeks" class="form-input" style="padding:6px 10px; font-size:13px; width:auto; border-radius:6px;">
                    <option value="1">+1 viikko (Seuraava)</option>
                    <option value="2">+2 viikkoa</option>
                    <option value="3">+3 viikkoa</option>
                    <option value="4">+4 viikkoa</option>
                </select>
                <button class="btn btn-primary btn-sm" style="background:var(--teal); border:none;" onclick="copyFullWeek('${weekDates[0]}', '${weekDates[6]}')">Kopioi näkyvä viikko</button>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" onclick="openWeekTemplates('${weekDates[0]}')"><i class="bi bi-bookmarks"></i> Viikkopohjat</button>
                ${pubFeature('autoschedule') ? `<button class="btn btn-primary btn-sm" onclick="autoScheduleWeek('${weekDates[0]}')" title="Täyttää miehityssäännöt luonnoksilla saatavuuden, lepoaikojen, osaamisten ja kuormituksen mukaan"><i class="bi bi-stars"></i> Luo viikon luonnos</button>` : ''}
                <button class="btn btn-ghost btn-sm" style="color:#B91C1C;" onclick="openClearShifts('${weekDates[0]}', '${weekDates[6]}')"><i class="bi bi-eraser"></i> Tyhjennä…</button>
            </div>
            ` : ''}
        </div>
    `;

    if (isAdmin && can('sales.view')) html += renderForecastCard(weekDates[0]);

    html += `<div class="card" style="padding:0; overflow-x:auto; margin-bottom:40px;"><table class="bs-table" style="min-width:900px; border-collapse: separate; border-spacing: 0;">
        <thead>
            <tr>
                <th style="width: 160px; position: sticky; left: 0; background: var(--surface2); z-index: 2; border-right: 2px solid var(--border); box-shadow: 2px 0 4px rgba(0,0,0,0.02);">Työntekijä</th>
                ${weekDates.map((date, i) => `<th style="text-align:center;">${weekDaysFi[i]}<br><span style="font-size:10px; opacity:0.7;">${date.split('-')[2]}.${date.split('-')[1]}.</span></th>`).join('')}
            </tr>
        </thead>
        <tbody>`;

    // Yhdistetään käyttäjät ja 'Avoin vuoro' (id 0) rivit
    const displayUsers = [{id: 0, name: '🟡 AVOIN VUORO', role: ''}, ...state.data.users];

    displayUsers.forEach(u => {
        // Piilotetaan muut kuin omat (tai avoimet) rivit työntekijöiltä
        if (!isAdmin && u.id !== 0 && u.id !== state.user.id) return;

        html += `<tr>
            <td style="position: sticky; left: 0; background: var(--surface); z-index: 1; border-right: 2px solid var(--border); box-shadow: 2px 0 4px rgba(0,0,0,0.02);">
                <div style="font-weight: 700; font-size: 13px; color: ${u.id === 0 ? 'var(--accent2)' : 'var(--text)'};">${esc(u.name)}</div>
                ${u.id !== 0 ? `<div style="font-size: 11px; color: var(--text3); margin-top:2px;">${esc(u.role)}</div>` : ''}
            </td>
            ${weekDates.map(date => {
                const shifts = weekShifts.filter(s => (s.userId == u.id || (!s.userId && u.id === 0)) && s.date === date);
                const cellClick = isAdmin ? `onclick="openShiftModal(null, ${u.id}, '${date}')"` : '';
                
                let cellHtml = `<td class="shift-grid-cell" ${shifts.length === 0 ? cellClick : ''}>`;
                
                shifts.forEach(s => {
                    const isAvoin = (!s.userId || s.userId == 0);
                    const isOwn = s.userId == state.user.id;
                    const blockClass = isAvoin ? 'avoin' : (isOwn ? 'own' : 'others');
                    const clickAction = isAdmin ? `onclick="event.stopPropagation(); openShiftModal(${s.id})"` : (isAvoin ? `onclick="takeOpenShift(${s.id})"` : '');
                    
                    cellHtml += `<div class="shift-grid-item ${blockClass}" ${clickAction ? `style="cursor:pointer;" ${clickAction}` : ''} title="${s.start} - ${s.end} | ${esc(s.role)}">
                        <strong>${s.start.substring(0,5)}–${s.end.substring(0,5)}</strong>
                        <span>${getRoleIcon(s.role)} ${esc(s.role.substring(0,6))}.</span>
                    </div>`;
                });
                
                if (isAdmin && shifts.length === 0) {
                    cellHtml += `<div class="add-shift-hint"><i class="bi bi-plus-lg"></i> Lisää</div>`;
                }
                
                cellHtml += `</td>`;
                return cellHtml;
            }).join('')}
        </tr>`;
    });

    html += `</tbody></table></div>`;

    return html;
}

// ===================== TYÖVUOROT: VIIKKO / LISTA =====================
const SHIFT_TABS = [
    { id: 'week', label: 'Viikkonäkymä', icon: 'bi-calendar-week' },
    { id: 'list', label: 'Lista',        icon: 'bi-list-ul' }
];
function setShiftTab(id) { state.shiftsTab = id; try { localStorage.setItem('barshift_shifts_tab', id); } catch (e) {} render(); }
function setShiftFilter(key, val) { state[key] = val; state.shiftListLimit = 40; render(); }

function shiftHours(s) {
    let h = (parseInt(s.end.slice(0, 2)) * 60 + parseInt(s.end.slice(3, 5)) - parseInt(s.start.slice(0, 2)) * 60 - parseInt(s.start.slice(3, 5))) / 60;
    return h <= 0 ? h + 24 : h;
}
function dayWord(date, today) {
    const diff = Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    return diff === 0 ? 'Tänään' : diff === 1 ? 'Huomenna' : diff === -1 ? 'Eilen' : '';
}
function weekStartOf(date) {
    const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
}

function renderShifts() {
    const isAdmin = can('shifts.manage');
    const today = getLocalDateString();
    let saved = null; try { saved = localStorage.getItem('barshift_shifts_tab'); } catch (e) {}
    const tab = state.shiftsTab || saved || 'week';
    const upcomingCount = (state.data.shifts || []).filter(s => s.date >= today && (isAdmin || s.userId == state.user.id || !s.userId)).length;

    let html = `
        <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div class="page-title">Työvuorot</div>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-ghost btn-sm" onclick="exportAllToCalendar()"><i class="bi bi-calendar-check"></i> Vie kalenteriin</button>
                ${isAdmin && (state.data.shifts || []).some(s => s.status === 'draft') ? `<button class="btn btn-ghost btn-sm" onclick="publishDrafts()"><i class="bi bi-send-check"></i> Julkaise luonnokset (${(state.data.shifts || []).filter(s => s.status === 'draft').length})</button>` : ''}
                ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="openShiftModal()"><i class="bi bi-plus-lg"></i> Uusi vuoro</button>` : ''}
            </div>
        </div>
        <div class="admin-tabs" role="tablist" aria-label="Vuorojen näkymä">${SHIFT_TABS.map(t =>
            `<button class="admin-tab ${t.id === tab ? 'active' : ''}" role="tab" aria-selected="${t.id === tab}" onclick="setShiftTab('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span>${t.id === 'list' && upcomingCount > 0 ? `<span class="admin-tab-count">${upcomingCount}</span>` : ''}</button>`).join('')}</div>`;
    html += `<div role="tabpanel">${tab === 'list' ? renderShiftList(isAdmin, today) : renderShiftWeek(isAdmin, today)}</div>`;
    return html;
}

function renderShiftRow(s, isAdmin, today) {
    const isAvoin = !s.userId || s.userId == 0;
    const u = isAvoin ? null : state.data.users.find(x => x.id == s.userId);
    const isOwn = s.userId == state.user.id;
    const trade = (state.data.trades || []).find(t => t.offered_shift_id == s.id && (t.status == 'open' || t.status == 'pending'));
    const past = s.date < today;
    const badges = [];
    if (isAvoin) badges.push('<span class="sl-badge open">Avoin vuoro</span>');
    if (s.status === 'draft') badges.push('<span class="sl-badge draft">Luonnos</span>');
    if (isOwn) badges.push('<span class="sl-badge own">Oma</span>');
    if (trade) badges.push(`<span class="sl-badge trade">${trade.status === 'pending' ? 'Vaihtopyyntö' : 'Vaihdossa'}</span>`);
    return `
        <div class="sl-entry ${isAvoin ? 'is-open' : ''} ${isOwn ? 'is-own' : ''} ${past ? 'is-past' : ''}">
            <div class="sl-time"><b>${s.start.slice(0, 5)}–${s.end.slice(0, 5)}</b><span>${BSNum(shiftHours(s))} h</span></div>
            <div class="sl-main">
                <div class="sl-who">${isAvoin ? '🟡 Ei vielä tekijää' : `<span class="abs-dot" style="background:${esc((u && u.color) || '#94A3B8')}"></span>${esc(u ? u.name : 'Tuntematon')}`}</div>
                <div class="sl-role">${getRoleIcon(s.role)} ${esc(s.role)} ${badges.join(' ')}</div>
            </div>
            <div class="sl-actions">
                ${isAvoin && !isAdmin && !past ? `<button class="btn btn-primary btn-sm" onclick="takeOpenShift(${s.id})">${openShiftLabel(s.id)}</button>` : ''}
                ${isAvoin && isAdmin && !past && pubFeature('bidding') && shiftBidsOf(s.id).length ? `<button class="btn btn-primary btn-sm" onclick="openShiftBids(${s.id})"><i class="bi bi-people"></i> Hakijat (${shiftBidsOf(s.id).length})</button>` : ''}
                ${isOwn && !trade && !past && can('trades.use') ? `<button class="pill" onclick="offerShift(${s.id})">Vaihda</button>` : ''}
                ${isAdmin ? `<button class="btn btn-ghost btn-sm btn-icon" title="Muokkaa" aria-label="Muokkaa" onclick="openShiftModal(${s.id})"><i class="bi bi-pencil"></i></button><button class="btn btn-danger btn-sm btn-icon" title="Poista" aria-label="Poista" onclick="deleteItem(${s.id},'shift')"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        </div>`;
}
const BSNum = n => String(Math.round(n * 10) / 10).replace('.', ',');

function renderShiftList(isAdmin, today) {
    const range = state.shiftRange || 'upcoming', who = state.shiftWho || 'all';
    const monthStart = today.slice(0, 8) + '01';
    const monthEnd = getLocalDateString(new Date(new Date(today + 'T00:00:00').getFullYear(), new Date(today + 'T00:00:00').getMonth() + 1, 0));
    const visible = (state.data.shifts || []).filter(s => isAdmin || s.userId == state.user.id || !s.userId);

    let list = visible.filter(s => {
        if (range === 'upcoming') return s.date >= today;
        if (range === 'month') return s.date >= monthStart && s.date <= monthEnd;
        if (range === 'past') return s.date < today;
        if (range === 'custom') return s.date >= (state.shiftFrom || '0000-00-00') && s.date <= (state.shiftTo || '9999-99-99');
        return true;
    });
    if (who === 'mine') list = list.filter(s => s.userId == state.user.id);
    else if (who === 'open') list = list.filter(s => !s.userId);
    else if (who !== 'all') list = list.filter(s => s.userId == who);
    list.sort((a, b) => range === 'past' ? (b.date + b.start).localeCompare(a.date + a.start) : (a.date + a.start).localeCompare(b.date + b.start));

    const count = f => f(visible.filter(s => range === 'upcoming' ? s.date >= today : true)).length;
    const chip = (key, val, label, n) => `<button class="pill ${(state[key] || (key === 'shiftRange' ? 'upcoming' : 'all')) === val ? 'active' : ''}" onclick="setShiftFilter('${key}', '${val}')">${label}${n !== undefined ? ` <span class="abs-pill-count">${n}</span>` : ''}</button>`;
    const totalHours = list.filter(s => s.userId).reduce((sum, s) => sum + shiftHours(s), 0);
    const openN = list.filter(s => !s.userId).length, mineN = list.filter(s => s.userId == state.user.id).length;

    let html = `<div class="sl-filters card card-sm">
        <div class="sl-row"><span class="sl-lbl">Ajanjakso</span><div class="abs-pills" style="margin:0;">
            ${chip('shiftRange', 'upcoming', 'Tulevat')}${chip('shiftRange', 'month', 'Tämä kuukausi')}${chip('shiftRange', 'past', 'Menneet')}${chip('shiftRange', 'all', 'Kaikki')}${chip('shiftRange', 'custom', 'Oma aikaväli')}
        </div></div>
        ${range === 'custom' ? `<div class="sl-row"><span class="sl-lbl"></span><div class="form-row" style="gap:8px; flex:1;">
            <div class="form-group"><label class="form-label">Alkaen</label><input type="date" class="form-input" value="${state.shiftFrom || ''}" onchange="state.shiftFrom=this.value; state.shiftListLimit=40; render()"></div>
            <div class="form-group"><label class="form-label">Päättyen</label><input type="date" class="form-input" value="${state.shiftTo || ''}" onchange="state.shiftTo=this.value; state.shiftListLimit=40; render()"></div></div></div>` : ''}
        <div class="sl-row"><span class="sl-lbl">Näytä</span><div class="abs-pills" style="margin:0;">
            ${chip('shiftWho', 'all', isAdmin ? 'Kaikki' : 'Omat ja avoimet')}${chip('shiftWho', 'mine', 'Vain omat')}${chip('shiftWho', 'open', 'Avoimet')}
            ${isAdmin ? `<select class="form-input" style="width:auto; padding:6px 10px; font-size:13px;" onchange="setShiftFilter('shiftWho', this.value)">
                <option value="all">Työntekijä…</option>${state.data.users.map(u => `<option value="${u.id}" ${who == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}
        </div></div>
    </div>
    <div class="sl-stats"><span><b>${list.length}</b> vuoroa</span>${openN ? `<span class="warn"><b>${openN}</b> avointa</span>` : ''}${mineN ? `<span><b>${mineN}</b> omaa</span>` : ''}<span><b>${BSNum(totalHours)}</b> h</span></div>`;

    if (!list.length) return html + '<div class="empty-state"><i class="bi bi-inbox"></i><p>Ei vuoroja valituilla rajauksilla</p></div>';

    const limit = state.shiftListLimit || 40, shown = list.slice(0, limit);
    let curWeek = '', curDate = '';
    shown.forEach(s => {
        const ws = getLocalDateString(weekStartOf(s.date));
        if (ws !== curWeek) {
            if (curDate) html += `</div></div>`;
            curWeek = ws; curDate = '';
            const we = new Date(ws + 'T00:00:00'); we.setDate(we.getDate() + 6);
            const w0 = new Date(ws + 'T00:00:00');
            html += `<div class="sl-week">Viikko ${getWeekNumber(w0)} <span>${w0.getDate()}.${w0.getMonth() + 1}. – ${we.getDate()}.${we.getMonth() + 1}.${we.getFullYear()}</span></div>`;
        }
        if (s.date !== curDate) {
            if (curDate) html += `</div></div>`;
            curDate = s.date;
            const d = new Date(s.date + 'T00:00:00'), word = dayWord(s.date, today);
            html += `<div class="sl-day ${s.date === today ? 'is-today' : ''}"><div class="sl-date"><b>${['Su','Ma','Ti','Ke','To','Pe','La'][d.getDay()]}</b><span>${d.getDate()}.${d.getMonth() + 1}.</span>${word ? `<em>${word}</em>` : ''}</div><div class="sl-entries">`;
        }
        html += renderShiftRow(s, isAdmin, today);
    });
    html += `</div></div>`;
    if (list.length > limit) html += `<div style="text-align:center; margin:16px 0;"><button class="btn btn-ghost btn-sm" onclick="state.shiftListLimit=(state.shiftListLimit||40)+40; render()">Näytä lisää (${list.length - limit})</button></div>`;
    return html;
}

function renderTable(list, admin, selectable = false) {
    if(!list.length) return '<div class="empty-state" style="padding:30px;"><i class="bi bi-inbox"></i><p>Ei vuoroja valitulla aikavälillä</p></div>';
    const allChecked = selectable && list.length > 0 && list.every(s => state.selectedShiftIds.has(s.id));
    return `<div class="card" style="padding:0; overflow-x:auto; margin-bottom:0;"><table class="bs-table">
        <thead><tr>${selectable ? `<th style="width:36px;"><input type="checkbox" ${allChecked?'checked':''} onchange="toggleAllShifts(this.checked, ${JSON.stringify(list.map(s=>s.id))})"></th>` : ''}<th>Päivä</th><th>Työntekijä</th><th>Aika</th><th>Rooli</th><th></th></tr></thead>
		<tbody>
        ${list.map(s => {
            const isAvoin = (!s.userId || s.userId == 0);
            const u = isAvoin ? {name: 'AVOIN VUORO'} : state.data.users.find(x => x.id == s.userId);
            const isOwn = s.userId == state.user.id;
            const trade = state.data.trades ? state.data.trades.find(t => t.offered_shift_id == s.id && (t.status == 'open' || t.status == 'pending')) : null;
            const checked = state.selectedShiftIds ? state.selectedShiftIds.has(s.id) : false;
            
            return `<tr class="${isOwn?'own-row':(isAvoin?'avoin-row':'')}">
                ${selectable ? `<td><input type="checkbox" ${checked?'checked':''} onchange="toggleShiftSelection(${s.id}, this.checked)"></td>` : ''}
                <td><strong>${formatDate(s.date)}</strong></td>
                <td>${isAvoin ? '<span style="color:var(--accent2); font-weight:bold;">🟡 AVOIN VUORO</span>' : (u?u.name:'')}</td>
                <td><span class="badge badge-teal">${s.start.substring(0,5)}–${s.end.substring(0,5)}</span></td>
                <td>${getRoleIcon(s.role)} ${esc(s.role)}</td>
                <td>
                    <div style="display:flex; justify-content:flex-end; gap:6px; align-items:center;">
                        ${isAvoin ? `<button class="btn btn-primary btn-sm" onclick="takeOpenShift(${s.id})">${openShiftLabel(s.id)}</button>` : ''}
                        ${isOwn && !trade && can('trades.use') ? `<button class="pill" onclick="offerShift(${s.id})">Vaihda</button>` : ''}
                        ${admin ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="openShiftModal(${s.id})"><i class="bi bi-pencil"></i></button><button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${s.id},'shift')"><i class="bi bi-trash"></i></button>` : ''}
                    </div>
                </td>
            </tr>`;
        }).join('')}
		</tbody>
    </table></div>`;
}

function changeShiftGridWeek(days) {
    if(!state.shiftGridDate) state.shiftGridDate = new Date();
    state.shiftGridDate.setDate(state.shiftGridDate.getDate() + days);
    render();
}

async function copyFullWeek(startStr, endStr) {
    const targetWeeks = parseInt(document.getElementById('mass-copy-weeks').value) || 1;
    const shiftsToCopy = state.data.shifts.filter(s => s.date >= startStr && s.date <= endStr);
    
    if (shiftsToCopy.length === 0) {
        return showToast('Ei kopioitavia vuoroja valitulla viikolla.', 'error');
    }
    
    if (!confirm(`Kopioidaanko viikon ${shiftsToCopy.length} vuoroa ${targetWeeks} viikon päähän?`)) return;

    const newShifts = shiftsToCopy.map(s => {
        let d = new Date(s.date + 'T00:00:00'); 
        d.setDate(d.getDate() + (7 * targetWeeks));
        return { userId: s.userId, date: getLocalDateString(d), start: s.start.substring(0,5), end: s.end.substring(0,5), role: s.role, pub_name: state.user.pub_name };
    });
    
    await fetch('api.php?action=bulk_shifts', { method: 'POST', body: JSON.stringify(newShifts) });
    showToast('Koko viikko kopioitu menestyksekkäästi!'); 
    load();
}

// ===================== SHIFT MODAL CREATION =====================
function openShiftModal(shiftId = null, prefillUserId = null, prefillDate = null) {
    const es = shiftId ? state.data.shifts.find(s => s.id == shiftId) : null;
    state.editingShift = es;
    const today = getLocalDateString();
    
    const dateVal = es ? es.date : (prefillDate ? prefillDate : today);
    const userVal = es ? (es.userId || 0) : (prefillUserId !== null ? prefillUserId : '');
    const title = es ? 'Muokkaa työvuoroa' : 'Luo uusi työvuoro';
    
    const tpls = state.data.shift_templates || [];
    const body = `
        ${!es ? `<div style="margin-bottom:12px;">${tpls.map(t => `<span class="tpl-chip" onclick="applyShiftTemplate(${t.id})" title="${esc(t.role || '')}">${esc(t.name)} <small style="color:var(--text3)">${t.start.slice(0,5)}–${t.end.slice(0,5)}</small><button type="button" aria-label="Poista pohja" onclick="event.stopPropagation(); deleteItem(${t.id}, 'shift_template')">×</button></span>`).join('')}${tpls.length ? '' : '<small style="color:var(--text3)">Ei vuoropohjia – täytä vuoro ja paina "Tallenna pohjaksi".</small>'}</div>` : ''}
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Työntekijä</label>
            <select id="m-user" class="form-input" onchange="refreshShiftWarnings()">
                <option value="0" ${userVal === 0 ? 'selected' : ''}>🟢 AVOIN VUORO</option>
                ${state.data.users.map(u => `<option value="${u.id}" ${userVal == u.id ? 'selected' : ''}>${esc(u.name)}${availMark(u.id, dateVal)}</option>`).join('')}
            </select>
        </div>
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Päivämäärä</label>
            <input id="m-date" type="date" class="form-input" value="${dateVal}" onchange="refreshShiftUserOptions(); refreshShiftWarnings()">
        </div>
        <div class="form-row" style="margin-bottom:16px;">
            <div class="form-group"><label class="form-label">Alkaa</label><input id="m-start" type="time" class="form-input" value="${es ? es.start.substring(0,5) : '16:00'}" onchange="refreshShiftWarnings()"></div>
            <div class="form-group"><label class="form-label">Loppuu</label><input id="m-end" type="time" class="form-input" value="${es ? es.end.substring(0,5) : '02:00'}" onchange="refreshShiftWarnings()"></div>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Rooli</label>
            <select id="m-role" class="form-input" onchange="refreshShiftWarnings()">
                ${(() => { const rs = pubCfg().roles.slice(); if (es && es.role && !rs.includes(es.role)) rs.push(es.role); return rs.map(r => `<option ${es && es.role === r ? 'selected' : ''}>${esc(r)}</option>`).join(''); })()}
            </select>
        </div>
        ${es && !es.userId && pubFeature('bidding') && shiftBidsOf(es.id).length ? `<button class="btn btn-primary btn-sm" style="margin-bottom:10px;" onclick="closeModal(); openShiftBids(${es.id})"><i class="bi bi-people"></i> Hakijat (${shiftBidsOf(es.id).length})</button>` : ''}
        <div id="m-warn"></div>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="m-draft" type="checkbox" ${es && es.status === 'draft' ? 'checked' : ''}><span><b>Luonnos</b> – ei näy työntekijöille ennen julkaisua</span></label>
        ${!es ? `<div class="form-group" style="margin-bottom:8px;"><label class="form-label">Toista viikoittain (lisäviikkoja)</label><input id="m-repeat" type="number" min="0" max="52" value="0" class="form-input"><small style="color:var(--text3)">0 = vain tämä vuoro. Esim. 7 luo saman vuoron seuraaville 7 viikolle.</small></div>` : ''}
    `;
    
    const footer = `
        ${es ? `<button class="btn btn-danger" style="margin-right:auto;" onclick="deleteItem(${es.id}, 'shift')"><i class="bi bi-trash"></i> Poista</button>` : ''}
        ${!es ? `<button class="btn btn-ghost" onclick="saveShiftTemplate()" title="Tallenna kellonajat ja rooli pohjaksi"><i class="bi bi-bookmark-plus"></i> Tallenna pohjaksi</button>` : ''}
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveShift()"><i class="bi bi-save"></i> Tallenna</button>
    `;
    openModal(title, 'bi-calendar-event', body, footer);
    refreshShiftWarnings();
}
function availMark(userId, date) {
    const a = (state.data.availability || []).find(x => x.user_id == userId && x.date === date);
    return a ? (a.status === 'available' ? ' ✓ vapaa' : (a.status === 'unavailable' ? ' ✗ estetty' : '')) : '';
}
function refreshShiftUserOptions() {
    const sel = document.getElementById('m-user'), date = document.getElementById('m-date').value;
    [...sel.options].forEach(o => { if (o.value !== '0') { const u = state.data.users.find(x => x.id == o.value); o.textContent = u.name + availMark(u.id, date); } });
}
let _warnTimer = null;
function refreshShiftWarnings() {
    clearTimeout(_warnTimer);
    _warnTimer = setTimeout(async () => {
        const box = document.getElementById('m-warn'); if (!box) return;
        const w = await checkShiftWarnings();
        box.innerHTML = w.length ? `<div class="warn-box"><b><i class="bi bi-exclamation-triangle"></i> Huomioitavaa</b><ul>${w.map(x => `<li>${esc(x.msg)}</li>`).join('')}</ul></div>` : '';
    }, 250);
}
async function checkShiftWarnings() {
    const uid = document.getElementById('m-user').value;
    if (!uid || uid === '0') return [];
    try {
        const r = await (await fetch('api.php?action=check_shift', { method: 'POST', body: JSON.stringify({ id: state.editingShift?.id || 0, userId: uid,
            date: document.getElementById('m-date').value, start: document.getElementById('m-start').value, end: document.getElementById('m-end').value, role: (document.getElementById('m-role') || {}).value || '' }) })).json();
        return r.warnings || [];
    } catch (e) { return []; }
}
function applyShiftTemplate(id) {
    const t = (state.data.shift_templates || []).find(x => x.id == id); if (!t) return;
    document.getElementById('m-start').value = t.start.slice(0, 5); document.getElementById('m-end').value = t.end.slice(0, 5);
    const sel = document.getElementById('m-role'); if (t.role && [...sel.options].some(o => o.value === t.role)) sel.value = t.role;
    refreshShiftWarnings();
}
async function saveShiftTemplate() {
    const name = prompt('Vuoropohjan nimi (esim. "Ilta 16–02")'); if (!name || !name.trim()) return;
    const r = await (await fetch('api.php?action=shift_template', { method: 'POST', body: JSON.stringify({ name: name.trim(), start: document.getElementById('m-start').value, end: document.getElementById('m-end').value, role: document.getElementById('m-role').value }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Pohja tallennettu'); await load(); openShiftModal();
}
async function publishDrafts() {
    const n = (state.data.shifts || []).filter(s => s.status === 'draft').length;
    if (!n || !confirm(`Julkaistaanko ${n} luonnosvuoroa työntekijöille? Työntekijät saavat ilmoituksen.`)) return;
    const r = await (await fetch('api.php?action=publish_shifts', { method: 'POST', body: JSON.stringify({ from: '2000-01-01', to: '2999-12-31' }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast(`${r.published} vuoroa julkaistu`); load();
}

async function cancelTrade(id) {
    await fetch(`api.php?id=${id}&type=trade`, { method: 'DELETE' }); load();
}

function exportAllToCalendar() {
    const today = getLocalDateString(); const myUpcomingShifts = state.data.shifts.filter(s => s.userId == state.user.id && s.date >= today);
    if (myUpcomingShifts.length === 0) return showToast('Ei tulevia vuoroja', 'error');
    const formatICSDate = (dStr, tStr) => dStr.replace(/-/g, '') + 'T' + tStr.substring(0,5).replace(':', '') + '00';
    let icsMSG = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//BarShift Pro//FI\nCALSCALE:GREGORIAN\n";
    myUpcomingShifts.forEach(s => {
        const dtStart = formatICSDate(s.date, s.start); let endDate = s.date;
        if (parseInt(s.end.split(':')[0]) < parseInt(s.start.split(':')[0])) { let d = new Date(s.date + 'T00:00:00'); d.setDate(d.getDate() + 1); endDate = getLocalDateString(d); }
        icsMSG += `BEGIN:VEVENT\nDTSTART:${dtStart}\nDTEND:${formatICSDate(endDate, s.end)}\nSUMMARY:Työvuoro (${esc(s.role)})\nDESCRIPTION:BarShift-työvuoro\nEND:VEVENT\n`;
    });
    icsMSG += "END:VCALENDAR"; icsMSG = icsMSG.replace(/\n/g, "\r\n");
    const blob = new Blob([icsMSG], { type: 'text/calendar;charset=utf-8' }); const link = document.createElement('a'); link.href = window.URL.createObjectURL(blob); link.download = `kaikki_omat_vuorot.ics`; link.click();
}

// ===================== STATS & FILTERS =====================
const STATS_TABS = [
    { id: 'sales',  perm: 'sales.view',   label: 'Myynti',        icon: 'bi-graph-up' },
    { id: 'cash',   perm: 'sales.view',   label: 'Tilitykset',    icon: 'bi-cash-coin' },
    { id: 'hours',  label: 'Tunnit',        icon: 'bi-clock-history' },
    { id: 'approve', perm: 'payroll.view', label: 'Tuntien hyväksyntä', icon: 'bi-clipboard-check' },
    { id: 'report', perm: 'payroll.view', label: 'Raportti ja palkka-ajo', icon: 'bi-file-earmark-bar-graph' },
    { id: 'bank',   perm: 'payroll.view', label: 'Työaikapankki', icon: 'bi-piggy-bank' }
];
function setStatsTab(id) { state.statsTab = id; try { localStorage.setItem('barshift_stats_tab', id); } catch (e) {} render(); }
function renderStats() {
    const isAdmin = can('payroll.view');
    let savedStats = null; try { savedStats = localStorage.getItem('barshift_stats_tab'); } catch (e) {}
    const visTabs = STATS_TABS.filter(t => !t.perm || can(t.perm));
    const statsTab = visTabs.some(t => t.id === (state.statsTab || savedStats)) ? (state.statsTab || savedStats) : visTabs[0].id; const users = state.data.users; const today = getLocalDateString();
    const monthlyData = {};
    
    function initMonthUser(month, uid) {
        if(!monthlyData[month]) monthlyData[month] = { users: {} };
        if(!monthlyData[month].users[uid]) monthlyData[month].users[uid] = { user: users.find(x => x.id == uid), plannedPast: {n:0, e:0, ni:0, sa:0, su:0}, plannedUpcoming: {n:0, e:0, ni:0, sa:0, su:0}, actual: {n:0, e:0, ni:0, sa:0, su:0} };
    }
    function addW(target, parts) {
        target.n += parts.normalHours; target.e += parts.eveningHours; target.ni += parts.nightHours; target.sa += parts.saturdayHours; target.su += parts.sundayHours;
    }

    state.data.shifts.forEach(s => {
        if (!s.userId || s.userId == 0) return; if (isAdmin && state.statsUserId && state.statsUserId !== 'all' && s.userId != state.statsUserId) return; if (!isAdmin && s.userId != state.user.id) return; if (state.statsStart && s.date < state.statsStart) return; if (state.statsEnd && s.date > state.statsEnd) return;
        let d1 = new Date(`${s.date}T${s.start.substring(0,5)}:00`); let d2 = new Date(`${s.date}T${s.end.substring(0,5)}:00`); if (d2 <= d1) d2.setDate(d2.getDate() + 1);
        const monthKey = d1.toLocaleString('fi-FI', { month: 'long', year: 'numeric' }); const u = users.find(x => x.id == s.userId); if(!u) return;
        initMonthUser(monthKey, u.id); const parts = calculateWageParts(d1, d2, u.hourly_wage);
        if (s.date >= today) addW(monthlyData[monthKey].users[u.id].plannedUpcoming, parts); else addW(monthlyData[monthKey].users[u.id].plannedPast, parts);
    });

    (state.data.time_entries || []).forEach(t => {
        if (!t.clock_out || t.clock_out === '0000-00-00 00:00:00' || t.clock_out === 'null') return; if (isAdmin && state.statsUserId && state.statsUserId !== 'all' && t.user_id != state.statsUserId) return; if (!isAdmin && t.user_id != state.user.id) return;
        const dIn = t.clock_in.split(' ')[0]; if (state.statsStart && dIn < state.statsStart) return; if (state.statsEnd && dIn > state.statsEnd) return;
        const d1 = new Date(t.clock_in.replace(' ', 'T')); const d2 = new Date(t.clock_out.replace(' ', 'T'));
        const monthKey = d1.toLocaleString('fi-FI', { month: 'long', year: 'numeric' }); const u = users.find(x => x.id == t.user_id); if(!u) return;
        initMonthUser(monthKey, u.id); const parts = calculateWageParts(d1, d2, u.hourly_wage); addW(monthlyData[monthKey].users[u.id].actual, parts);
    });

    window._currentStatsData = monthlyData;

    let html = `<div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
        <div><div class="page-title">Tilastot</div></div>
        ${isAdmin && statsTab === 'hours' ? `<button class="btn btn-primary btn-sm" onclick="exportStatsCSV()"><i class="bi bi-file-earmark-spreadsheet"></i> Lataa (CSV)</button>` : ''}
    </div>`;
    if (visTabs.length > 1) html += `<div class="admin-tabs" role="tablist" aria-label="Tilastot">${visTabs.map(t => `<button class="admin-tab ${t.id === statsTab ? 'active' : ''}" role="tab" aria-selected="${t.id === statsTab}" onclick="setStatsTab('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span></button>`).join('')}</div>`;
    if (statsTab === 'sales') return html + renderSalesCard();
    if (statsTab === 'cash') return html + renderCashStats();
    if (statsTab === 'approve') return html + renderHoursApproval();
    if (statsTab === 'report') return html + renderReportCard();
    if (statsTab === 'bank') return html + renderHourBank(false);

    html += renderHourConfirmCard();
    html += `<div class="card card-sm">
            <div class="form-row" style="gap: 8px;">
                ${isAdmin ? `<div class="form-group" style="flex: 1.5; min-width: 150px;"><label class="form-label">Työntekijä</label><select class="form-input" onchange="state.statsUserId=this.value;render()"><option value="all">Kaikki</option>${users.map(u => `<option value="${u.id}" ${state.statsUserId==u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}
                <div class="form-group"><label class="form-label">Alkaen</label><input type="date" class="form-input" value="${state.statsStart || ''}" onchange="state.statsStart=this.value;render()"></div>
                <div class="form-group"><label class="form-label">Päättyen</label><input type="date" class="form-input" value="${state.statsEnd || ''}" onchange="state.statsEnd=this.value;render()"></div>
            </div></div>`;


    Object.keys(monthlyData).reverse().forEach((month, index) => {
        const data = monthlyData[month]; const collapseId = `month-${index}`;
        let monthActual = 0; let monthPast = 0;
        Object.keys(data.users).forEach(uid => { monthActual += data.users[uid].actual.n; monthPast += data.users[uid].plannedPast.n; });

        html += `<div class="card" style="padding:0; margin-bottom:12px; overflow:hidden;">
                <div onclick="toggleMonth('${collapseId}')" style="padding:18px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;">
                    <div><div style="font-weight:700; text-transform:capitalize;">${month}</div></div>
                    <span class="badge badge-teal">${(monthPast + monthActual).toFixed(1)}h yht.</span>
                </div>
                <div id="${collapseId}" style="display:none; padding:0; border-top:1px solid var(--border);">
                    <table class="bs-table">
                        <thead><tr><th>Työntekijä</th><th style="text-align:right">Tavoite</th><th style="text-align:right">Suunniteltu</th><th style="text-align:right; color:var(--teal);">Toteutunut</th><th style="text-align:right">Palkka</th></tr></thead>
                        <tbody>`;
        Object.keys(data.users).forEach(uid => {
            const ud = data.users[uid]; const u = ud.user;
            if (isAdmin || u.id == state.user.id) {
                const p = ud.actual.n > 0 ? ud.actual : ud.plannedPast;
                const wage = ((p.n * u.hourly_wage) + (p.e * pubCfg().bonuses.evening) + (p.ni * pubCfg().bonuses.night) + (p.sa * pubCfg().bonuses.sat) + (p.su * u.hourly_wage * (pubCfg().bonuses.sun - 1))).toFixed(2);
                html += `<tr><td><strong>${esc(u.name)}</strong></td><td style="text-align:right">${u.target_hours || '-'}</td><td style="text-align:right">${ud.plannedPast.n.toFixed(1)}</td><td style="text-align:right; color:var(--teal); font-weight:700;">${ud.actual.n.toFixed(1)}</td><td style="text-align:right;"><strong>${wage} €</strong></td></tr>`;
            }
        });
        html += `</tbody></table></div></div>`;
    });
    return html;
}

function exportStatsCSV() {
    if (!window._currentStatsData || Object.keys(window._currentStatsData).length === 0) return showToast("Ei dataa", "error");
    let csv = "Kuukausi;Tyontekija;Suunnitellut (h);Toteutuneet (h);Arvioitu palkka (EUR)\n";
    Object.keys(window._currentStatsData).forEach(month => {
        const usersObj = window._currentStatsData[month].users;
        Object.keys(usersObj).forEach(userId => {
            const stat = usersObj[userId]; const u = stat.user; const p = stat.actual.n > 0 ? stat.actual : stat.plannedPast;
            const wage = ((p.n * u.hourly_wage) + (p.e * pubCfg().bonuses.evening) + (p.ni * pubCfg().bonuses.night) + (p.sa * pubCfg().bonuses.sat) + (p.su * u.hourly_wage * (pubCfg().bonuses.sun - 1))).toFixed(2);
            csv += `${month};${esc(u.name)};${stat.plannedPast.n.toFixed(1)};${stat.actual.n.toFixed(1)};${wage}\n`;
        });
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `palkat_${getLocalDateString()}.csv`; link.click();
}

function toggleMonth(id) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' ? 'block' : 'none'; }

// ===================== RAPORTTI JA PALKKA-AJO (admin) =====================
function reportRange() {
    const cur = getLocalDateString().slice(0, 7);
    return { from: state.reportFrom || cur, to: state.reportTo || state.reportFrom || cur };
}
async function loadReport() {
    const { from, to } = reportRange();
    state.reportLoading = true; state.reportError = null; render();
    try {
        const r = await (await fetch(`api.php?action=report&from=${from}&to=${to}`)).json();
        if (r.error) state.reportError = r.error; else state.report = r;
    } catch (e) { state.reportError = 'Yhteysvirhe'; }
    state.reportLoading = false; render();
}
function setReportRange(k, v) {
    if (!v) return;
    state[k] = v; state.report = null;
    if (k === 'reportFrom' && (!state.reportTo || state.reportTo < v)) state.reportTo = v;
    render();
}
function printReport() { window.print(); }
function renderReportCard() {
    const { from, to } = reportRange(), r = state.report, cfg = pubCfg();
    const eur = v => Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    const h = v => Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    let table = '';
    if (state.reportLoading) table = '<div class="tool-empty">Lasketaan…</div>';
    else if (state.reportError) table = `<div class="leave-box warn">${esc(state.reportError)}</div>`;
    else if (r && r.months) {
        const byMonth = {};
        r.rows.forEach(x => (byMonth[x.month] = byMonth[x.month] || []).push(x));
        const monthName = m => new Date(m + '-01T12:00').toLocaleString('fi-FI', { month: 'long', year: 'numeric' });
        table = `<div id="report-print"><h2 class="print-only" style="margin:0 0 4px;">${esc(cfg.name || 'Baari')} – tuntiraportti</h2>
            <div class="print-only" style="margin-bottom:12px; font-size:12px;">${from === to ? monthName(from) : monthName(from) + ' – ' + monthName(to)} · tulostettu ${new Date().toLocaleDateString('fi-FI')}</div>
            <div style="overflow-x:auto;"><table class="bs-table"><thead><tr><th>Kuukausi</th><th>Työntekijä</th><th style="text-align:right">Tunnit</th><th style="text-align:right">Ilta</th><th style="text-align:right">Yö</th><th style="text-align:right">La</th><th style="text-align:right">Su</th><th style="text-align:right">Palkka</th><th style="text-align:right">Kustannus</th></tr></thead><tbody>
            ${r.months.map(m => { const rows = byMonth[m] || []; if (!rows.length) return ''; const tot = rows.reduce((a, x) => ({ h: a.h + x.hours, p: a.p + x.total_pay, c: a.c + x.employer_cost }), { h: 0, p: 0, c: 0 });
                return rows.map((x, i) => `<tr><td>${i === 0 ? `<b style="text-transform:capitalize">${monthName(m)}</b>` : ''}</td><td>${esc(x.name)}${hoursBadge(x.hours_status)}${x.employment_type === 'casual' ? ' <span class="badge badge-orange">Keikka</span>' : ''}${x.source === 'vuorot' ? ' <small style="color:var(--text3)" title="Ei leimauksia: laskettu vuoroista">(vuorot)</small>' : ''}</td><td style="text-align:right">${h(x.hours)}</td><td style="text-align:right">${h(x.evening)}</td><td style="text-align:right">${h(x.night)}</td><td style="text-align:right">${h(x.saturday)}</td><td style="text-align:right">${h(x.sunday)}</td><td style="text-align:right">${eur(x.total_pay)}</td><td style="text-align:right">${eur(x.employer_cost)}</td></tr>`).join('')
                    + `<tr style="background:var(--surface2); font-weight:700;"><td></td><td>Yhteensä</td><td style="text-align:right">${h(tot.h)}</td><td colspan="4"></td><td style="text-align:right">${eur(tot.p)}</td><td style="text-align:right">${eur(tot.c)}</td></tr>`; }).join('')}
            </tbody></table></div>
            <p style="font-size:12px; color:var(--text3); margin:8px 0 0;">Kustannus = palkka + sivukulut ${Number(r.side_cost_pct).toLocaleString('fi-FI')} %. Tunnit leimauksista; jos leimauksia ei ole, jo toteutuneista vuoroista. Palkkalisät: ilta +${cfg.bonuses.evening} €/h (klo ${cfg.evening_start}→), yö +${cfg.bonuses.night} €/h (→klo ${cfg.night_end}), la +${cfg.bonuses.sat} €/h, su ${cfg.bonuses.sun}×.</p></div>`;
        if (!r.rows.length) table = '<div class="tool-empty">Ei työtunteja valitulla ajalla</div>';
    }
    return `<div class="card card-sm">
        <div class="section-header"><span class="section-title"><i class="bi bi-file-earmark-bar-graph"></i> Raportti ja palkka-ajo</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Tunnit ja kustannus kuukausittain työntekijöittäin. Lisät ja sivukulut asetetaan kohdassa <b>Hallinta → Baari</b>.</p>
        <div class="form-row" style="align-items:flex-end; gap:8px; flex-wrap:wrap;">
            <div class="form-group"><label class="form-label">Alkaen</label><input type="month" class="form-input" value="${from}" onchange="setReportRange('reportFrom', this.value)"></div>
            <div class="form-group"><label class="form-label">Päättyen</label><input type="month" class="form-input" value="${to}" onchange="setReportRange('reportTo', this.value)"></div>
            <div class="form-group" style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="loadReport()"><i class="bi bi-table"></i> Näytä</button>
                <a class="btn btn-ghost" href="api.php?action=report&from=${from}&to=${to}&format=csv"><i class="bi bi-filetype-csv"></i> CSV</a>
                <a class="btn btn-ghost" href="api.php?action=report&from=${from}&to=${to}&format=csv&layout=lines" title="Rivi per työntekijä ja palkkalaji (palkkajärjestelmän tuontiin)"><i class="bi bi-filetype-csv"></i> Palkkatapahtumat</a>
                ${r ? `<button class="btn btn-ghost" onclick="printReport()"><i class="bi bi-printer"></i> Tulosta / PDF</button>` : ''}
            </div>
        </div>
        ${table}
    </div>`;
}

// Vuorolistan monivalinta (renderTable, selectable)
function toggleShiftSelection(id, checked) {
    state.selectedShiftIds = state.selectedShiftIds || new Set();
    if (checked) state.selectedShiftIds.add(id); else state.selectedShiftIds.delete(id);
    render();
}
function toggleAllShifts(checked, ids) {
    state.selectedShiftIds = state.selectedShiftIds || new Set();
    (ids || []).forEach(id => { if (checked) state.selectedShiftIds.add(id); else state.selectedShiftIds.delete(id); });
    render();
}

// ===================== VIIKKOPOHJAT ja VUOROJEN TYHJENNYS (admin) =====================
function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T12:00:00'), day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    d.setDate(d.getDate() - day); return getLocalDateString(d);
}
function openWeekTemplates(weekStart) {
    const tpls = state.data.week_templates || [], target = mondayOf(getLocalDateString(new Date(new Date(weekStart + 'T12:00:00').getTime() + 7 * 864e5)));
    const inWeek = state.data.shifts.filter(x => x.date >= weekStart && x.date <= getLocalDateString(new Date(new Date(weekStart + 'T12:00:00').getTime() + 6 * 864e5))).length;
    const body = `
        <div class="section-header" style="margin-top:0;"><span class="section-title">Syötä pohja viikkoon</span><div class="section-line"></div></div>
        ${tpls.length ? `
        <div class="form-group" style="margin-bottom:10px;"><label class="form-label">Pohja</label>
            <select id="wt-id" class="form-input">${tpls.map(t => `<option value="${t.id}">${esc(t.name)} (${Math.round(t.n)} vuoroa)</option>`).join('')}</select></div>
        <div class="form-group" style="margin-bottom:10px;"><label class="form-label">Mihin viikkoon (valitse mikä tahansa viikon päivä)</label>
            <input id="wt-week" type="date" class="form-input" value="${target}"></div>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="wt-draft" type="checkbox" checked><span><b>Luonnoksina</b> – ei näy työntekijöille ennen julkaisua</span></label>
        <label class="abs-choice" style="margin-bottom:12px;"><input id="wt-open" type="checkbox"><span><b>Kaikki avoimiksi vuoroiksi</b> – ilman työntekijöitä<br><small>Muuten vuorot menevät samoille työntekijöille kuin pohjassa.</small></span></label>
        <button class="btn btn-primary" onclick="applyWeekTemplate()"><i class="bi bi-box-arrow-in-down"></i> Syötä viikkoon</button>
        <div style="margin-top:12px;">${tpls.map(t => `<span class="tpl-chip">${esc(t.name)}<button type="button" aria-label="Poista pohja" title="Poista pohja" onclick="deleteWeekTemplate(${t.id})">×</button></span>`).join('')}</div>`
        : '<p style="font-size:13px; color:var(--text3); margin:0 0 6px;">Ei viikkopohjia vielä.</p>'}
        <div class="section-header" style="margin-top:22px;"><span class="section-title">Tallenna näkyvä viikko pohjaksi</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 8px;">Näkyvällä viikolla on <b>${inWeek}</b> vuoroa (${formatDate(weekStart)} alkava viikko). Ne tallennetaan viikonpäivittäin ja työntekijöineen.</p>
        <div style="display:flex; gap:8px;"><input id="wt-name" class="form-input" maxlength="60" placeholder='Esim. "Normaaliviikko"'><button class="btn btn-ghost" onclick="saveWeekTemplate('${weekStart}')" ${inWeek ? '' : 'disabled'}><i class="bi bi-bookmark-plus"></i> Tallenna</button></div>`;
    openModal('Viikkopohjat', 'bi-bookmarks', body, `<button class="btn btn-ghost" onclick="closeModal()">Sulje</button>`);
}
async function saveWeekTemplate(weekStart) {
    const name = document.getElementById('wt-name').value.trim(); if (!name) return showToast('Anna pohjalle nimi', 'error');
    const r = await (await fetch('api.php?action=week_template', { method: 'POST', body: JSON.stringify({ name, weekStart }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast(`Pohja tallennettu (${r.shifts} vuoroa)`); closeModal(); await load(); openWeekTemplates(weekStart);
}
async function applyWeekTemplate() {
    const id = document.getElementById('wt-id').value, weekStart = document.getElementById('wt-week').value;
    if (!weekStart) return showToast('Valitse viikko', 'error');
    const mon = mondayOf(weekStart);
    const r = await (await fetch('api.php?action=apply_week_template', { method: 'POST', body: JSON.stringify({ id, weekStart: mon,
        status: document.getElementById('wt-draft').checked ? 'draft' : 'published', mode: document.getElementById('wt-open').checked ? 'open' : '' }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); state.shiftGridDate = new Date(mon + 'T12:00:00');
    showToast(`${r.created} vuoroa lisätty` + (r.skipped ? `, ${r.skipped} oli jo olemassa` : '') + (r.opened ? `, ${r.opened} avoimeksi (työntekijä poistunut)` : '')); load();
}
async function deleteWeekTemplate(id) {
    if (!confirm('Poistetaanko viikkopohja?')) return;
    await fetch(`api.php?id=${id}&type=week_template`, { method: 'DELETE' });
    showToast('Pohja poistettu'); closeModal(); await load();
}
function openClearShifts(from, to) {
    const body = `
        <p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Poistaa valitun ajanjakson vuorot kerralla. Tätä ei voi perua.</p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
            <button class="pill" onclick="setClearRange('${from}','${from}')">Viikon 1. päivä</button>
            <button class="pill" onclick="setClearRange('${getLocalDateString()}','${getLocalDateString()}')">Tänään</button>
            <button class="pill active" onclick="setClearRange('${from}','${to}')">Näkyvä viikko</button>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
            <div class="form-group"><label class="form-label">Alkaen</label><input id="cl-from" type="date" class="form-input" value="${from}" oninput="updateClearCount()"></div>
            <div class="form-group"><label class="form-label">Päättyen</label><input id="cl-to" type="date" class="form-input" value="${to}" oninput="updateClearCount()"></div>
        </div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Kenen vuorot</label>
            <select id="cl-user" class="form-input" onchange="updateClearCount()"><option value="">Kaikki</option><option value="0">Vain avoimet vuorot</option>${state.data.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
        <label class="abs-choice" style="margin-bottom:12px;"><input id="cl-draft" type="checkbox" onchange="updateClearCount()"><span><b>Vain luonnokset</b> – julkaistut vuorot jäävät</span></label>
        <div id="cl-count" class="warn-box" style="margin:0;"></div>`;
    openModal('Tyhjennä vuorot', 'bi-eraser', body, `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-danger" id="cl-go" onclick="confirmClearShifts()"><i class="bi bi-trash"></i> Tyhjennä</button>`);
    updateClearCount();
}
function setClearRange(a, b) { document.getElementById('cl-from').value = a; document.getElementById('cl-to').value = b; updateClearCount(); }
function clearMatches() {
    const f = document.getElementById('cl-from').value, t = document.getElementById('cl-to').value, u = document.getElementById('cl-user').value, dr = document.getElementById('cl-draft').checked;
    return state.data.shifts.filter(s => s.date >= f && s.date <= t && (!dr || s.status === 'draft') && (u === '' || (u === '0' ? !s.userId : s.userId == u)));
}
function updateClearCount() {
    const n = clearMatches().length, box = document.getElementById('cl-count'), btn = document.getElementById('cl-go'); if (!box) return;
    box.innerHTML = n ? `<b>${n}</b> vuoroa poistetaan.` : 'Ei poistettavia vuoroja valinnalla.'; btn.disabled = !n;
}
async function confirmClearShifts() {
    const n = clearMatches().length; if (!n) return;
    if (!confirm(`Poistetaanko ${n} vuoroa lopullisesti?`)) return;
    const u = document.getElementById('cl-user').value;
    const r = await (await fetch('api.php?action=clear_shifts', { method: 'POST', body: JSON.stringify({ from: document.getElementById('cl-from').value, to: document.getElementById('cl-to').value, userId: u, only_drafts: document.getElementById('cl-draft').checked }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast(`${r.deleted} vuoroa poistettu`); load();
}

// ===================== VUOROHAKU (valinnainen ominaisuus) =====================
function shiftBidsOf(sid) { return (state.data.shift_bids || []).filter(b => b.shift_id == sid); }
function myBid(sid) { return (state.data.shift_bids || []).find(b => b.shift_id == sid && b.user_id == state.user.id); }
function openShiftLabel(sid) { return pubFeature('bidding') ? (myBid(sid) ? 'Haettu ✓ (peru)' : 'Hae vuoroa') : 'Ota vuoro'; }
async function bidShift(sid) {
    const mine = myBid(sid);
    let note = '';
    if (!mine) { note = prompt('Haluatko lisätä viestin ylläpidolle? (valinnainen)', ''); if (note === null) return; }
    const res = await fetch('api.php?action=shift_bid', { method: 'POST', body: JSON.stringify({ shift_id: sid, note, withdraw: mine ? 1 : 0 }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Hakeminen epäonnistui', 'error');
    showToast(mine ? 'Hakemus peruttu' : 'Hakemus lähetetty – ylläpito valitsee tekijän'); load();
}
async function openShiftBids(sid) {
    const s = (state.data.shifts || []).find(x => x.id == sid); if (!s) return;
    openModal(`Hakijat: ${formatDate(s.date)} ${s.start.slice(0, 5)}–${s.end.slice(0, 5)}`, 'bi-people', '<div class="tool-empty">Ladataan…</div>', '');
    const r = await (await fetch('api.php?action=shift_bids&shift_id=' + sid)).json().catch(() => ({}));
    if (r.error) { closeModal(); return showToast(r.error, 'error'); }
    document.getElementById('modal-body-el').innerHTML = r.bids.length ? r.bids.map(b => `<div style="padding:10px 0; border-top:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:8px;"><b style="flex:1">${esc(b.name)}</b><button class="btn btn-primary btn-sm" onclick="assignShift(${sid}, ${b.user_id})">Valitse</button></div>
        ${b.note ? `<div style="font-size:13px; color:var(--text2);">"${esc(b.note)}"</div>` : ''}
        ${(b.warnings || []).map(w => `<div style="font-size:12px; color:#F59E0B;"><i class="bi bi-exclamation-triangle"></i> ${esc(w.msg)}</div>`).join('')}</div>`).join('') : '<div class="tool-empty">Ei hakijoita.</div>';
    document.getElementById('modal-footer-el').innerHTML = '<button class="btn btn-ghost" onclick="closeModal()">Sulje</button>';
}
async function assignShift(sid, uid) {
    const res = await fetch('api.php?action=shift_assign', { method: 'POST', body: JSON.stringify({ shift_id: sid, user_id: uid }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Valinta epäonnistui', 'error');
    closeModal(); showToast('Vuoro annettu – hakijoille ilmoitettu'); load();
}

// ===================== AUTOMAATTINEN VUOROSUUNNITELMA (valinnainen ominaisuus) =====================
async function autoScheduleWeek(weekStart) {
    if (!confirm('Luodaanko viikolle luonnokset miehityssääntöjen mukaan? Luonnokset eivät näy työntekijöille ennen julkaisua, ja voit muokata tai poistaa niitä.')) return;
    const res = await fetch('api.php?action=auto_schedule', { method: 'POST', body: JSON.stringify({ week_start: weekStart }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Luonti epäonnistui', 'error');
    const un = j.unfilled || [];
    showToast(j.created ? `${j.created} vuoroa lisätty luonnoksina` + (un.length ? ` – ${un.length} vuoroa jäi täyttämättä` : '') : (un.length ? 'Ei löytynyt sopivia tekijöitä' : 'Ei täydennettävää: miehitys on jo kunnossa'));
    if (un.length) openModal('Täyttämättä jääneet', 'bi-exclamation-triangle', `<p style="font-size:13px; color:var(--text2);">Näihin ei löytynyt sopivaa tekijää (saatavuus, poissaolot, lepoaika, viikkotunnit tai vaadittu osaaminen):</p><ul>${un.map(u => `<li>${formatDate(u.date)} ${u.start}–${u.end} ${esc(u.role || '')} (puuttuu ${u.missing})</li>`).join('')}</ul>`, '<button class="btn btn-primary" onclick="closeModal()">Selvä</button>');
    load();
}
