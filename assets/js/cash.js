// ===================== KASSATILITYS + MYYNNIN VIIVAGRAAFI =====================
// Kassatilitys syötetään rutiinilistan "kassatilitys"-rutiinista (Hallinta → Rutiinit → tyyppi). Loppusumma päivittää myös päivämyynnin,
// josta Tilastot-sivun viivagraafi ja henkilöstökulu-%-ennuste lasketaan.
const cashEur = v => v === null || v === undefined || v === '' ? '–' : Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const cashDiff = v => v === null || v === undefined ? '–' : (v > 0 ? '+' : '') + Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
function cashDefaultDate() { const d = new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return localISO(d); }
function localISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function cashFind(date) { return (state.data.cash_recent || []).find(r => r.date === date) || (state.cashAdmin && (state.cashAdmin.reports || []).find(r => r.date === date)) || null; }

function openCashModal(date) {
    const admin = can('sales.view');
    date = date || cashDefaultDate();
    let dateInput;
    if (admin) dateInput = `<input id="cash-date" type="date" class="form-input" max="${localISO(new Date())}" value="${date}" onchange="cashFill()">`;
    else {
        const opts = []; for (let i = 0; i < 4; i++) { const d = new Date(); d.setDate(d.getDate() - i); const s = localISO(d); opts.push(`<option value="${s}" ${s === date ? 'selected' : ''}>${formatDate(s)}${i === 0 ? ' (tänään)' : ''}</option>`); }
        dateInput = `<select id="cash-date" class="form-input" onchange="cashFill()">${opts.join('')}</select>`;
    }
    const f = (id, label, hint) => `<div class="form-group"><label class="form-label">${label}</label><input id="${id}" type="number" inputmode="decimal" step="0.01" min="0" class="form-input" oninput="cashCalc()" placeholder="€"${hint ? ` title="${hint}"` : ''}></div>`;
    openModal('Kassatilitys', 'bi-cash-coin', `
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Syötä illan loppusumma. Korttimaksut, kassapohja ja laskettu käteinen ovat valinnaisia – niiden avulla näet täsmääkö kassa.</p>
        <div class="form-group"><label class="form-label">Päivä (vuoro, jonka tilitys tehdään)</label>${dateInput}</div>
        ${f('cash-sales', 'Päivän loppusumma / myynti yhteensä *')}
        <div class="form-row">${f('cash-card', 'Korttimaksut')}${f('cash-float', 'Kassapohja (aamun käteinen)')}</div>
        <div class="form-row">${f('cash-expenses', 'Kassasta maksetut (kulut)')}${f('cash-tips', 'Käteistipit kassassa')}</div>
        ${f('cash-counted', 'Kassassa laskettu käteinen')}
        <div id="cash-result" style="font-size:13px; margin:8px 0;"></div>
        <details style="font-size:12px; color:var(--text3); margin-bottom:8px;"><summary>Mitä "ero" tarkoittaa?</summary>Ero kertoo, täsmääkö kassan käteinen myyntiin. Odotettu käteinen = kassapohja + myynti − korttimaksut − kassasta maksetut kulut + kassaan jääneet käteistipit. Ero = laskettu käteinen − odotettu käteinen. 0 € = täsmää, miinus = kassasta puuttuu rahaa, plus = rahaa on liikaa.</details>
        <div class="form-group"><label class="form-label">Kuva (valinn., esim. kassaraportti tai laskettu kassa)</label>
            <input id="cash-photo" type="file" accept="image/*" capture="environment" class="form-input">
            <div id="cash-photo-cur" style="font-size:13px; margin-top:6px;"></div></div>
        <div class="form-group"><label class="form-label">Huomio (valinn.)</label><input id="cash-note" class="form-input" maxlength="500" placeholder="Esim. lahjakortti, tippi, kassaero selitys"></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>${admin ? '<button class="btn btn-danger" id="cash-del" style="display:none" onclick="deleteCashFromModal()"><i class="bi bi-trash"></i></button>' : ''}<button class="btn btn-primary" onclick="saveCashReport()"><i class="bi bi-check-lg"></i> Tallenna tilitys</button>`);
    cashFill();
}
function cashFill() {
    const date = document.getElementById('cash-date').value, r = cashFind(date);
    const set = (id, v) => { document.getElementById(id).value = v === null || v === undefined ? '' : v; };
    set('cash-sales', r ? r.sales_total : ''); set('cash-card', r ? r.card_total : ''); set('cash-float', r ? r.float_amount : ''); set('cash-counted', r ? r.counted_cash : ''); set('cash-expenses', r ? r.expenses : ''); set('cash-tips', r ? r.tips : ''); set('cash-note', r ? r.note : '');
    document.getElementById('cash-photo').value = '';
    document.getElementById('cash-photo-cur').innerHTML = r && r.has_photo ? `<a href="api.php?action=cash_photo&id=${r.id}" target="_blank" rel="noopener"><i class="bi bi-image"></i> Näytä tallennettu kuva</a> &nbsp; <label><input type="checkbox" id="cash-photo-rm"> poista kuva</label>` : '';
    const del = document.getElementById('cash-del'); if (del) { del.style.display = r ? '' : 'none'; del.dataset.id = r ? r.id : ''; }
    cashCalc();
}
function cashCalc() {
    const n = id => { const v = document.getElementById(id).value; return v === '' ? null : parseFloat(v); };
    const sales = n('cash-sales'), card = n('cash-card'), fl = n('cash-float'), counted = n('cash-counted'), exp = n('cash-expenses'), tips = n('cash-tips'), out = document.getElementById('cash-result');
    if (sales === null) { out.innerHTML = ''; return; }
    const expected = (fl || 0) + sales - (card || 0) - (exp || 0) + (tips || 0);
    let html = `Odotettu käteinen kassassa: <b>${cashEur(expected)}</b>`;
    if (counted !== null) { const d = Math.round((counted - expected) * 100) / 100; html += `<br>Ero: <b style="color:${d === 0 ? 'var(--teal)' : 'var(--red, #dc2626)'}">${cashDiff(d)}</b> ${d === 0 ? '✓ täsmää' : d > 0 ? '(ylijäämä)' : '(vajaus)'}`; }
    out.innerHTML = html;
}
async function saveCashReport() {
    const v = id => document.getElementById(id).value;
    const body = { date: v('cash-date'), sales_total: v('cash-sales'), card_total: v('cash-card'), float_amount: v('cash-float'), counted_cash: v('cash-counted'), expenses: v('cash-expenses'), tips: v('cash-tips'), note: v('cash-note') };
    if (body.sales_total === '') { showToast('Anna loppusumma'); return; }
    const fd = new FormData(); Object.keys(body).forEach(k => fd.append(k, body[k]));
    const file = document.getElementById('cash-photo').files[0]; if (file) fd.append('photo', file);
    if (document.getElementById('cash-photo-rm') && document.getElementById('cash-photo-rm').checked) fd.append('remove_photo', '1');
    const res = await fetch('api.php?action=cash_report', { method: 'POST', body: fd }), j = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(j.error || 'Tallennus epäonnistui'); return; }
    closeModal();
    showToast(j.difference === null || j.difference === undefined ? 'Kassatilitys tallennettu' : j.difference === 0 ? 'Kassatilitys tallennettu – kassa täsmää ✓' : 'Kassatilitys tallennettu – ero ' + cashDiff(j.difference));
    state.salesReport = null; state.cashAdmin = null; state.cashStatsData = null; state.forecast = null; load();
}
function deleteCashFromModal() { const id = document.getElementById('cash-del').dataset.id; closeModal(); deleteCashReport(id); }
async function deleteCashReport(id) {
    if (!confirm('Poistetaanko kassatilitys ja päivän myyntiluku?')) return;
    await fetch(`api.php?id=${id}&type=cash_report`, { method: 'DELETE' });
    showToast('Poistettu'); state.salesReport = null; state.cashAdmin = null; state.cashStatsData = null; state.forecast = null; load();
}

// ---------- Hallinta → Kassa ----------
async function loadCashAdmin(month) {
    const m = month || (state.cashAdmin && state.cashAdmin.month) || localISO(new Date()).slice(0, 7);
    const [y, mo] = m.split('-').map(Number), last = new Date(y, mo, 0).getDate();
    state.cashAdmin = { month: m, loading: true, reports: [] }; render();
    try { const r = await (await fetch(`api.php?action=cash_reports&from=${m}-01&to=${m}-${String(last).padStart(2, '0')}`)).json(); state.cashAdmin = { month: m, reports: r.reports || [] }; }
    catch (e) { state.cashAdmin = { month: m, reports: [], error: true }; }
    render();
}
function adminTabCash() {
    if (!state.cashAdmin) { loadCashAdmin(); return '<div class="tool-empty">Ladataan…</div>'; }
    const c = state.cashAdmin, rows = c.reports || [];
    const hasTask = (state.data.tasks || []).some(t => t.kind === 'cash');
    const [y, mo] = c.month.split('-').map(Number), last = String(new Date(y, mo, 0).getDate()).padStart(2, '0');
    const total = rows.reduce((a, r) => a + r.sales_total, 0), diffSum = rows.reduce((a, r) => a + (r.difference || 0), 0);
    return `<div class="card card-sm">
        <div class="section-header"><span class="section-title"><i class="bi bi-cash-coin"></i> Kassatilitykset</span><div class="section-line"></div></div>
        ${hasTask ? '' : '<div class="leave-box warn" style="margin-bottom:10px">Kassatilitysrutiinia ei ole vielä lisätty. Lisää Rutiinit-välilehdellä rutiini ja valitse tyypiksi "Kassatilitys", niin henkilökunta syöttää loppusumman rutiinilistasta.</div>'}
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
            <input type="month" class="form-input" style="max-width:170px" value="${c.month}" onchange="loadCashAdmin(this.value)">
            <button class="btn btn-primary btn-sm" onclick="openCashModal()"><i class="bi bi-plus-lg"></i> Lisää / korjaa tilitys</button>
            <a class="btn btn-ghost btn-sm" href="api.php?action=cash_reports&from=${c.month}-01&to=${c.month}-${last}&format=csv"><i class="bi bi-download"></i> CSV</a>
        </div>
        <div style="font-size:12px; color:var(--text3); margin-bottom:10px"><b>Ero</b> = laskettu käteinen − odotettu käteinen (kassapohja + myynti − kortit − kulut + tipit). 0 € = kassa täsmää, miinus = rahaa puuttuu, plus = rahaa on liikaa. Virheellisen tilityksen korjaat ✏-napista.</div>
        ${c.loading ? '<div class="tool-empty">Ladataan…</div>' : !rows.length ? '<div class="tool-empty">Ei tilityksiä tässä kuussa.</div>' : `
        <div style="overflow-x:auto"><table class="data-table" style="width:100%; font-size:13px; border-collapse:collapse;">
            <thead><tr style="text-align:left; color:var(--text3)"><th>Päivä</th><th>Myynti</th><th>Kortti</th><th>Odotettu käteinen</th><th>Laskettu</th><th title="Laskettu käteinen − (kassapohja + myynti − kortit − kulut + tipit). 0 = kassa täsmää">Ero <i class="bi bi-info-circle"></i></th><th>Kirjaaja</th><th></th></tr></thead>
            <tbody>${rows.map(r => `<tr style="border-top:1px solid var(--border)">
                <td>${formatDate(r.date)}</td><td><b>${cashEur(r.sales_total)}</b></td><td>${cashEur(r.card_total)}</td><td>${cashEur(r.expected_cash)}</td><td>${cashEur(r.counted_cash)}</td>
                <td style="font-weight:700; color:${r.difference === null ? 'inherit' : r.difference === 0 ? 'var(--teal)' : 'var(--red, #dc2626)'}">${cashDiff(r.difference)}</td>
                <td>${r.has_photo ? `<a href="api.php?action=cash_photo&id=${r.id}" target="_blank" rel="noopener" aria-label="Kuva"><i class="bi bi-image"></i></a> ` : ''}${esc(r.user_name || '')}${r.note ? `<br><small style="color:var(--text3)">${esc(r.note)}</small>` : ''}</td>
                <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm btn-icon" aria-label="Muokkaa" onclick="openCashModal('${r.date}')"><i class="bi bi-pencil"></i></button><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteCashReport(${r.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody>
            <tfoot><tr style="border-top:2px solid var(--border); font-weight:700"><td>Yhteensä</td><td>${cashEur(total)}</td><td colspan="2"></td><td></td><td>${cashDiff(Math.round(diffSum * 100) / 100)}</td><td colspan="2"></td></tr></tfoot>
        </table></div>`}
    </div>`;
}

// ---------- Tilastot: myynnin viivagraafi (viikko / kuukausi / vuosi) ----------
function salesRangeShift(dir) {
    const r = state.salesRange || 'week', d = new Date((state.salesAnchor || localISO(new Date())) + 'T12:00:00');
    if (r === 'week') d.setDate(d.getDate() + 7 * dir); else if (r === 'month') d.setMonth(d.getMonth() + dir, 1); else d.setFullYear(d.getFullYear() + dir, 0, 1);
    state.salesAnchor = localISO(d); state.salesReport = null; render();
}
function setSalesRange(r) { state.salesRange = r; state.salesAnchor = localISO(new Date()); state.salesReport = null; render(); }
async function loadSalesReport() {
    const key = (state.salesRange || 'week') + '|' + (state.salesAnchor || '');
    state.salesLoading = key;
    try { const r = await (await fetch(`api.php?action=sales_report&range=${state.salesRange || 'week'}&date=${state.salesAnchor || localISO(new Date())}`)).json(); if (state.salesLoading === key) state.salesReport = r.error ? { error: r.error } : r; }
    catch (e) { state.salesReport = { error: 'Lataus epäonnistui' }; }
    render();
}
function salesLineSvg(points, range) {
    const W = 640, H = 220, L = 46, R = 12, T = 12, B = 28, n = points.length;
    const vals = points.flatMap(p => [p.value, p.prev || 0]), max = Math.max(1, ...vals) * 1.1;
    const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = v => T + (H - T - B) * (1 - v / max);
    const path = (key, skipNull) => { let d = '', pen = false; points.forEach((p, i) => { const v = p[key]; if (v === null || v === undefined) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; }); return d; };
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = max * f, yy = y(v); return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--border)" stroke-width="1"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--text3)">${Math.round(v).toLocaleString('fi-FI')}</text>`; }).join('');
    const DOW = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
    const MON = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
    const step = range === 'month' ? 5 : 1;
    const xl = points.map((p, i) => {
        if (range === 'month' && i % step !== 0 && i !== n - 1) return '';
        const d = new Date(p.label.length === 7 ? p.label + '-01T12:00:00' : p.label + 'T12:00:00');
        const t = range === 'year' ? MON[d.getMonth()] : range === 'week' ? DOW[d.getDay()] + ' ' + d.getDate() + '.' : d.getDate() + '.';
        return `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text3)">${t}</text>`;
    }).join('');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="var(--accent)"><title>${p.label}: ${cashEur(p.value)}${p.prev !== null && p.prev !== undefined ? ' (edellinen ' + cashEur(p.prev) + ')' : ''}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; max-height:260px" role="img" aria-label="Myynnin kehitys">${grid}${xl}
        <path d="${path('prev')}" fill="none" stroke="var(--text3)" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>
        <path d="${path('value')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
}
function renderSalesCard() {
    const range = state.salesRange || 'week';
    if (!state.salesReport && state.salesLoading !== (range + '|' + (state.salesAnchor || ''))) loadSalesReport();
    const r = state.salesReport;
    const tab = (id, label) => `<button class="btn btn-sm ${range === id ? 'btn-primary' : 'btn-ghost'}" onclick="setSalesRange('${id}')">${label}</button>`;
    let body;
    if (!r) body = '<div class="tool-empty">Ladataan…</div>';
    else if (r.error) body = `<div class="leave-box warn">${esc(r.error)}</div>`;
    else {
        const ch = r.change_pct, chColor = ch === null ? 'var(--text3)' : ch >= 0 ? 'var(--teal)' : 'var(--red, #dc2626)';
        const title = range === 'year' ? r.from.slice(0, 4) : range === 'month' ? r.from.slice(0, 7).split('-').reverse().join('/') : formatDate(r.from) + ' – ' + formatDate(r.to);
        const kpi = (l, v, sub) => `<div style="flex:1; min-width:110px; background:var(--surface2); padding:8px 10px; border-radius:8px; border:1px solid var(--border)"><div style="font-size:11px; color:var(--text3)">${l}</div><div style="font-weight:700; font-size:15px">${v}</div>${sub ? `<div style="font-size:11px; color:var(--text3)">${sub}</div>` : ''}</div>`;
        body = `<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <button class="btn btn-ghost btn-sm btn-icon" aria-label="Edellinen" onclick="salesRangeShift(-1)"><i class="bi bi-chevron-left"></i></button>
                <b style="flex:1; text-align:center">${title}</b>
                <button class="btn btn-ghost btn-sm btn-icon" aria-label="Seuraava" onclick="salesRangeShift(1)"><i class="bi bi-chevron-right"></i></button></div>
            ${r.days_with_sales ? salesLineSvg(r.points, range) : '<div class="tool-empty">Ei myyntitietoja tältä jaksolta. Myynti kertyy kassatilityksistä.</div>'}
            <div style="font-size:11px; color:var(--text3); margin:4px 0 10px"><span style="color:var(--accent)">━</span> tämä jakso &nbsp; <span>┅</span> edellinen jakso</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${kpi('Myynti yhteensä', cashEur(r.total), ch === null ? 'ei vertailua' : `<span style="color:${chColor}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toLocaleString('fi-FI')} %</span> vs. edellinen (${cashEur(r.prev_total)})`)}
                ${kpi('Keskiarvo / päivä', cashEur(r.average), r.days_with_sales + ' myyntipäivää')}
                ${kpi(range === 'year' ? 'Paras kuukausi' : 'Paras päivä', r.best ? cashEur(r.best.value) : '–', r.best ? (range === 'year' ? r.best.date : formatDate(r.best.date)) : '')}
                ${kpi('Myynti / työtunti', r.sales_per_hour === null ? '–' : cashEur(r.sales_per_hour), Math.round(r.labour_hours) + ' h julkaistuja vuoroja')}
            </div>
            ${r.target ? (() => { const pct = Math.round(r.total / r.target * 100); return `<div style="margin-top:12px;"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>Tavoite ${cashEur(r.target)}</span><b style="color:${pct >= 100 ? 'var(--teal)' : 'inherit'}">${pct} %</b></div><div style="height:10px; background:var(--surface2); border-radius:6px; overflow:hidden; border:1px solid var(--border);"><div style="height:100%; width:${Math.min(100, pct)}%; background:${pct >= 100 ? 'var(--teal)' : 'var(--accent)'};"></div></div></div>`; })() : ''}`;
    }
    return `<div class="card card-sm no-print">
        <div class="section-header"><span class="section-title"><i class="bi bi-graph-up"></i> Myynnin kehitys</span><div class="section-line"></div></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">${tab('week', 'Viikko')}${tab('month', 'Kuukausi')}${tab('year', 'Vuosi')}<span style="flex:1"></span><button class="btn btn-ghost btn-sm" onclick="openCashModal()"><i class="bi bi-cash-coin"></i> Kassatilitys</button>${state.user.role === 'admin' ? '<button class="btn btn-ghost btn-sm" onclick="openFinanceModal()"><i class="bi bi-bullseye"></i> Tavoitteet</button>' : ''}</div>
        ${body}</div>`;
}

// ---------- Tilastot → Tilitykset: määrät ja summat päivä- ja viikkotasolla, selattavissa ----------
function cashStatsState() { if (!state.cashStats) state.cashStats = { mode: 'day', anchor: localISO(new Date()) }; return state.cashStats; }
function cashMonday(iso) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function cashStatsRange() {
    const c = cashStatsState(), a = new Date(c.anchor + 'T12:00:00');
    if (c.mode === 'day') { return { from: localISO(new Date(a.getFullYear(), a.getMonth(), 1)), to: localISO(new Date(a.getFullYear(), a.getMonth() + 1, 0)) }; }
    const end = cashMonday(c.anchor); end.setDate(end.getDate() + 6); const start = new Date(end); start.setDate(start.getDate() - 13 * 7 + 1);   // 13 viikkoa
    return { from: localISO(start), to: localISO(end) };
}
function setCashStatsMode(m) { cashStatsState().mode = m; state.cashStatsData = null; render(); }
function shiftCashStats(dir) {
    const c = cashStatsState(), a = new Date(c.anchor + 'T12:00:00');
    if (c.mode === 'day') a.setMonth(a.getMonth() + dir, 1); else a.setDate(a.getDate() + dir * 13 * 7);
    c.anchor = localISO(a); state.cashStatsData = null; render();
}
async function loadCashStats() {
    const { from, to } = cashStatsRange(), key = from + '|' + to;
    state.cashStatsLoading = key;
    try { const r = await (await fetch(`api.php?action=cash_reports&from=${from}&to=${to}`)).json(); if (state.cashStatsLoading === key) state.cashStatsData = { key, reports: r.reports || [], error: r.error }; }
    catch (e) { state.cashStatsData = { key, reports: [], error: 'Lataus epäonnistui' }; }
    render();
}
function cashWeekNo(iso) { return getWeekNumber(new Date(iso + 'T12:00:00')); }
function renderCashStats() {
    const c = cashStatsState(), { from, to } = cashStatsRange(), key = from + '|' + to;
    if ((!state.cashStatsData || state.cashStatsData.key !== key) && state.cashStatsLoading !== key) loadCashStats();
    const d = state.cashStatsData && state.cashStatsData.key === key ? state.cashStatsData : null;
    const mode = (id, label) => `<button class="btn btn-sm ${c.mode === id ? 'btn-primary' : 'btn-ghost'}" onclick="setCashStatsMode('${id}')">${label}</button>`;
    const MON = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
    const a = new Date(from + 'T12:00:00');
    const title = c.mode === 'day' ? MON[a.getMonth()] + ' ' + a.getFullYear() : 'vko ' + cashWeekNo(from) + ' – ' + cashWeekNo(to) + ' (' + formatDate(from) + ' – ' + formatDate(to) + ')';
    let body;
    if (!d) body = '<div class="tool-empty">Ladataan…</div>';
    else if (d.error) body = `<div class="leave-box warn">${esc(d.error)}</div>`;
    else {
        const rows = d.reports, sum = (list, k) => list.reduce((x, r) => x + (r[k] || 0), 0);
        const diffCell = v => `<td style="font-weight:700; color:${v === 0 ? 'var(--teal)' : 'var(--red, #dc2626)'}">${cashDiff(Math.round(v * 100) / 100)}</td>`;
        let table;
        if (c.mode === 'day') {
            const asc = rows.slice().sort((x, y) => x.date < y.date ? 1 : -1);
            table = asc.map(r => `<tr style="border-top:1px solid var(--border)"><td>${formatDate(r.date)} <small style="color:var(--text3)">vko ${cashWeekNo(r.date)}</small></td><td><b>${cashEur(r.sales_total)}</b></td><td>${cashEur(r.card_total)}</td><td>${cashEur(r.counted_cash)}</td>${r.difference === null ? '<td>–</td>' : diffCell(r.difference)}<td style="white-space:nowrap">${r.has_photo ? `<a href="api.php?action=cash_photo&id=${r.id}" target="_blank" rel="noopener" aria-label="Kuva"><i class="bi bi-image"></i></a> ` : ''}<button class="btn btn-ghost btn-sm btn-icon" aria-label="Korjaa" onclick="openCashModal('${r.date}')"><i class="bi bi-pencil"></i></button></td></tr>`).join('');
            table = `<thead><tr style="text-align:left; color:var(--text3)"><th>Päivä</th><th>Myynti</th><th>Kortti</th><th>Laskettu käteinen</th><th title="Laskettu käteinen − (kassapohja + myynti − kortit − kulut + tipit). 0 = kassa täsmää">Ero <i class="bi bi-info-circle"></i></th><th></th></tr></thead><tbody>${table}</tbody>
                <tfoot><tr style="border-top:2px solid var(--border); font-weight:700"><td>${rows.length} tilitystä</td><td>${cashEur(sum(rows, 'sales_total'))}</td><td>${cashEur(sum(rows, 'card_total'))}</td><td></td>${diffCell(sum(rows, 'difference'))}<td></td></tr></tfoot>`;
        } else {
            const weeks = {};
            for (let i = 0; i < 13; i++) { const m = cashMonday(from); m.setDate(m.getDate() + i * 7); weeks[localISO(m)] = []; }
            rows.forEach(r => { const k = localISO(cashMonday(r.date)); if (weeks[k]) weeks[k].push(r); });
            const keys = Object.keys(weeks).sort().reverse();
            table = keys.map(k => { const w = weeks[k], e = new Date(k + 'T12:00:00'); e.setDate(e.getDate() + 6); const tot = sum(w, 'sales_total');
                return `<tr style="border-top:1px solid var(--border)"><td><b>vko ${cashWeekNo(k)}</b> <small style="color:var(--text3)">${formatDate(k)} – ${formatDate(localISO(e))}</small></td><td>${w.length} / 7</td><td><b>${w.length ? cashEur(tot) : '–'}</b></td><td>${w.length ? cashEur(tot / w.length) : '–'}</td><td>${w.length ? cashEur(sum(w, 'card_total')) : '–'}</td>${w.length ? diffCell(sum(w, 'difference')) : '<td>–</td>'}<td>${w.filter(r => r.has_photo).length || ''}</td></tr>`; }).join('');
            table = `<thead><tr style="text-align:left; color:var(--text3)"><th>Viikko</th><th>Tilityksiä</th><th>Myynti</th><th>Keskim. / tilitys</th><th>Kortti</th><th title="Laskettu käteinen − (kassapohja + myynti − kortit − kulut + tipit). 0 = kassa täsmää">Ero <i class="bi bi-info-circle"></i></th><th><i class="bi bi-image"></i></th></tr></thead><tbody>${table}</tbody>
                <tfoot><tr style="border-top:2px solid var(--border); font-weight:700"><td>Yhteensä</td><td>${rows.length}</td><td>${cashEur(sum(rows, 'sales_total'))}</td><td>${rows.length ? cashEur(sum(rows, 'sales_total') / rows.length) : '–'}</td><td>${cashEur(sum(rows, 'card_total'))}</td>${diffCell(sum(rows, 'difference'))}<td></td></tr></tfoot>`;
        }
        body = rows.length || c.mode === 'week' ? `<div style="overflow-x:auto"><table class="data-table" style="width:100%; font-size:13px; border-collapse:collapse;">${table}</table></div>` : '<div class="tool-empty">Ei tilityksiä tällä jaksolla.</div>';
    }
    return `<div class="card card-sm no-print">
        <div class="section-header"><span class="section-title"><i class="bi bi-cash-coin"></i> Tilitykset</span><div class="section-line"></div></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">${mode('day', 'Päivät')}${mode('week', 'Viikot')}<span style="flex:1"></span><button class="btn btn-ghost btn-sm" onclick="openCashModal()"><i class="bi bi-plus-lg"></i> Uusi / korjaa</button><a class="btn btn-ghost btn-sm" href="api.php?action=cash_accounting&from=${from}&to=${to}" title="Päiväkohtaiset summat ALV-erittelyllä kirjanpitoa varten"><i class="bi bi-journal-arrow-down"></i> Kirjanpitovienti</a></div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Edellinen" onclick="shiftCashStats(-1)"><i class="bi bi-chevron-left"></i></button>
            <b style="flex:1; text-align:center; text-transform:capitalize">${title}</b>
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Seuraava" onclick="shiftCashStats(1)"><i class="bi bi-chevron-right"></i></button></div>
        ${body}</div>${renderCashInsights()}`;
}

// ---------- Kassaerojen seuranta ----------
async function loadCashInsights() {
    state.cashInsightsLoading = true;
    try { const r = await (await fetch('api.php?action=cash_insights&days=' + (state.cashInsightsDays || 90))).json(); state.cashInsights = r.error ? { error: r.error } : r; }
    catch (e) { state.cashInsights = { error: 'Lataus epäonnistui' }; }
    state.cashInsightsLoading = false; render();
}
function setCashInsightsDays(d) { state.cashInsightsDays = d; state.cashInsights = null; render(); }
function renderCashInsights() {
    if (!state.cashInsights && !state.cashInsightsLoading) loadCashInsights();
    const r = state.cashInsights, days = state.cashInsightsDays || 90;
    const pill = d => `<button class="btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}" onclick="setCashInsightsDays(${d})">${d} pv</button>`;
    let body;
    if (!r) body = '<div class="tool-empty">Ladataan…</div>';
    else if (r.error) body = `<div class="leave-box warn">${esc(r.error)}</div>`;
    else if (!r.totals.counted) body = '<div class="tool-empty">Ei tilityksiä, joissa käteinen on laskettu. Eroseuranta tarvitsee "laskettu käteinen" -kentän.</div>';
    else {
        const DOW = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'], t = r.totals, col = v => v === 0 ? 'var(--teal)' : 'var(--red, #dc2626)';
        const maxNz = Math.max(1, ...r.by_dow.map(d => d.counted ? d.nonzero / d.counted : 0));
        body = `<div style="font-size:13px; margin-bottom:10px;">${t.counted} laskettua tilitystä: <b style="color:var(--teal)">${t.balanced} täsmäsi</b>, <b style="color:var(--red, #dc2626)">${t.short} vajausta</b>, ${t.over} ylijäämää · nettoero <b style="color:${col(t.diff_sum)}">${cashDiff(t.diff_sum)}</b></div>
        <div style="overflow-x:auto"><table class="data-table" style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="text-align:left; color:var(--text3)"><th>Kirjaaja</th><th>Tilityksiä</th><th>Täsmäsi</th><th>Vajauksia</th><th>Ylijäämiä</th><th>Nettoero</th><th>Keskim. poikkeama</th></tr></thead><tbody>
        ${r.by_user.map(u => `<tr style="border-top:1px solid var(--border)"><td>${esc(u.name)}${u.flag ? ' <span title="Toistuvia vajauksia – kannattaa käydä läpi" style="color:var(--red, #dc2626)"><i class="bi bi-exclamation-triangle-fill"></i> toistuu</span>' : ''}</td><td>${u.counted}</td><td>${u.balanced}</td><td>${u.short}</td><td>${u.over}</td><td style="font-weight:700; color:${col(u.diff_sum)}">${cashDiff(u.diff_sum)}</td><td>${cashEur(u.abs_avg)}</td></tr>`).join('')}</tbody></table></div>
        <div style="font-size:12px; color:var(--text3); margin:12px 0 4px;">Virheellisten tilitysten osuus viikonpäivittäin</div>
        <div style="display:flex; gap:6px; align-items:flex-end; height:90px;">${r.by_dow.map(d => { const share = d.counted ? d.nonzero / d.counted : 0; return `<div style="flex:1; text-align:center; font-size:11px;" title="${DOW[d.dow]}: ${d.nonzero}/${d.counted} ei täsmännyt, nettoero ${cashDiff(d.diff_sum)}"><div style="height:${Math.max(3, share / maxNz * 60)}px; background:${share > 0 ? 'var(--accent)' : 'var(--teal)'}; border-radius:4px 4px 0 0; margin:0 4px;"></div>${DOW[d.dow]}<br><b>${Math.round(share * 100)} %</b></div>`; }).join('')}</div>`;
    }
    return `<div class="card card-sm no-print"><div class="section-header"><span class="section-title"><i class="bi bi-search"></i> Kassaerojen seuranta</span><div class="section-line"></div></div>
        <div style="display:flex; gap:6px; margin-bottom:10px;">${pill(30)}${pill(90)}${pill(180)}</div>${body}</div>`;
}

// ---------- Tavoitteet ja ALV (admin) ----------
function openFinanceModal() {
    const p = state.data.pub || {};
    openModal('Myyntitavoitteet ja ALV', 'bi-bullseye', `
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Tavoitteet näkyvät Myynti-välilehden edistymispalkkina. Vuositavoite lasketaan kuukausitavoitteesta × 12. ALV-kantaa käytetään kirjanpitovientiin (myynti on kirjattu verollisena).</p>
        <div class="form-row"><div class="form-group"><label class="form-label">Viikkotavoite (€)</label><input id="fin-w" type="number" min="0" step="1" class="form-input" value="${p.sales_target_week ?? ''}"></div>
        <div class="form-group"><label class="form-label">Kuukausitavoite (€)</label><input id="fin-m" type="number" min="0" step="1" class="form-input" value="${p.sales_target_month ?? ''}"></div></div>
        <div class="form-group"><label class="form-label">ALV-kanta (%)</label><input id="fin-v" type="number" min="0" max="100" step="0.1" class="form-input" value="${p.vat_rate ?? 25.5}"></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="saveFinance()">Tallenna</button>`);
}
async function saveFinance() {
    const res = await fetch('api.php?action=save_finance', { method: 'POST', body: JSON.stringify({ sales_target_week: document.getElementById('fin-w').value, sales_target_month: document.getElementById('fin-m').value, vat_rate: document.getElementById('fin-v').value }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    closeModal(); showToast('Tallennettu'); state.salesReport = null; load();
}
