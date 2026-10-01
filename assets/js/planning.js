// ===================== VUOROSUUNNITTELUN LISÄT: miehitys, ehdotukset, toistuvat estepäivät, vuoronvaihdon huomautukset =====================
const DOW_FI = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];
const DOW_LONG = ['Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai', 'Sunnuntai'];

// ---- Vuoronvaihto: ristiriita ilmoitetaan, mutta päätös jää työntekijälle ja adminille ----
function tradeWarnHtml(w) {
    if (!w || !w.length) return '';
    return `<div class="warn-box" style="margin:8px 0 0; padding:6px 10px; font-size:12px;"><b>⚠ Ristiriita:</b> ${w.map(x => esc(x.msg)).join('; ')}<br><small>Huomautus ei estä vaihtoa – päätös on sinun.</small></div>`;
}
function confirmWarnings(w, question) {
    return !w || !w.length || confirm('Huomioitavaa:\n\n• ' + w.map(x => x.msg).join('\n• ') + '\n\n' + question);
}
function offerShift(shiftId) {
    const s = state.data.shifts.find(x => x.id == shiftId); if (!s) return;
    const mates = state.data.users.filter(u => u.id != state.user.id && u.role !== 'superadmin' && !u.anonymized_at);
    openModal('Tarjoa vuoro vaihtoon', 'bi-arrow-left-right', `
        <p style="font-size:14px; margin:0 0 12px;"><b>${formatDate(s.date)}</b> ${s.start.slice(0, 5)}–${s.end.slice(0, 5)} (${esc(s.role || '')})</p>
        <div class="form-group"><label class="form-label">Kenelle</label>
            <select id="of-target" class="form-input"><option value="">Kaikille (kuka tahansa voi pyytää)</option>${mates.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
        <small style="color:var(--text3)">Jos valitset työkaverin, vain hän näkee ja voi ottaa tarjouksen. Admin voi hyväksyä vaihdon joka tapauksessa.</small>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="doOffer(${shiftId})">Tarjoa</button>`);
}
async function doOffer(shiftId) {
    const target = document.getElementById('of-target').value;
    const r = await (await fetch('api.php?action=create_trade', { method: 'POST', body: JSON.stringify({ shiftId, targetUserId: target || null }) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Vuoro tarjottu'); load();
}
// Vuoron pyytäminen: joko otat vuoron sellaisenaan tai tarjoat oman vuorosi tilalle (vastavuoroinen vaihto). Ylläpito saa vain tiedon.
function requestTrade(tradeId) {
    const t = (state.data.trades || []).find(x => x.id == tradeId); if (!t) return;
    const today = getLocalDateString();
    const mine = (state.data.shifts || []).filter(s => s.userId == state.user.id && s.date >= today && s.status !== 'draft' && s.id != t.offered_shift_id).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const off = (state.data.shifts || []).find(s => s.id == t.offered_shift_id);
    openModal('Pyydä vuoro', 'bi-arrow-left-right', `
        ${off ? `<p style="font-size:14px; margin:0 0 10px;"><b>${formatDate(off.date)}</b> ${off.start.slice(0, 5)}–${off.end.slice(0, 5)} (${esc(off.role || '')})</p>` : ''}
        ${tradeWarnHtml(t.my_warnings)}
        <label class="abs-choice" style="margin:10px 0 6px;"><input type="radio" name="tr-mode" value="take" checked onchange="document.getElementById('tr-swap').disabled = true"><span><b>Otan vuoron</b> sellaisenaan</span></label>
        <label class="abs-choice" style="margin-bottom:8px;"><input type="radio" name="tr-mode" value="swap" ${mine.length ? '' : 'disabled'} onchange="document.getElementById('tr-swap').disabled = false"><span><b>Vaihdan omaan vuoroon</b>${mine.length ? '' : ' (sinulla ei ole tulevia vuoroja)'}</span></label>
        <select id="tr-swap" class="form-input" disabled>${mine.map(s => `<option value="${s.id}">${formatDate(s.date)} ${s.start.slice(0, 5)}–${s.end.slice(0, 5)} ${esc(s.role || '')}</option>`).join('')}</select>
        <small style="color:var(--text3); display:block; margin-top:8px;">Tarjoaja hyväksyy tai hylkää pyynnön. Kun hän hyväksyy, vaihto toteutuu heti; ylläpito saa siitä vain tiedon (ja mahdolliset lepoaika- ym. huomautukset). Ristiriidat eivät estä vaihtoa.</small>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="doRequestTrade(${tradeId})">Lähetä pyyntö</button>`);
}
async function doRequestTrade(tradeId) {
    const swap = document.querySelector('input[name=tr-mode]:checked').value === 'swap' ? +document.getElementById('tr-swap').value : null;
    const r = await (await fetch('api.php?action=request_trade', { method: 'POST', body: JSON.stringify({ tradeId, swapShiftId: swap }) })).json();
    if (r.error) showToast(r.error, 'error'); else { closeModal(); showToast('Pyyntö lähetetty'); } load();
}
async function handleTrade(tradeId, decision) {
    const t = (state.data.trades || []).find(x => x.id == tradeId);
    if (decision === 'accepted' && !confirmWarnings(t && [...(t.warnings || []), ...(t.swap_warnings || []).map(w => ({ msg: 'Sinulle tuleva vaihtovuoro: ' + w.msg }))], 'Hyväksytäänkö vaihto silti?')) return;
    const r = await (await fetch('api.php?action=handle_trade', { method: 'POST', body: JSON.stringify({ tradeId, decision }) })).json();
    if (r.error) showToast(r.error, 'error'); load();
}

// ---- Miehitys (admin-välilehti) ----
function coverageBadge(c) {
    if (c.shortage > 0) return `<span class="badge" style="background:#FEE2E2; color:#B91C1C;">Puuttuu ${c.shortage}${c.first_short ? ' (klo ' + c.first_short + ' alkaen)' : ''}</span>`;
    return `<span class="badge badge-teal">OK (${c.min}/${c.need})</span>${c.drafts ? ' <small style="color:var(--text3)">sis. luonnoksia</small>' : ''}`;
}
function adminTabCoverage() {
    const rules = state.data.staffing_rules || [], cov = state.data.coverage || [], roles = pubCfg().roles;
    const byDate = {}; cov.forEach(c => (byDate[c.date] = byDate[c.date] || []).push(c));
    const short = cov.filter(c => c.shortage > 0).length;
    const days = Object.keys(byDate).sort();
    return `<div class="card card-sm" style="max-width:820px; margin-bottom:16px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-people"></i> Miehityssäännöt</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Määritä, montako tekijää tarvitaan milloinkin (esim. pe–la klo 20–02 vähintään 3 baarimikkoa). Järjestelmä varoittaa puutteista ja osaa ehdottaa vuoroja.</p>
        ${rules.length ? `<table class="bs-table" style="margin-bottom:12px;"><thead><tr><th>Päivä</th><th>Aika</th><th>Rooli</th><th style="text-align:right">Väh.</th><th></th></tr></thead><tbody>${rules.map(r => `<tr><td>${r.dow === null || r.dow === '' ? 'Joka päivä' : DOW_LONG[r.dow]}</td><td>${r.start.slice(0, 5)}–${r.end.slice(0, 5)}</td><td>${esc(r.role || 'Kaikki')}</td><td style="text-align:right"><b>${r.min_staff}</b></td><td style="text-align:right"><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteStaffingRule(${r.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3); font-size:13px;">Ei sääntöjä vielä.</p>'}
        <div class="form-row" style="align-items:flex-end; gap:8px; flex-wrap:wrap;">
            <div class="form-group"><label class="form-label">Päivä</label><select id="sr-dow" class="form-input"><option value="">Joka päivä</option>${DOW_LONG.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Alkaa</label><input id="sr-start" type="time" class="form-input" value="18:00"></div>
            <div class="form-group"><label class="form-label">Päättyy</label><input id="sr-end" type="time" class="form-input" value="02:00"></div>
            <div class="form-group"><label class="form-label">Rooli</label><select id="sr-role" class="form-input"><option value="">Kaikki</option>${roles.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
            <div class="form-group" style="max-width:90px;"><label class="form-label">Väh.</label><input id="sr-min" type="number" min="1" max="50" value="2" class="form-input"></div>
            <div class="form-group"><button class="btn btn-primary" onclick="saveStaffingRule()"><i class="bi bi-plus-lg"></i> Lisää</button></div>
        </div>
    </div>
    <div class="card card-sm" style="max-width:820px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-speedometer2"></i> Kattavuus, seuraavat 14 päivää</span><div class="section-line"></div></div>
        ${!rules.length ? '<p style="color:var(--text3); font-size:13px;">Lisää ensin miehityssääntö.</p>' : `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <span style="font-size:13px; color:${short ? '#B91C1C' : 'var(--teal)'}; font-weight:700;">${short ? short + ' miehityspuutetta' : 'Kaikki jaksot miehitetty ✓'}</span>
            <button class="btn btn-primary btn-sm" onclick="openSuggestModal()" ${short ? '' : 'disabled'}><i class="bi bi-magic"></i> Ehdota vuorot puutteisiin</button>
        </div>
        ${days.map(d => `<div style="padding:8px 0; border-top:1px solid var(--border);"><b>${formatDate(d)}</b>${byDate[d].map(c => `<div style="display:flex; justify-content:space-between; gap:8px; font-size:13px; padding:3px 0;"><span>${c.start}–${c.end} ${esc(c.role || '')}</span>${coverageBadge(c)}</div>`).join('')}</div>`).join('')}`}
    </div>`;
}
async function saveStaffingRule() {
    const v = id => document.getElementById(id).value;
    const r = await (await fetch('api.php?action=staffing_rule', { method: 'POST', body: JSON.stringify({ dow: v('sr-dow'), start: v('sr-start'), end: v('sr-end'), role: v('sr-role'), min_staff: v('sr-min') }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Sääntö lisätty'); load();
}
async function deleteStaffingRule(id) {
    if (!confirm('Poistetaanko sääntö?')) return;
    await fetch(`api.php?id=${id}&type=staffing_rule`, { method: 'DELETE' }); load();
}
async function openSuggestModal() {
    const from = getLocalDateString(), to = getLocalDateString(new Date(Date.now() + 13 * 864e5));
    openModal('Ehdotetut vuorot', 'bi-magic', '<div class="tool-empty">Lasketaan…</div>', `<button class="btn btn-ghost" onclick="closeModal()">Sulje</button>`);
    const r = await (await fetch('api.php?action=suggest_schedule', { method: 'POST', body: JSON.stringify({ from, to }) })).json();
    if (r.error) { closeModal(); return showToast(r.error, 'error'); }
    state.suggestion = r;
    const rows = r.proposals.map((p, i) => `<label class="abs-choice" style="margin-bottom:6px;"><input type="checkbox" class="sg-cb" value="${i}" checked><span><b>${formatDate(p.date)}</b> ${p.start}–${p.end} · ${esc(p.name)} (${esc(p.role)})<br><small style="color:var(--text3)">${esc(p.reason)}</small></span></label>`).join('');
    const un = r.unfilled.length ? `<div class="warn-box"><b>Ei löytynyt tekijää:</b><ul>${r.unfilled.map(u => `<li>${formatDate(u.date)} ${u.start}–${u.end} ${esc(u.role || '')} (puuttuu ${u.missing})</li>`).join('')}</ul><small>Kaikki ehdokkaat ovat joko vuorossa, poissa, estettyjä tai ylittäisivät lepo-/viikkotuntirajan.</small></div>` : '';
    document.getElementById('modal-body-el').innerHTML = `<p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Ehdotus perustuu saatavuuteen, poissaoloihin, lepoaikaan ja tavoitetunteihin. Valitut lisätään <b>luonnoksina</b>, jotta voit tarkistaa ne ennen julkaisua.</p>${rows || '<div class="tool-empty">Ei ehdotettavaa</div>'}${un}`;
    document.getElementById('modal-footer-el').innerHTML = `<button class="btn btn-ghost" onclick="closeModal()">Sulje</button>${r.proposals.length ? `<button class="btn btn-primary" onclick="applySuggestion()"><i class="bi bi-check2-square"></i> Lisää valitut luonnoksina</button>` : ''}`;
}
async function applySuggestion() {
    const picked = [...document.querySelectorAll('.sg-cb:checked')].map(c => state.suggestion.proposals[c.value]);
    if (!picked.length) return showToast('Ei valintoja', 'error');
    const r = await (await fetch('api.php?action=bulk_shifts', { method: 'POST', body: JSON.stringify(picked.map(p => ({ userId: p.userId, date: p.date, start: p.start, end: p.end, role: p.role, status: 'draft' }))) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast(`${picked.length} vuoroa lisätty luonnoksina`); load();
}

// ---- Toistuvat estepäivät (oma profiili → Saatavuus) ----
function renderAvailabilityRules() {
    const mine = (state.data.availability_rules || []).filter(r => r.user_id == state.user.id);
    return `<div class="card card-sm" style="max-width:600px; margin-bottom:24px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-calendar-x"></i> Toistuvat estepäivät</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Merkitse viikonpäivät, joina et yleensä voi työskennellä (esim. maanantait opintojen takia). Ylläpito näkee varoituksen, jos sinulle yritetään suunnitella vuoro estepäivälle, ja vuoroehdotukset välttävät niitä. Yksittäisiä päiviä voit merkitä Vuorot-sivun saatavuustilassa.</p>
        ${mine.length ? mine.map(r => `<div class="att-row" style="align-items:center;"><div><b>${DOW_LONG[r.dow]}</b>${r.valid_from || r.valid_to ? `<br><small>${r.valid_from ? formatDate(r.valid_from) : '…'} – ${r.valid_to ? formatDate(r.valid_to) : '…'}</small>` : '<br><small>toistaiseksi</small>'}${r.note ? ` <small>· ${esc(r.note)}</small>` : ''}</div><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteAvailRule(${r.id})"><i class="bi bi-trash"></i></button></div>`).join('') : '<p style="color:var(--text3); font-size:13px;">Ei estepäiviä.</p>'}
        <div class="form-row" style="margin-top:12px; align-items:flex-end; flex-wrap:wrap; gap:8px;">
            <div class="form-group"><label class="form-label">Viikonpäivä</label><select id="ar-dow" class="form-input">${DOW_LONG.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Alkaen (valinn.)</label><input id="ar-from" type="date" class="form-input"></div>
            <div class="form-group"><label class="form-label">Asti (valinn.)</label><input id="ar-to" type="date" class="form-input"></div>
            <div class="form-group"><label class="form-label">Syy (valinn.)</label><input id="ar-note" class="form-input" maxlength="100" placeholder="Esim. koulu"></div>
            <div class="form-group"><button class="btn btn-primary" onclick="addAvailRule()"><i class="bi bi-plus-lg"></i> Lisää</button></div>
        </div>
    </div>`;
}
async function addAvailRule() {
    const v = id => document.getElementById(id).value;
    const r = await (await fetch('api.php?action=availability_rule', { method: 'POST', body: JSON.stringify({ dow: v('ar-dow'), valid_from: v('ar-from'), valid_to: v('ar-to'), note: v('ar-note') }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Estepäivä lisätty'); load();
}
async function deleteAvailRule(id) { await fetch(`api.php?id=${id}&type=availability_rule`, { method: 'DELETE' }); load(); }

// ===================== KUSTANNUSENNUSTE (viikkonäkymä, admin) =====================
function renderForecastCard(weekStart) {
    const f = state.forecast && state.forecast.weekStart === weekStart ? state.forecast : null;
    if (!f && !state.forecastLoading) loadForecast(weekStart);
    const eur = v => Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
    if (!f) return `<div class="card card-sm" style="margin-bottom:14px; color:var(--text3); font-size:13px;">Lasketaan viikon kustannusennustetta…</div>`;
    const bad = f.over_budget;
    return `<div class="card card-sm" style="margin-bottom:14px; border-left:4px solid ${bad ? '#E11D48' : 'var(--teal)'};">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div><b><i class="bi bi-cash-coin"></i> Viikon kustannusennuste ${eur(f.employer_cost)}</b> <span style="color:var(--text2); font-size:13px;">· ${Number(f.hours).toLocaleString('fi-FI')} h${f.open_hours ? ` (+ ${Number(f.open_hours).toLocaleString('fi-FI')} h avoimia, ei hintaa)` : ''}${f.drafts ? ` · sis. ${f.drafts} luonnosta` : ''}</span><br>
            <small style="color:var(--text2);">Palkka lisineen ${eur(f.cost)} + sivukulut ${pubCfg().side_cost_pct} %${f.budget !== null ? ` · budjetti ${eur(f.budget)} ${bad ? '<b style="color:#B91C1C;">ylittyy ' + eur(f.employer_cost - f.budget) + '</b>' : '✓'}` : ''}${f.labour_pct !== null ? ` · myynti ${eur(f.sales)} → henkilöstökulut <b>${f.labour_pct} %</b>` : ''}</small></div>
            <button class="btn btn-ghost btn-sm" onclick="openSalesModal('${weekStart}')"><i class="bi bi-receipt"></i> Kirjaa myynti</button>
        </div></div>`;
}
async function loadForecast(weekStart) {
    state.forecastLoading = true;
    state.forecast = { weekStart, hours: 0, cost: 0, employer_cost: 0, open_hours: 0, drafts: 0, budget: null, over_budget: false, sales: 0, labour_pct: null, days: [] };   // varmuus: ei toistuvaa latausta virheessä
    try { const r = await (await fetch('api.php?action=forecast&weekStart=' + weekStart)).json(); if (!r.error) state.forecast = r; } catch (e) {}
    state.forecastLoading = false; render();
}
function openSalesModal(weekStart) {
    const f = state.forecast || { days: [] };
    const rows = f.days.map(d => `<div class="form-row" style="align-items:center; margin-bottom:6px;"><div style="min-width:110px; font-size:13px;"><b>${formatDate(d.date)}</b></div><input class="form-input sales-in" data-date="${d.date}" type="number" step="0.01" min="0" placeholder="€" value="${d.sales ?? ''}"><small style="min-width:90px; color:var(--text3);">kulut ${Math.round(d.cost)} €</small></div>`).join('');
    openModal('Päivämyynti', 'bi-receipt', `<p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Kirjaa päivän myynti (alv 0 % tai kuten seuraatte), niin näet henkilöstökulujen osuuden myynnistä. Tyhjä = ei tietoa.</p>${rows}`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="saveSales('${weekStart}')">Tallenna</button>`);
}
async function saveSales(weekStart) {
    for (const inp of document.querySelectorAll('.sales-in')) {
        await fetch('api.php?action=daily_sales', { method: 'POST', body: JSON.stringify({ date: inp.dataset.date, amount: inp.value }) });
    }
    closeModal(); showToast('Myynti tallennettu'); state.forecast = null; render();
}

// ===================== TYÖAIKAPANKKI =====================
async function loadHourBank() {
    state.hourBankLoading = true;
    state.hourBank = { bank: [], overtime_week_hours: 40 };
    try { const r = await (await fetch('api.php?action=hour_bank&months=12')).json(); if (!r.error) state.hourBank = r; } catch (e) {}
    state.hourBankLoading = false; render();
}
function fmtH(v) { return (v > 0 ? '+' : '') + Number(v).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h'; }
function renderHourBank(onlySelf) {
    if (!state.hourBank && !state.hourBankLoading) loadHourBank();
    if (!state.hourBank) return `<div class="card card-sm" style="max-width:600px; margin-bottom:16px; color:var(--text3);">Ladataan tuntipankkia…</div>`;
    const list = onlySelf ? state.hourBank.bank.filter(b => b.id == state.user.id) : state.hourBank.bank;
    const cur = getLocalDateString().slice(0, 7);
    const col = v => v > 0.05 ? '#0D9488' : (v < -0.05 ? '#B91C1C' : 'var(--text2)');
    return `<div class="card card-sm" style="${onlySelf ? 'max-width:600px;' : ''} margin-bottom:16px; padding:0; overflow-x:auto;">
        <div style="padding:16px 18px 6px;"><div class="section-header" style="margin:0;"><span class="section-title"><i class="bi bi-piggy-bank"></i> Työaikapankki</span><div class="section-line"></div></div>
        <p style="font-size:12px; color:var(--text3); margin:8px 0 0;">Saldo = leimatut tunnit − tavoitetunnit (kk), päättyneiltä kuukausilta viimeisen 12 kk ajalta. Ylityö = viikkotunnit yli ${state.hourBank.overtime_week_hours} h. Tavoitetunnit asetetaan työntekijän tiedoissa.</p></div>
        <table class="bs-table"><thead><tr>${onlySelf ? '' : '<th>Työntekijä</th>'}<th style="text-align:right">Tavoite/kk</th><th style="text-align:right">Tämä kk</th><th style="text-align:right">Saldo</th><th style="text-align:right">Ylityö 12 kk</th></tr></thead><tbody>
        ${list.map(b => { const m = b.months.find(x => x.month === cur) || { actual: 0 }; return `<tr>${onlySelf ? '' : `<td><b>${esc(b.name)}</b></td>`}<td style="text-align:right">${b.target ? b.target + ' h' : '–'}</td><td style="text-align:right">${Number(m.actual).toLocaleString('fi-FI', { maximumFractionDigits: 1 })} h</td><td style="text-align:right; font-weight:700; color:${col(b.saldo)}">${b.target ? fmtH(b.saldo) : '–'}</td><td style="text-align:right">${b.overtime_total ? Number(b.overtime_total).toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + ' h' : '–'}</td></tr>`; }).join('') || '<tr><td colspan="5" style="text-align:center; color:var(--text3); padding:16px;">Ei tietoja</td></tr>'}
        </tbody></table></div>`;
}

// ===================== ANALYTIIKKA (admin) =====================
async function loadAnalytics(months) {
    state.analyticsMonths = months || state.analyticsMonths || 6; state.analytics = { loading: true }; render();
    try { const r = await (await fetch('api.php?action=analytics&months=' + state.analyticsMonths)).json(); state.analytics = r.error ? { error: r.error } : r; }
    catch (e) { state.analytics = { error: 'Yhteysvirhe' }; }
    render();
}
function bars(labels, values, unit, color) {
    const max = Math.max(...values, 1);
    return `<div style="display:flex; gap:6px; align-items:flex-end; height:130px; padding-top:18px;">${values.map((v, i) => `<div style="flex:1; text-align:center; min-width:0;" title="${esc(labels[i])}: ${v} ${unit}"><div style="font-size:11px; color:var(--text2); height:16px;">${v || ''}</div><div style="background:${color}; height:${Math.max(2, v / max * 88)}px; border-radius:4px 4px 0 0;"></div><div style="font-size:10px; color:var(--text3); margin-top:3px;">${esc(labels[i].slice(5))}</div></div>`).join('')}</div>`;
}
function adminTabAnalytics() {
    const a = state.analytics;
    if (!a) { loadAnalytics(); return '<div class="tool-empty">Ladataan…</div>'; }
    if (a.loading) return '<div class="tool-empty">Lasketaan…</div>';
    if (a.error) return `<div class="leave-box warn">${esc(a.error)}</div>`;
    const heatMax = Math.max(...a.heatmap.flat(), 1);
    const sel = [3, 6, 12].map(m => `<button class="pill ${state.analyticsMonths === m ? 'active' : ''}" onclick="loadAnalytics(${m})">${m} kk</button>`).join('');
    return `<div class="abs-pills" style="margin-bottom:12px;">${sel}</div>
    <div class="card card-sm" style="max-width:860px; margin-bottom:16px;"><div class="section-header"><span class="section-title"><i class="bi bi-clock"></i> Leimatut tunnit kuukausittain</span><div class="section-line"></div></div>${bars(a.months, a.hours, 'h', 'var(--teal)')}</div>
    <div class="card card-sm" style="max-width:860px; margin-bottom:16px;"><div class="section-header"><span class="section-title"><i class="bi bi-grid-3x3-gap"></i> Milloin baarissa ollaan töissä</span><div class="section-line"></div></div>
        <p style="font-size:12px; color:var(--text3); margin:0 0 8px;">Leimattujen tuntien summa viikonpäivän ja kellonajan mukaan. Tummempi = enemmän työtunteja.</p>
        <div style="overflow-x:auto;"><table style="border-collapse:separate; border-spacing:2px; font-size:10px;"><thead><tr><th></th>${Array.from({ length: 24 }, (_, h) => `<th style="font-weight:600; color:var(--text3); min-width:20px;">${h}</th>`).join('')}</tr></thead><tbody>
        ${a.heatmap.map((row, d) => `<tr><td style="font-weight:700; padding-right:6px;">${DOW_FI[d]}</td>${row.map((v, h) => `<td title="${DOW_FI[d]} klo ${h}: ${v} h" style="height:20px; border-radius:3px; background:rgba(13,148,136,${v ? (0.12 + 0.88 * v / heatMax).toFixed(2) : 0.05});"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
    <div class="card card-sm" style="max-width:860px; margin-bottom:16px; padding:0; overflow-x:auto;"><div style="padding:16px 18px 6px;"><div class="section-header" style="margin:0;"><span class="section-title"><i class="bi bi-alarm"></i> Täsmällisyys</span><div class="section-line"></div></div>
        <p style="font-size:12px; color:var(--text3); margin:8px 0 0;">Vertaa sisäänleimausta vuoron alkuun (myöhässä = yli 5 min). Mukana vain työntekijät, jotka käyttävät leimausta. Tulos on suuntaa-antava: syyt (esim. sovitut poikkeukset) eivät näy.</p></div>
        <table class="bs-table"><thead><tr><th>Työntekijä</th><th style="text-align:right">Vuoroja</th><th style="text-align:right">Myöhässä</th><th style="text-align:right">Ka. myöhässä</th><th style="text-align:right">Ei leimausta</th></tr></thead><tbody>
        ${a.punctuality.length ? a.punctuality.map(p => `<tr><td><b>${esc(p.name)}</b></td><td style="text-align:right">${p.shifts}</td><td style="text-align:right; color:${p.late ? '#B45309' : 'inherit'}">${p.late}</td><td style="text-align:right">${p.avg_late ? p.avg_late + ' min' : '–'}</td><td style="text-align:right; color:${p.missing ? '#B91C1C' : 'inherit'}">${p.missing}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--text3); padding:16px;">Ei tietoja</td></tr>'}</tbody></table></div>
    <div class="card card-sm" style="max-width:860px;"><div class="section-header"><span class="section-title"><i class="bi bi-bandaid"></i> Sairauspoissaolot</span><div class="section-line"></div></div>
        ${bars(a.months, a.sick_days, 'pv', '#E11D48')}
        ${a.sick_by_user.length ? `<table class="bs-table" style="margin-top:10px;"><thead><tr><th>Työntekijä</th><th style="text-align:right">Jaksoja</th><th style="text-align:right">Päiviä</th></tr></thead><tbody>${a.sick_by_user.map(u => `<tr><td>${esc(u.name)}</td><td style="text-align:right">${u.episodes}</td><td style="text-align:right">${u.days}</td></tr>`).join('')}</tbody></table>` : '<p style="color:var(--text3); font-size:13px;">Ei sairauspoissaoloja valitulla ajalla.</p>'}
        <p style="font-size:12px; color:var(--text3); margin:8px 0 0;">Terveystieto on arkaluonteista: käsittele sitä luottamuksellisesti äläkä jaa henkilökohtaisia tietoja muille.</p></div>`;
}
