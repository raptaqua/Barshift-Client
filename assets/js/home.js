// ===================== DASHBOARD =====================
function dashWageCard(today, isAdmin) {
    const currentMonthIndex = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    let myActualN = 0, myActualE = 0, myActualNi = 0, myActualSa = 0, myActualSu = 0;
    let myUpN = 0, myUpE = 0, myUpNi = 0, myUpSa = 0, myUpSu = 0;
    const currentUserData = state.data.users.find(x => x.id == state.user.id);
    
    if (currentUserData) {
        state.data.shifts.forEach(s => {
            if (s.userId != currentUserData.id) return;
            const d1 = new Date(`${s.date}T${s.start.substring(0,5)}:00`);
            if (d1.getMonth() !== currentMonthIndex || d1.getFullYear() !== currentYear) return;
            let d2 = new Date(`${s.date}T${s.end.substring(0,5)}:00`);
            if (d2 <= d1) d2.setDate(d2.getDate() + 1);
            const parts = calculateWageParts(d1, d2, currentUserData.hourly_wage);
            if (s.date >= today) { myUpN += parts.normalHours; myUpE += parts.eveningHours; myUpNi += parts.nightHours; myUpSa += parts.saturdayHours; myUpSu += parts.sundayHours; }
        });
        state.data.time_entries.forEach(t => {
            if (t.user_id != currentUserData.id || !t.clock_out || t.clock_out === '0000-00-00 00:00:00' || t.clock_out === 'null') return;
            const d1 = new Date(t.clock_in.replace(' ', 'T'));
            if (d1.getMonth() !== currentMonthIndex || d1.getFullYear() !== currentYear) return;
            const d2 = new Date(t.clock_out.replace(' ', 'T'));
            const parts = calculateWageParts(d1, d2, currentUserData.hourly_wage);
            myActualN += parts.normalHours; myActualE += parts.eveningHours; myActualNi += parts.nightHours; myActualSa += parts.saturdayHours; myActualSu += parts.sundayHours;
        });
    }
    
    const hW = currentUserData ? parseFloat(currentUserData.hourly_wage) || 0 : 0;
    const targetH = currentUserData ? parseInt(currentUserData.target_hours) || 0 : 0;
    const totalActualWage = (myActualN * hW) + (myActualE * pubCfg().bonuses.evening) + (myActualNi * pubCfg().bonuses.night) + (myActualSa * pubCfg().bonuses.sat) + (myActualSu * hW * (pubCfg().bonuses.sun - 1));
    const totalUpWage = (myUpN * hW) + (myUpE * pubCfg().bonuses.evening) + (myUpNi * pubCfg().bonuses.night) + (myUpSa * pubCfg().bonuses.sat) + (myUpSu * hW * (pubCfg().bonuses.sun - 1));
    const currentMonthName = new Date().toLocaleString('fi-FI', { month: 'long' });
    
    const doneHours = myActualN;
    const upcomingHours = myUpN;
    const totalHours = doneHours + upcomingHours;
    
    let wageCardHtml = '';
    if (!isAdmin || targetH > 0 || totalActualWage > 0 || totalUpWage > 0) {
        let progressHtml = '';
        if (targetH > 0) {
            let pctDone = Math.min(100, (doneHours / targetH) * 100);
            let pctUp = Math.min(100 - pctDone, (upcomingHours / targetH) * 100);
            let colorText = totalHours < targetH ? '#E11D48' : '#0D9488'; 
            let statusText = totalHours < targetH ? `Jäät tavoitteesta ${Math.max(0, targetH - totalHours).toFixed(1)}h.` : 'Tavoite saavutettu! 🎉';
            
            progressHtml = `
                <div style="margin-top:16px;">
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; color:var(--text2); margin-bottom:4px;">
                        <span>Tavoitetunnit: ${totalHours.toFixed(1)} / ${targetH} h</span>
                        <span style="color:${colorText};">${statusText}</span>
                    </div>
                    <div style="width:100%; height:8px; background:var(--surface2); border-radius:100px; overflow:hidden; display:flex;">
                        <div style="height:100%; width:${pctDone}%; background:var(--teal);"></div>
                        <div style="height:100%; width:${pctUp}%; background:var(--accent2); opacity:0.6;"></div>
                    </div>
                </div>
            `;
        }

        wageCardHtml = `
        <div class="card card-sm" style="margin-bottom:0;">
            <div style="font-size:12px; color:var(--text3); font-weight:700; margin-bottom:12px; text-transform:uppercase;"><i class="bi bi-wallet2"></i> Palkka-arvio (${currentMonthName})</div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <div style="font-size:12px; color:var(--text3); margin-bottom:2px;">Toteutunut palkka</div>
                    <div style="font-size:24px; font-weight:800; color:var(--text);">${totalActualWage.toFixed(2)} €</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px; color:var(--text3); margin-bottom:2px;">Tulevat</div>
                    <div style="font-size:16px; font-weight:700; color:var(--accent2);">+${totalUpWage.toFixed(2)} €</div>
                </div>
            </div>
            ${progressHtml}
        </div>`;
    }

    return wageCardHtml;
}

// ===================== ETUSIVU =====================
function toggleDash(key, val) {
    state.dashOpen = state.dashOpen || {};
    state.dashOpen[key] = val === undefined ? !state.dashOpen[key] : val;
    try { localStorage.setItem('barshift_dash_open', JSON.stringify(state.dashOpen)); } catch (e) {}
    render();
}
function isDashOpen(key, def) {
    if (!state.dashOpen) { try { state.dashOpen = JSON.parse(localStorage.getItem('barshift_dash_open') || '{}'); } catch (e) { state.dashOpen = {}; } }
    return state.dashOpen[key] === undefined ? def : state.dashOpen[key];
}
function setDashTool(id) { state.dashTool = id; try { localStorage.setItem('barshift_dash_tool', id); } catch (e) {} render(); }
function goOpenShifts() { state.shiftsTab = 'list'; state.shiftRange = 'upcoming'; state.shiftWho = 'open'; try { localStorage.setItem('barshift_shifts_tab', 'list'); } catch (e) {} nav('list'); }

/** Yksi "Huomio"-ryhmä: otsikkorivi + laajennettava sisältö. */
function attGroup(key, icon, title, count, color, body, defOpen = false, extraHead = '') {
    const open = isDashOpen(key, defOpen);
    return `<div class="att-group ${open ? 'open' : ''}" style="--att:${color}">
        <button class="att-head" onclick="toggleDash('${key}')" aria-expanded="${open}">
            <i class="bi ${icon}"></i><span class="att-title">${title}</span>${extraHead}
            <span class="att-count">${count}</span><i class="bi bi-chevron-down att-chev"></i>
        </button>
        ${open ? `<div class="att-body">${body}</div>` : ''}
    </div>`;
}

function renderAttention(today, isAdmin) {
    const groups = [];
    const st = state.data;

    if (isAdmin) {   // lakisääteiset luvat
        const warn = [];
        (st.users || []).forEach(u => {
            if (!u.expiry_jv) return;
            const diff = (new Date(u.expiry_jv) - new Date()) / 86400000;
            if (diff <= 60) warn.push({ name: u.name, date: fullDate(u.expiry_jv), expired: diff < 0 });
        });
        if (warn.length) groups.push(attGroup('lic', 'bi-shield-exclamation', 'Luvat vanhenemassa', warn.length, '#E11D48',
            warn.map(w => `<div class="att-row" onclick="nav('admin')" style="cursor:pointer;"><div><b>${esc(w.name)}</b> · JV-kortti <span style="color:${w.expired ? '#E11D48' : 'var(--text2)'}; font-weight:${w.expired ? 700 : 400};">${w.expired ? 'vanhentunut' : 'vanhenee'} ${w.date}</span></div></div>`).join(''), warn.some(w => w.expired)));

        const pend = (st.absences || []).filter(a => a.status === 'pending').sort((x, y) => x.start_date.localeCompare(y.start_date));
        if (pend.length) groups.push(attGroup('abs', 'bi-calendar-x', 'Poissaolopyynnöt', pend.length, '#F59E0B',
            pend.slice(0, 5).map(a => { const u = (st.users || []).find(x => x.id == a.user_id) || {}; const t = ABS_TYPES[a.type] || ABS_TYPES.other;
                return `<div class="att-row"><div><b>${esc(u.name || '')}</b> · ${t.icon} ${t.label}<br><small>${formatDate(a.start_date)}${a.start_date !== a.end_date ? ' – ' + formatDate(a.end_date) : ''}</small></div></div>`; }).join('')
            + `<button class="btn btn-primary btn-sm att-cta" onclick="setAbsFilter('pending'); nav('absences')">Käsittele pyynnöt →</button>`, pend.length <= 2));
    }

    {   // viime kuun tuntien vahvistus (kuun alussa) tai ylläpidon palauttamat tunnit
        const confirmable = confirmableMonths().filter(m => { const c = hourConfOf(m); return !c ? (m < today.slice(0, 7) && today.slice(8, 10) <= '10' && (st.shifts || []).some(s => s.userId == state.user.id && s.date.slice(0, 7) === m)) : c.status === 'returned'; });
        if (confirmable.length) groups.push(attGroup('hrs', 'bi-clipboard-check', 'Vahvista tunnit', confirmable.length, '#2563EB',
            confirmable.map(m => `<div class="att-row" onclick="openHourConfirm('${m}')" style="cursor:pointer;"><div><b style="text-transform:capitalize">${monthLabel(m)}</b><br><small>${(hourConfOf(m) || {}).status === 'returned' ? 'Ylläpito palautti korjattavaksi' : 'Tarkista ja vahvista toteutuneet tunnit'}</small></div></div>`).join(''), false));
    }

    if (isAdmin && (st.system_alerts || []).length) groups.push(attGroup('sys', 'bi-heart-pulse', 'Järjestelmän tila', st.system_alerts.length, '#E11D48',
        st.system_alerts.map(a => `<div class="att-row"><div>${esc(a.text)}</div></div>`).join('')
        + `<button class="btn btn-primary btn-sm att-cta" onclick="setAdminTab('system'); nav('admin')">Avaa järjestelmän tila →</button>`, false));

    if (can('shifts.manage') && (st.hub_pending_apps || []).length) {   // keikkahakemukset muista baareista / keskuksesta
        const ga = st.hub_pending_apps;
        groups.push(attGroup('gig', 'bi-person-lines-fill', 'Keikkahakemukset', ga.length, '#2563EB',
            ga.slice(0, 5).map(a => `<div class="att-row" onclick="setAdminTab('gigapps'); nav('admin')" style="cursor:pointer;"><div><b>${esc(a.name)}</b> hakee vuoroa<br><small>${formatDate(a.date)} ${esc(String(a.start).slice(0, 5))}–${esc(String(a.end).slice(0, 5))} ${esc(a.role || '')}</small></div></div>`).join('')
            + `<button class="btn btn-primary btn-sm att-cta" onclick="setAdminTab('gigapps'); nav('admin')">Käsittele hakemukset →</button>`, ga.length <= 2));
    }

    if (can('shifts.manage')) {   // miehityspuutteet seuraavan viikon aikana
        const lim = getLocalDateString(new Date(Date.now() + 6 * 864e5));
        const gaps = (st.coverage || []).filter(c => c.shortage > 0 && c.date <= lim);
        if (gaps.length) groups.push(attGroup('cov', 'bi-people', 'Miehityspuutteet', gaps.length, '#E11D48',
            gaps.slice(0, 4).map(c => `<div class="att-row"><div><b>${formatDate(c.date)}</b> ${c.start}–${c.end} ${esc(c.role || '')}<br><small>tarvitaan ${c.need}, vähimmillään ${c.min}</small></div><span class="badge" style="background:#FEE2E2; color:#B91C1C;">−${c.shortage}</span></div>`).join('')
            + `<button class="btn btn-primary btn-sm att-cta" onclick="setAdminTab('coverage'); nav('admin')">Avaa miehitys →</button>`, gaps.length <= 2));
    }

    {   // tiimi: kuitattavat dokumentit, keskeneräiset perehdytykset, avoimet kyselyt
        const docs = (st.documents || []).filter(d => d.requires_ack && !d.acked);
        const onb = (st.checklist_progress || []).filter(p => p.user_id == state.user.id && !p.completed_at);
        const sv = (st.surveys || []).filter(x => x.status === 'open' && !x.answered);
        const n = docs.length + onb.length + sv.length;
        if (n) groups.push(attGroup('team', 'bi-people-fill', 'Tiimi', n, 'var(--teal)',
            docs.map(d => `<div class="att-row"><div>📄 <b>${esc(d.title)}</b><br><small>kuittaa luetuksi</small></div></div>`).join('')
            + onb.map(p => `<div class="att-row"><div>📋 <b>${esc(p.name)}</b><br><small>${p.done.length}/${p.items.length} tehty</small></div></div>`).join('')
            + sv.map(x => `<div class="att-row"><div>🗳️ <b>${esc(x.question)}</b><br><small>nimetön kysely</small></div></div>`).join('')
            + `<button class="btn btn-primary btn-sm att-cta" onclick="nav('team')">Avaa Tiimi →</button>`, n <= 2));
    }

    // vuoronvaihdot (olemassa oleva näkymä)
    const tradeCount = (st.trades || []).filter(t => (t.status === 'open' && t.offered_by_id != state.user.id) || (t.status === 'pending' && t.offered_by_id == state.user.id) || (t.status === 'open' && t.offered_by_id == state.user.id)).length;
    if (tradeCount) groups.push(attGroup('trade', 'bi-arrow-left-right', 'Vuoronvaihdot', tradeCount, 'var(--accent)', renderTradeAlerts(), true));


    // avoimet vuorot
    const open = (st.shifts || []).filter(s => (!s.userId || s.userId == 0) && s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    if (open.length) {
        const rows = open.slice(0, 3).map(s => {
            let orig = '';
            if (s.original_userId) { const ou = (st.users || []).find(x => x.id == s.original_userId); if (ou) orig = ` <small>(sairas: ${esc(ou.name.split(' ')[0])})</small>`; }
            return `<div class="att-row"><div><b>${formatDate(s.date)}</b> ${s.start.slice(0, 5)}–${s.end.slice(0, 5)}<br><small>${getRoleIcon(s.role)} ${esc(s.role)}${orig}</small></div>
                <button class="btn btn-primary btn-sm" style="background:var(--accent2); border:none;" onclick="takeOpenShift(${s.id})">${openShiftLabel(s.id)}</button></div>`;
        }).join('');
        groups.push(attGroup('open', 'bi-unlock', 'Avoimet vuorot', open.length, '#F59E0B',
            rows + (open.length > 3 ? `<button class="btn btn-ghost btn-sm att-cta" onclick="goOpenShifts()">Näytä kaikki ${open.length} avointa vuoroa →</button>` : ''), open.length <= 3));
    }

    if (!groups.length) return `<div class="att-empty"><i class="bi bi-check2-circle"></i> Ei mitään huomioitavaa juuri nyt.</div>`;
    return `<div class="att-list">${groups.join('')}</div>`;
}

// ---------- Työkalukortti: Rutiinit / Puutelista / Vuorokirja ----------
function renderRoutinesBody(today) {
    const tasks = state.data.tasks || [];
    if (!tasks.length) return `<div class="tool-empty">Ei rutiineja. Admin voi lisätä ne Hallinta-sivulta.</div>`;
    return `<div style="display:flex; flex-direction:column; gap:4px;">` + tasks.map(t => {
        const done = (state.data.task_completions || []).some(tc => tc.task_id == t.id && tc.date === today);
        if (t.kind === 'cash') {   // kassatilitys: kuittaus syöttämällä loppusumma
            if (!can('cash.submit') && !can('sales.view')) return '';
            const cr = (state.data.cash_recent || []).find(r => r.date === today);
            return `<div class="rt-row ${done ? 'done' : ''}" onclick="openCashModal(${done ? `'${today}'` : ''})">
                <span class="rt-box">${done ? '<i class="bi bi-check"></i>' : '<i class="bi bi-cash-coin"></i>'}</span><span class="rt-label">${esc(t.label)}${done ? (cr ? ` – <b>${cashEur(cr.sales_total)}</b>${cr.difference ? ` <small style="color:var(--red, #dc2626)">ero ${cashDiff(cr.difference)}</small>` : ''}` : ' – tehty') : ' <small style="color:var(--text3)">syötä loppusumma</small>'}</span></div>`;
        }
        return `<div class="rt-row ${done ? 'done' : ''}" onclick="toggleTask(${t.id}, '${today}', ${!done})">
            <span class="rt-box">${done ? '<i class="bi bi-check"></i>' : ''}</span><span class="rt-label">${esc(t.label)}</span></div>`;
    }).join('') + `</div>`;
}

function renderShopBody(isAdmin) {
    const list = state.data.shopping_list || [];
    let html = `<div style="display:flex; gap:8px; margin-bottom:12px;">
        <input id="new-shop-item" class="form-input" style="padding:10px; font-size:13px;" placeholder="Mitä puuttuu?" onkeydown="if(event.key==='Enter')addShopItem()">
        <button class="btn btn-primary" style="background:var(--teal)" onclick="addShopItem()" aria-label="Lisää"><i class="bi bi-plus-lg"></i></button></div>`;
    if (!list.length) return html + `<div class="tool-empty">Kaikkea löytyy! 🎉</div>`;
    html += `<div class="tool-list">` + list.map(s => {
        const d = s.created_at ? new Date(s.created_at.replace(' ', 'T')) : new Date();
        const when = `${d.getDate()}.${d.getMonth() + 1}. ${d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`;
        const own = s.added_by == state.user.id;
        return `<div class="tool-item" style="border-left-color:var(--accent2);">
            <div style="min-width:0;"><div class="tool-text">${esc(s.item_name)} ${s.status === 'in_progress' ? '<span class="badge badge-amber">Työn alla</span>' : ''}</div><div class="tool-meta">${esc(s.added_by_name || '')} · ${when}${s.assigned_to ? ` · vastuussa: <b>${esc(uName(s.assigned_to))}</b>` : ''}</div>
                ${s.image_path ? `<a href="${esc(s.image_path)}" target="_blank" rel="noopener"><img src="${esc(s.image_path)}" alt="Kuva" loading="lazy" style="max-width:120px; max-height:80px; border-radius:6px; margin-top:6px;"></a>` : ''}</div>
            <div class="tool-btns">
                <button class="btn btn-ghost btn-sm btn-icon" onclick="shopStatus(${s.id}, '${s.status === 'in_progress' ? 'pending' : 'in_progress'}')" title="${s.status === 'in_progress' ? 'Palauta avoimeksi' : 'Otan hoitaakseni'}" aria-label="${s.status === 'in_progress' ? 'Palauta avoimeksi' : 'Otan hoitaakseni'}"><i class="bi ${s.status === 'in_progress' ? 'bi-arrow-counterclockwise' : 'bi-hand-index-thumb'}"></i></button>
                <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--teal);" onclick="completeShopItem(${s.id})" title="Merkitse ostetuksi" aria-label="Merkitse ostetuksi"><i class="bi bi-check2-square"></i></button>
                ${isAdmin || own ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="openShoppingModal(${s.id})" title="Muokkaa" aria-label="Muokkaa"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${s.id}, 'shopping')" title="Poista" aria-label="Poista"><i class="bi bi-trash"></i></button>` : ''}
            </div></div>`;
    }).join('') + `</div>`;
    return html;
}

function dashLogs() {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 3); cutoff.setHours(0, 0, 0, 0);
    const all = state.data.shift_logs || [];
    return { all, recent: all.filter(l => new Date(l.created_at.replace(' ', 'T')) >= cutoff) };
}
function renderLogBody(isAdmin) {
    const { all, recent } = dashLogs();
    const list = state.showFullLogHistory ? all : recent;
    let html = `<div style="display:flex; gap:8px; margin-bottom:12px;">
        <input id="new-log-msg" class="form-input" style="padding:10px; font-size:13px;" placeholder="Terveiset seuraavalle vuorolle..." onkeydown="if(event.key==='Enter')addShiftLog()">
        <button class="btn btn-primary" onclick="addShiftLog()" aria-label="Lähetä"><i class="bi bi-send"></i></button></div>`;
    if (!list.length) html += `<div class="tool-empty">Ei viestejä viimeisiltä päiviltä.</div>`;
    else html += `<div class="tool-list">` + list.map(l => {
        const d = new Date(l.created_at.replace(' ', 'T'));
        const when = `${d.getDate()}.${d.getMonth() + 1}. klo ${d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`;
        const own = l.user_id == state.user.id;
        return `<div class="tool-item" style="border-left-color:var(--accent);">
            <div style="min-width:0;"><div class="tool-meta" style="margin:0 0 2px;"><b>${esc(l.user_name)}</b> · ${when}</div><div class="tool-text" style="font-weight:500;">${esc(l.message)}</div>${l.image_path ? `<a href="${esc(l.image_path)}" target="_blank" rel="noopener"><img src="${esc(l.image_path)}" alt="Kuva" loading="lazy" style="max-width:160px; max-height:110px; border-radius:6px; margin-top:6px;"></a>` : ''}</div>
            ${isAdmin || own ? `<div class="tool-btns"><button class="btn btn-ghost btn-sm btn-icon" onclick="openShiftLogModal(${l.id})" title="Muokkaa" aria-label="Muokkaa"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${l.id}, 'shift_log')" title="Poista" aria-label="Poista"><i class="bi bi-trash"></i></button></div>` : ''}</div>`;
    }).join('') + `</div>`;
    html += state.showFullLogHistory
        ? `<button class="btn btn-ghost btn-sm" style="width:100%; margin-top:10px;" onclick="state.showFullLogHistory=false; render();">Näytä vain 3 edellistä päivää</button>`
        : (all.length > recent.length ? `<button class="btn btn-ghost btn-sm" style="width:100%; margin-top:10px;" onclick="state.showFullLogHistory=true; render();"><i class="bi bi-clock-history"></i> Näytä koko historia (${all.length})</button>` : '');
    return html;
}

function renderDashTools(today, isAdmin) {
    const tasks = state.data.tasks || [];
    const doneN = tasks.filter(t => (state.data.task_completions || []).some(tc => tc.task_id == t.id && tc.date === today)).length;
    const shopN = (state.data.shopping_list || []).length;
    const logN = dashLogs().recent.length;
    const tabs = [
        { id: 'routines', label: 'Rutiinit',   icon: 'bi-check2-square', badge: tasks.length ? `${doneN}/${tasks.length}` : '', warn: tasks.length > 0 && doneN < tasks.length },
        { id: 'shop',     label: 'Puutelista', icon: 'bi-cart3',         badge: shopN || '',                                    warn: shopN > 0 },
        { id: 'log',      label: 'Vuorokirja', icon: 'bi-journal-text',  badge: logN || '',                                     warn: false }
    ];
    let saved = null; try { saved = localStorage.getItem('barshift_dash_tool'); } catch (e) {}
    const auto = tasks.length && doneN < tasks.length ? 'routines' : (shopN ? 'shop' : (tasks.length ? 'routines' : 'log'));
    const cur = tabs.find(t => t.id === (state.dashTool || saved)) || tabs.find(t => t.id === auto);
    const body = cur.id === 'routines' ? renderRoutinesBody(today) : cur.id === 'shop' ? renderShopBody(isAdmin) : renderLogBody(isAdmin);
    return `<div class="card card-sm tools-card">
        <div class="admin-tabs tools-tabs" role="tablist" aria-label="Työkalut">${tabs.map(t =>
            `<button class="admin-tab ${t.id === cur.id ? 'active' : ''}" role="tab" aria-selected="${t.id === cur.id}" onclick="setDashTool('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span>${t.badge !== '' ? `<span class="admin-tab-count ${t.warn ? 'warn' : ''}">${t.badge}</span>` : ''}</button>`).join('')}</div>
        <div role="tabpanel">${body}</div>
    </div>`;
}

function renderNotices() {
    const list = state.data.notices || [];
    if (!list.length) return '';
    const more = list.slice(1), showAll = !!state.showAllNoticesHome;
    return `<div class="notice-card" style="flex-direction:column; align-items:stretch; gap:8px;">
        <div style="display:flex; gap:14px; align-items:flex-start;">
            <i class="bi bi-megaphone-fill" style="font-size:24px; color:var(--accent);"></i>
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:14px; margin-bottom:2px;">Ilmoitustaulu</div>
                <div style="font-size:14px; color:var(--text2);">${esc(list[0].message)}</div>
            </div>
        </div>
        ${more.length ? `<button class="btn btn-ghost btn-sm" style="align-self:flex-start;" onclick="state.showAllNoticesHome=${!showAll}; render();">${showAll ? 'Piilota aiemmat' : `+ ${more.length} aiempaa ilmoitusta`}</button>` : ''}
        ${showAll ? more.map(n => `<div style="font-size:13px; color:var(--text2); padding:8px 0 0 38px; border-top:1px solid var(--border);">${esc(n.message)}</div>`).join('') : ''}
    </div>`;
}

function renderDashboard() {
    const today = getLocalDateString();
    const isAdmin = state.user.role === 'admin';
    const clockedIn = state.data.time_entries.filter(t => !t.clock_out || t.clock_out === '0000-00-00 00:00:00' || t.clock_out === 'null');
    const myNext = state.data.shifts.filter(s => s.userId == state.user.id && s.date >= today).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const nextShift = myNext[0] || null;

    let html = `<div class="page-header"><div class="page-title">Hei, ${esc(state.user.name.split(' ')[0])} 👋</div></div>`;
    html += renderNotices();
    html += renderClockWidget();

    html += `<div class="dash-grid">
        <div class="dash-col">
            <div class="dash-h"><i class="bi bi-bell"></i> Huomio</div>
            ${renderAttention(today, isAdmin)}
        </div>
        <div class="dash-col">
            <div class="dash-h"><i class="bi bi-tools"></i> Työkalut</div>
            ${renderDashTools(today, isAdmin)}
        </div>
    </div>`;

    html += `<div class="stat-row" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-top: 24px;">`;
    html += `<div class="card card-sm" style="margin-bottom:0;">
        <div style="font-size:12px; color:var(--text3); font-weight:700; margin-bottom:12px; text-transform:uppercase;"><i class="bi bi-calendar-event"></i> Seuraava vuorosi</div>
        ${nextShift ? `
            <div style="font-size:18px; font-weight:800;">${formatDate(nextShift.date)}</div>
            <div style="color:var(--teal); font-weight:700; margin-top:4px; font-size:16px;">klo ${nextShift.start.substring(0,5)} - ${nextShift.end.substring(0,5)}</div>
            <div style="font-size:14px; color:var(--text2); margin-top:6px;">${getRoleIcon(nextShift.role)} ${esc(nextShift.role)}</div>
        ` : `<div style="color:var(--text3); font-size:14px; margin-top:8px;">Ei tulevia vuoroja.</div>`}
    </div>`;
    html += `<div class="card card-sm" style="margin-bottom:0;">
        <div style="font-size:12px; color:var(--text3); font-weight:700; margin-bottom:12px; text-transform:uppercase;"><i class="bi bi-people"></i> Töissä juuri nyt</div>
        ${clockedIn.length > 0 ? clockedIn.map(t => {
            const u = state.data.users.find(x => x.id == t.user_id);
            return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <div style="width:10px; height:10px; background:#10B981; border-radius:50%; box-shadow: 0 0 6px #10B981;"></div>
                <span style="font-weight:600; font-size:15px;">${esc(u ? u.name : 'Tuntematon')}</span>
            </div>`;
        }).join('') : `<div style="color:var(--text3); font-size:14px; margin-top:8px;">Ei ketään vuorossa.</div>`}
    </div>`;
    const wage = dashWageCard(today, isAdmin);
    if (wage) html += wage;
    html += `</div>`;
    return html;
}

// ===================== OMA PROFIILI & LIVE KALENTERI & TYÖTUNNIT =====================
function renderProfile() {
    const u = state.data.users.find(x => x.id == state.user.id) || state.user;
    const icalUrl = u.ical_token ? (window.location.origin + window.location.pathname.replace(/[^\/]*$/, '') + 'api.php?action=ical&token=' + u.ical_token) : null;

    const myEntriesAll = (state.data.time_entries || [])
        .filter(t => t.user_id == state.user.id && t.clock_out && t.clock_out !== '0000-00-00 00:00:00' && t.clock_out !== 'null')
        .sort((a,b) => a.clock_in < b.clock_in ? 1 : -1);
        
    const myEntries = myEntriesAll.slice(0, state.timeEntriesLimit);

    const secInfo = `
    <div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title">Päivitä tietojasi</span><div class="section-line"></div></div>
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Nimi</label>
            <input class="form-input" value="${esc(u.name)}" disabled style="opacity:0.6;">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Puhelinnumero</label>
            <input id="p-phone" class="form-input" value="${esc(u.phone || '')}">
        </div>
        <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Sähköposti</label>
            <input id="p-email" type="email" class="form-input" maxlength="150" value="${esc(u.email || '')}" placeholder="nimi@example.fi">
            <label style="display:flex; gap:8px; align-items:center; margin-top:8px; font-size:13px; color:var(--text2);"><input id="p-notify" type="checkbox" ${u.notify_email != 0 ? 'checked' : ''}> Lähetä ilmoitukset sähköpostina, jos push-ilmoitukset eivät ole käytössä</label>
            ${pubFeature('hub_feed') ? `<label style="display:flex; gap:8px; align-items:center; margin-top:8px; font-size:13px; color:var(--text2);"><input id="p-notifygigs" type="checkbox" ${u.notify_gigs == 1 ? 'checked' : ''}> Ilmoita, kun muissa baareissa on vapaita vuoroja</label>` : ''}
        </div>
        <div class="form-group" style="margin-bottom:24px;">
            <label class="form-label">Vaihda salasana (jätä tyhjäksi jos et halua vaihtaa)</label>
            <input id="p-pass" type="password" class="form-input" placeholder="Uusi salasana">
        </div>
        <button class="btn btn-primary" onclick="saveProfile()"><i class="bi bi-save"></i> Tallenna muutokset</button>
    </div>`;
    const secLeave = `
    <div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title">Vuosiloma</span><div class="section-line"></div></div>
        ${renderLeaveBlock(state.user.id, {})}
    </div>`;
    const iosBrowser = /iPhone|iPad/i.test(navigator.userAgent) && !bsIsStandalone();
    const installCard = bsIsStandalone() ? '' : `<div id="install-box" class="card card-sm" style="max-width: 600px; margin-bottom: 24px;${(bsInstallEvt || iosBrowser) ? '' : ' display:none;'}">
        <div class="section-header"><span class="section-title"><i class="bi bi-phone"></i> Asenna sovellus</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Asennettuna BarShift avautuu omassa ikkunassaan, vuorolista on luettavissa ilman verkkoa ja ilmoitukset toimivat myös iPhonella.</p>
        ${iosBrowser ? '<p style="font-size:13px; margin:0;">iPhone: paina Safarissa <b>Jaa</b> → <b>Lisää Koti-valikkoon</b>, avaa sovellus kuvakkeesta ja salli ilmoitukset tässä profiilissa.</p>' : '<button class="btn btn-primary btn-sm" onclick="bsInstallApp()"><i class="bi bi-download"></i> Asenna sovellus</button>'}
    </div>`;
    const secNotif = installCard + `
    <div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title">Ilmoitukset</span><div class="section-line"></div></div>
        <div id="push-status" style="font-size:13px; color:var(--text2); margin-bottom:8px;">${pushStatusText()}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-ghost" onclick="subscribeToPush()" style="flex:1; justify-content: center;">
                <i class="bi bi-bell-fill" style="color: var(--accent);"></i> Salli ilmoitukset tähän laitteeseen
            </button>
            <button class="btn btn-ghost" onclick="sendTestPush()" title="Lähetä testi-ilmoitus itsellesi"><i class="bi bi-send"></i> Testi</button>
        </div>

        <div class="section-header" style="margin-top: 28px;"><span class="section-title">Kalenterisynkronointi</span><div class="section-line"></div></div>
        ${icalUrl ? `
            <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Tilaa vuorosi puhelimen tai tietokoneen kalenteriin. Kalenteri päivittyy itsestään (yleensä muutamassa tunnissa), kun vuorot muuttuvat.</p>
            <div class="form-row" style="margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                <label class="abs-choice" style="margin:0;"><input id="cal-ev" type="checkbox" onchange="updateIcalLink()"><span>Baarin tapahtumat</span></label>
                <label class="abs-choice" style="margin:0;"><input id="cal-abs" type="checkbox" onchange="updateIcalLink()"><span>Omat poissaolot</span></label>
                <select id="cal-alarm" class="form-input" style="width:auto; padding:6px 10px;" onchange="updateIcalLink()" aria-label="Muistutus"><option value="0">Ei muistutusta</option><option value="60">Muistutus 1 h ennen</option><option value="120">2 h ennen</option><option value="1440">Edellisenä päivänä</option></select>
            </div>
            <div class="form-group">
                <label class="form-label">Henkilökohtainen kalenterilinkkisi (älä jaa muille)</label>
                <div style="display:flex; gap:8px;">
                    <input class="form-input" value="${icalUrl}" readonly id="ical-url-input" data-base="${icalUrl}">
                    <button class="btn btn-ghost" onclick="copyIcal()" aria-label="Kopioi"><i class="bi bi-copy"></i></button>
                </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                <button class="btn btn-primary btn-sm" onclick="calGoogle()"><i class="bi bi-google"></i> Lisää Google-kalenteriin</button>
                <button class="btn btn-ghost btn-sm" onclick="calWebcal()"><i class="bi bi-apple"></i> Apple / Outlook</button>
                <button class="btn btn-ghost btn-sm" onclick="generateIcalToken()" title="Vanha linkki lakkaa toimimasta"><i class="bi bi-arrow-repeat"></i> Uusi linkki</button>
            </div>
            <small style="color:var(--text3);">Kalenterisyöte on vain luku: kalenterissa tekemäsi muutokset eivät siirry takaisin BarShiftiin. Jos linkki vuotaa, luo uusi linkki.</small>
        ` : `
            <button class="btn btn-ghost" onclick="generateIcalToken()" style="width: 100%; justify-content: center;">
                <i class="bi bi-calendar-plus"></i> Luo kalenterilinkki
            </button>
        `}
    </div>`;

    // ===================== KAKSIVAIHEINEN TUNNISTAUTUMINEN =====================
    let html = renderTwoFactorCard(u);

    // ===================== TIETOSUOJA =====================
    html += `<div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-shield-check"></i> Tietosuoja</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Sinulla on oikeus saada kopio kaikista sinusta tallennetuista tiedoista. Tietojen poistamista pyydät baarin ylläpitäjältä.</p>
        <a class="btn btn-ghost btn-sm" href="api.php?action=export_my_data"><i class="bi bi-download"></i> Lataa omat tietoni (JSON)</a>
        <a class="btn btn-ghost btn-sm" href="tietosuoseloste.html" target="_blank" rel="noopener" style="margin-left:6px;"><i class="bi bi-file-earmark-text"></i> Tietosuojaseloste</a>
    </div>`;

    html += `<div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-laptop"></i> Kirjautumiset ja laitteet</span><div class="section-line"></div></div>
        <div id="sess-list"><small style="color:var(--text3);">Ladataan…</small></div>
    </div>`;
    setTimeout(loadSessions, 0);

    const secSecurity = html; html = '';

    // ===================== LEIMATUT TYÖTUNNIT (SIVUTUS + MUOKKAUS) =====================
    html += `<div class="card card-sm" style="max-width: 600px; padding: 0;">
        <div style="padding: 20px 20px 10px 20px;">
            <div class="section-header" style="margin:0;"><span class="section-title"><i class="bi bi-clock-history"></i> Leimatut työtunnit</span><div class="section-line"></div></div>
        </div>
        <div style="max-height: 450px; overflow-y: auto;">`;
            
    if (myEntries.length > 0) {
        html += `<table class="bs-table">
            <thead>
                <tr>
                    <th>Päivä</th>
                    <th>Sisään</th>
                    <th>Ulos</th>
                    <th style="text-align:right;">Yhteensä</th>
                </tr>
            </thead>
            <tbody>
            ${myEntries.map(t => {
                const inDate = new Date(t.clock_in.replace(' ', 'T'));
                const outDate = new Date(t.clock_out.replace(' ', 'T'));
                const diffHours = ((outDate - inDate) / (1000 * 60 * 60)).toFixed(2);
                const timeOpts = { hour: '2-digit', minute: '2-digit' };
                
                return `<tr>
                    <td><strong>${formatDate(t.clock_in.split(' ')[0])}</strong></td>
                    <td><span class="badge badge-teal">${inDate.toLocaleTimeString('fi-FI', timeOpts)}</span></td>
                    <td><span class="badge" style="background:var(--surface2); border:1px solid var(--border);">${outDate.toLocaleTimeString('fi-FI', timeOpts)}</span></td>
                    <td style="text-align:right;">
                        <div style="font-weight:700;">${diffHours} h</div>
                        <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
                            <button class="btn btn-ghost btn-sm btn-icon" style="height:24px; width:24px; padding:2px;" onclick="openTimeEntryModal(${t.id})" title="Muokkaa"><i class="bi bi-pencil" style="font-size:11px;"></i></button>
                            <button class="btn btn-danger btn-sm btn-icon" style="height:24px; width:24px; padding:2px;" onclick="deleteItem(${t.id}, 'time_entry')" title="Poista"><i class="bi bi-trash" style="font-size:11px;"></i></button>
                        </div>
                    </td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>`;
        
        if (myEntriesAll.length > state.timeEntriesLimit) {
            html += `<div style="text-align:center; padding: 16px;"><button class="btn btn-ghost btn-sm" onclick="state.timeEntriesLimit += 10; render()">Näytä 10 vanhempaa merkintää</button></div>`;
        }
    } else {
        html += `<div style="padding: 20px; font-size:14px; color:var(--text3); text-align:center;">Ei vielä tehtyjä leimauksia.</div>`;
    }
    
    html += `</div></div>`;
    const secHours = renderHourBank(true) + html;

    let saved = null; try { saved = localStorage.getItem('barshift_profile_tab'); } catch (e) {}
    const tabs = [
        { id: 'info', label: 'Tiedot', icon: 'bi-person', html: secInfo },
        { id: 'leave', label: 'Vuosiloma', icon: 'bi-airplane', html: secLeave },
        { id: 'avail', label: 'Saatavuus', icon: 'bi-calendar-x', html: renderAvailabilityRules() },
        { id: 'notif', label: 'Ilmoitukset', icon: 'bi-bell', html: secNotif },
        { id: 'security', label: 'Turvallisuus', icon: 'bi-shield-lock', html: secSecurity },
        { id: 'hours', label: 'Työtunnit', icon: 'bi-clock-history', html: secHours }
    ];
    const cur = tabs.find(t => t.id === (state.profileTab || saved)) || tabs[0];
    return `<div class="page-header"><div class="page-title">Oma Profiili</div></div>
        <div class="admin-tabs" role="tablist" aria-label="Profiilin osiot">${tabs.map(t => `<button class="admin-tab ${t.id === cur.id ? 'active' : ''}" role="tab" aria-selected="${t.id === cur.id}" onclick="setProfileTab('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span></button>`).join('')}</div>
        <div role="tabpanel">${cur.html}</div>`;
}
function setProfileTab(id) {
    state.profileTab = id;
    try { localStorage.setItem('barshift_profile_tab', id); } catch (e) {}
    render();
}

async function saveProfile() {
    const phone = document.getElementById('p-phone').value;
    const new_password = document.getElementById('p-pass').value;
    const email = document.getElementById('p-email').value.trim(), notify_email = document.getElementById('p-notify').checked ? 1 : 0, notify_gigs = document.getElementById('p-notifygigs') ? (document.getElementById('p-notifygigs').checked ? 1 : 0) : undefined;
    const pr = await (await fetch('api.php?action=update_profile', { method: 'POST', body: JSON.stringify({ phone, new_password, email, notify_email, notify_gigs }) })).json();
    if (pr.error) return showToast(pr.error, 'error');
    showToast('Profiili päivitetty!'); document.getElementById('p-pass').value = ''; load();
}

async function generateIcalToken() {
    if (document.getElementById('ical-url-input') && !confirm('Luodaanko uusi linkki? Vanha linkki lakkaa toimimasta, ja kalenteritilaus pitää tehdä uudelleen.')) return;
    await fetch('api.php?action=generate_ical', { method: 'POST', body: JSON.stringify({ userId: state.user.id }) });
    showToast('Kalenterilinkki luotu!'); load();
}

function copyIcal() {
    const input = document.getElementById('ical-url-input');
    input.select(); document.execCommand('copy');
    showToast('Linkki kopioitu!');
}

// ===================== CLOCK IN/OUT CARD =====================
function renderClockWidget() {
    const myOpenEntry = state.data.time_entries.find(t => t.user_id == state.user.id && (!t.clock_out || t.clock_out === '0000-00-00 00:00:00' || t.clock_out === 'null'));
    
    if (myOpenEntry) {
        const start = new Date(myOpenEntry.clock_in.replace(' ', 'T'));
        return `
        <div class="card card-sm" style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid #E11D48; background: rgba(225, 29, 72, 0.05); padding: 12px 16px;">
            <div>
                <div style="font-weight:700; color:#E11D48;">Työvuoro käynnissä</div>
                <div style="font-size:12px; color:var(--text2);">Sisäänleimaus klo ${start.toLocaleTimeString('fi-FI', {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
            <button class="btn btn-danger" onclick="clockOut()"><i class="bi bi-stop-circle"></i> Lopeta vuoro</button>
        </div>`;
    } else {
        return `
        <div class="card card-sm" style="display:flex; justify-content:space-between; align-items:center; border-left:4px solid var(--teal); background: rgba(13, 148, 136, 0.05); padding: 12px 16px;">
            <div>
                <div style="font-weight:700; color:var(--teal);">Et ole vuorossa</div>
                <div style="font-size:12px; color:var(--text2);">Leimaa itsesi sisään kun aloitat työt!</div>
            </div>
            <button class="btn btn-primary" style="background:var(--teal);" onclick="clockIn()"><i class="bi bi-play-circle"></i> Aloita vuoro</button>
        </div>`;
    }
}

async function clockIn() {
    await fetch('api.php?action=clock_in', { method:'POST', body: JSON.stringify({ userId: state.user.id}) });
    showToast('Leimattu sisään!'); load();
}
async function clockOut() {
    if(!confirm("Päätetäänkö työvuoro?")) return;
    await fetch('api.php?action=clock_out', { method:'POST', body: JSON.stringify({ userId: state.user.id }) });
    showToast('Leimattu ulos!'); load();
}




// ===================== TRADE ALERTS =====================
function renderTradeAlerts() {
    if (!state.data.trades && !state.data.shifts) return '';
    const openTrades = !can('trades.use') ? [] : (state.data.trades||[]).filter(t => t.status === 'open' && t.offered_by_id != state.user.id && (!t.target_user_id || t.target_user_id == state.user.id));
    const myPendingTrades = (state.data.trades||[]).filter(t => t.status === 'pending' && t.offered_by_id == state.user.id);
    const myOpenTrades = (state.data.trades||[]).filter(t => t.status === 'open' && t.offered_by_id == state.user.id);

    let html = '';
    myPendingTrades.forEach(t => {
        const shift = state.data.shifts.find(s => s.id == t.offered_shift_id); const req = state.data.users.find(u => u.id == t.requested_by_id);
        if (shift && req) { html += `<div class="card card-sm" style="border-left:4px solid var(--teal); margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:center;"><div><b>${esc(req.name)}</b> haluaa vuorosi: ${formatDate(shift.date)} klo ${shift.start.substring(0,5)}${(() => { const sw = t.swap_shift_id && state.data.shifts.find(s => s.id == t.swap_shift_id); return sw ? `<br>⇄ ja tarjoaa tilalle vuoronsa: <b>${formatDate(sw.date)}</b> ${sw.start.substring(0,5)}–${sw.end.substring(0,5)}` : ''; })()}${tradeWarnHtml(t.warnings)}${tradeWarnHtml(t.swap_warnings)}</div><div style="display:flex; gap:5px;"><button class="pill active" onclick="handleTrade(${t.id},'accepted')">Hyväksy</button><button class="pill" style="background:#E11D48; color:white; border-color:#E11D48;" onclick="handleTrade(${t.id},'rejected')">Hylkää</button></div></div></div>`; }
    });
    myOpenTrades.forEach(t => {
        const shift = state.data.shifts.find(s => s.id == t.offered_shift_id);
        if (shift) { html += `<div class="card card-sm" style="border-left:4px solid var(--accent2); margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:center;"><div>⏳ <b>Oma vuoro odottaa ottajaa:</b> ${formatDate(shift.date)} klo ${shift.start.substring(0,5)}</div><button class="pill" onclick="cancelTrade(${t.id})" style="border-color:#E11D48; color:#E11D48;">Peruuta</button></div></div>`; }
    });
    openTrades.forEach(t => {
        const shift = state.data.shifts.find(s => s.id == t.offered_shift_id); const off = state.data.users.find(u => u.id == t.offered_by_id);
        if (shift && off) { 
            html += `<div class="card card-sm" style="border-left:4px solid var(--accent); margin-bottom:12px;"><div style="display:flex; justify-content:space-between; align-items:center;"><div>🔥 <b>Vuoro tarjolla${t.target_user_id ? ' sinulle' : ''}:</b> ${esc(off.name)} | ${formatDate(shift.date)} klo ${shift.start.substring(0,5)}${tradeWarnHtml(t.my_warnings)}</div><button class="pill active" style="background:var(--accent2); border-color:var(--accent2);" onclick="requestTrade(${t.id})">Ota vuoro</button></div></div>`; 
        }
    });
    return html;
}

// ===================== KAKSIVAIHEINEN TUNNISTAUTUMINEN (TOTP) =====================
function renderTwoFactorCard(u) {
    const on = u.totp_enabled == 1, setup = state.totpSetup;
    let inner;
    if (on) {
        inner = `<p style="font-size:13px; color:var(--text2); margin:0 0 12px;"><i class="bi bi-shield-check" style="color:#0D9488;"></i> Käytössä. Kirjautuessa tarvitaan salasanan lisäksi todennussovelluksen koodi.</p>
            <button class="btn btn-ghost btn-sm" onclick="openDisableTotp()"><i class="bi bi-shield-x"></i> Poista käytöstä</button>`;
    } else if (setup) {
        inner = `<p style="font-size:13px; color:var(--text2); margin:0 0 10px;">1. Avaa todennussovellus (esim. Google Authenticator, Microsoft Authenticator, Aegis, 1Password) ja lisää uusi tili <b>syöttämällä avain käsin</b>${/Android|iPhone|iPad/i.test(navigator.userAgent) ? ` tai <a href="${esc(setup.uri)}">avaa suoraan sovelluksessa</a>` : ''}.</p>
            <div class="login-id" style="background:var(--surface2); border-radius:8px; padding:10px; font-family:monospace; font-size:15px; letter-spacing:1px; word-break:break-all; margin-bottom:10px;">${esc(setup.secret)}</div>
            <p style="font-size:13px; color:var(--text2); margin:0 0 8px;">2. Kirjoita sovelluksen näyttämä 6-numeroinen koodi:</p>
            <div style="display:flex; gap:8px; flex-wrap:wrap;"><input id="totp-code" class="form-input" style="max-width:160px; text-align:center; letter-spacing:3px;" inputmode="numeric" maxlength="7" placeholder="123456" onkeydown="if(event.key==='Enter')enableTotp()">
            <button class="btn btn-primary" onclick="enableTotp()">Ota käyttöön</button><button class="btn btn-ghost" onclick="state.totpSetup=null; render()">Peruuta</button></div>`;
    } else {
        inner = `<p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Suojaa tunnuksesi lisäkoodilla, joka luodaan puhelimen todennussovelluksessa. ${u.role === 'admin' ? '<b>Suositeltu ylläpitäjille.</b>' : ''}</p>
            <button class="btn btn-primary btn-sm" onclick="beginTotp()"><i class="bi bi-shield-lock"></i> Ota käyttöön</button>`;
    }
    const codes = state.recoveryCodes ? `<div class="warn-box" style="margin-top:12px;"><b><i class="bi bi-exclamation-triangle"></i> Tallenna palautuskoodit nyt</b><br>Ne näytetään vain kerran. Jokaisen voi käyttää kerran, jos puhelin katoaa.
        <div style="font-family:monospace; font-size:15px; line-height:1.8; margin:8px 0;">${state.recoveryCodes.map(c => esc(c)).join('<br>')}</div>
        <button class="btn btn-ghost btn-sm" onclick="state.recoveryCodes=null; render()">Olen tallentanut ne</button></div>` : '';
    return `<div class="card card-sm" style="max-width: 600px; margin-bottom: 24px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-shield-lock"></i> Kaksivaiheinen tunnistautuminen</span><div class="section-line"></div></div>${inner}${codes}</div>`;
}
function deviceName(ua) {
    ua = ua || '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Selain';
    const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return br + (os ? ' / ' + os : '');
}
async function loadSessions() {
    const box = document.getElementById('sess-list'); if (!box) return;
    try {
        const r = await (await fetch('api.php?action=my_sessions', { method: 'POST', body: '{}' })).json();
        if (r.error) { box.textContent = r.error; return; }
        const active = r.filter(x => !x.revoked);
        box.innerHTML = `<p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Näet viimeisimmät kirjautumisesi. Jos tunnistamaton laite ilmestyy listaan, kirjaa se ulos ja vaihda salasana.</p>` +
            r.map(x => `<div style="display:flex; justify-content:space-between; gap:8px; align-items:center; padding:8px 0; border-top:1px solid var(--border); ${x.revoked ? 'opacity:.55;' : ''}">
                <div style="font-size:13px;"><b>${esc(deviceName(x.user_agent))}</b> ${x.current ? '<span class="badge">tämä laite</span>' : ''} ${x.revoked ? '<small>(kirjattu ulos)</small>' : ''}<br>
                <small style="color:var(--text3);">${esc(x.ip || '')} · kirjauduttu ${esc(String(x.created_at).slice(0, 16))} · viimeksi ${esc(String(x.last_seen).slice(0, 16))}</small></div>
                ${(!x.revoked && !x.current) ? `<button class="btn btn-ghost btn-sm" onclick="revokeSession(${x.id})">Kirjaa ulos</button>` : ''}</div>`).join('') +
            (active.filter(x => !x.current).length ? `<button class="btn btn-danger btn-sm" style="margin-top:10px;" onclick="revokeSession(0)"><i class="bi bi-box-arrow-right"></i> Kirjaa ulos kaikista muista laitteista</button>` : '');
    } catch (e) { box.textContent = 'Lataus epäonnistui'; }
}
async function revokeSession(id) {
    const r = await (await fetch('api.php?action=' + (id ? 'revoke_session' : 'revoke_other_sessions'), { method: 'POST', body: JSON.stringify({ id }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Kirjattu ulos'); loadSessions();
}
async function beginTotp() {
    const r = await (await fetch('api.php?action=totp_begin', { method: 'POST', body: '{}' })).json();
    if (r.error) return showToast(r.error, 'error');
    state.totpSetup = r; render();
}
async function enableTotp() {
    const code = document.getElementById('totp-code').value.trim();
    const r = await (await fetch('api.php?action=totp_enable', { method: 'POST', body: JSON.stringify({ code }) })).json();
    if (r.error) return showToast(r.error, 'error');
    const forced = state.need2fa;
    state.totpSetup = null; state.recoveryCodes = forced ? null : r.recovery_codes;
    if (state.user) state.user.totp_enabled = 1;
    showToast('Kaksivaiheinen tunnistautuminen käytössä'); await load();
    if (forced) openModal('Tallenna palautuskoodit', 'bi-key', `<p style="font-size:13px; color:var(--text2);">Koodit näytetään vain kerran. Jokaisen voi käyttää kerran, jos puhelin katoaa.</p><div style="font-family:monospace; font-size:16px; line-height:1.9; background:var(--surface2); padding:12px; border-radius:8px;">${r.recovery_codes.map(c => esc(c)).join('<br>')}</div>`, `<button class="btn btn-primary" onclick="closeModal()">Olen tallentanut ne</button>`);
}
function openDisableTotp() {
    openModal('Poista kaksivaiheinen tunnistautuminen', 'bi-shield-x', `<div class="form-group" style="margin-bottom:12px;"><label class="form-label">Salasana</label><input id="td-pass" type="password" class="form-input" autocomplete="current-password"></div>
        <div class="form-group"><label class="form-label">Koodi (todennussovellus tai palautuskoodi)</label><input id="td-code" class="form-input" autocomplete="one-time-code"></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-danger" onclick="disableTotp()">Poista käytöstä</button>`);
}
async function disableTotp() {
    const r = await (await fetch('api.php?action=totp_disable', { method: 'POST', body: JSON.stringify({ password: document.getElementById('td-pass').value, code: document.getElementById('td-code').value }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Kaksivaiheinen tunnistautuminen poistettu'); load();
}

// ===================== PUSH-ILMOITUKSET =====================
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function pushStatusText() {
    if (!pushSupported()) return 'Tämä selain ei tue push-ilmoituksia' + (/iPhone|iPad/i.test(navigator.userAgent) ? ' (iPhonella lisää sovellus ensin Koti-valikkoon: Jaa → Lisää Koti-valikkoon).' : '.') + ' Ilmoitukset tulevat sähköpostina, jos olet tallentanut osoitteen.';
    if (Notification.permission === 'denied') return 'Ilmoitukset on estetty selaimen asetuksista. Salli ne sivuston asetuksista ja yritä uudelleen.';
    if (Notification.permission === 'granted') return 'Ilmoitukset sallittu tässä selaimessa. Voit lähettää testi-ilmoituksen.';
    return 'Saat ilmoitukset uusista vuoroista, viesteistä ja muistutuksista. Ilman pushia ne tulevat sähköpostina (jos osoite on tallennettu).';
}
function urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4), raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
async function subscribeToPush() {
    if (!pushSupported()) return showToast('Selain ei tue push-ilmoituksia', 'error');
    try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Lupaa ei annettu', 'error'); const el = document.getElementById('push-status'); if (el) el.textContent = pushStatusText(); return; }
        const reg = await navigator.serviceWorker.ready;
        const k = await (await fetch('api.php?action=push_key')).json();
        if (!k.key) return showToast('Palvelimen ilmoitusavain puuttuu', 'error');
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(k.key) });
        const r = await (await fetch('api.php?action=save_subscription', { method: 'POST', body: JSON.stringify({ sub: sub.toJSON() }) })).json();
        if (r.error) return showToast(r.error, 'error');
        showToast('Ilmoitukset otettu käyttöön!');
        const el = document.getElementById('push-status'); if (el) el.textContent = pushStatusText();
    } catch (e) { showToast('Ilmoitusten käyttöönotto epäonnistui: ' + (e.message || e), 'error'); }
}
async function sendTestPush() {
    const r = await (await fetch('api.php?action=test_push', { method: 'POST', body: '{}' })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast(r.delivered > 0 ? 'Testi-ilmoitus lähetetty' : 'Ei push-tilausta tällä käyttäjällä: ilmoitus lähti sähköpostina, jos osoite on tallennettu', r.delivered > 0 ? undefined : 'error');
}

// ---- Kalenterilinkin valinnat ----
function icalFullUrl() {
    const inp = document.getElementById('ical-url-input'); if (!inp) return '';
    const q = []; if (document.getElementById('cal-ev').checked) q.push('events=1'); if (document.getElementById('cal-abs').checked) q.push('absences=1');
    const a = document.getElementById('cal-alarm').value; if (a !== '0') q.push('alarm=' + a);
    return inp.dataset.base + (q.length ? '&' + q.join('&') : '');
}
function updateIcalLink() { const url = icalFullUrl(); if (url) document.getElementById('ical-url-input').value = url; }
function calWebcal() { location.href = icalFullUrl().replace(/^https?:\/\//, 'webcal://'); }
function calGoogle() { window.open('https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(icalFullUrl().replace(/^https?:\/\//, 'webcal://')), '_blank', 'noopener'); }
