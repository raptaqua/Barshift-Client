// ===================== TUNTIEN KUUKAUSIVAHVISTUS =====================
// Työntekijä vahvistaa (tai kiistää) kuukauden toteutuneet tunnit; ylläpito hyväksyy tai palauttaa korjattavaksi. Hyväksytyt tunnit näkyvät palkka-ajossa.
const HOURS_STATUS = {
    none:      { label: 'Ei vahvistettu', color: 'var(--text3)', icon: 'bi-circle' },
    confirmed: { label: 'Vahvistettu',    color: '#2563EB',      icon: 'bi-check-circle' },
    disputed:  { label: 'Kiistetty',      color: '#E11D48',      icon: 'bi-exclamation-circle-fill' },
    approved:  { label: 'Hyväksytty',     color: 'var(--teal)',  icon: 'bi-check-circle-fill' },
    returned:  { label: 'Palautettu korjattavaksi', color: '#F59E0B', icon: 'bi-arrow-return-left' }
};
function hoursBadge(status) { const s = HOURS_STATUS[status] || HOURS_STATUS.none; return ` <span style="color:${s.color}; font-size:12px; white-space:nowrap;" title="${s.label}"><i class="bi ${s.icon}"></i>${status === 'none' ? '' : ' ' + s.label}</span>`; }
function monthLabel(m) { return new Date(m + '-01T12:00').toLocaleString('fi-FI', { month: 'long', year: 'numeric' }); }
function confirmableMonths() {   // edelliset kuukaudet + kuluva, kun kuun 25. päivä on ohi
    const now = new Date(), out = [];
    for (let i = (now.getDate() >= 25 ? 0 : 1); i <= 3; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    return out;
}
function hourConfOf(m) { return (state.data.hour_conf || []).find(x => x.month === m) || null; }

function renderHourConfirmCard() {
    const rows = confirmableMonths().map(m => {
        const c = hourConfOf(m), st = c ? c.status : 'none', canAct = st !== 'approved';
        return `<div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-top:1px solid var(--border);">
            <div style="flex:1; text-transform:capitalize;"><b>${monthLabel(m)}</b>${hoursBadge(st)}${c && c.hours ? `<small style="color:var(--text3)"> · ${Number(c.hours).toLocaleString('fi-FI')} h</small>` : ''}${st === 'returned' && c.admin_note ? `<div style="font-size:12px; color:var(--text2);">Ylläpito: ${esc(c.admin_note)}</div>` : ''}</div>
            ${st === 'approved' ? `<a class="btn btn-ghost btn-sm" href="api.php?action=payslip&month=${m}"><i class="bi bi-file-earmark-pdf"></i> Palkkaerittely (PDF)</a>` : ''}
            ${canAct ? `<button class="btn btn-sm ${st === 'none' || st === 'returned' ? 'btn-primary' : 'btn-ghost'}" onclick="openHourConfirm('${m}')">${st === 'none' || st === 'returned' ? 'Tarkista ja vahvista' : 'Avaa'}</button>` : ''}</div>`;
    }).join('');
    return `<div class="card card-sm"><div class="section-header"><span class="section-title"><i class="bi bi-clipboard-check"></i> Tuntien vahvistus</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 6px;">Tarkista kuukauden toteutuneet tunnit ja vahvista ne palkka-ajoa varten. Jos tunnit eivät täsmää, kiistä ja kerro syy.</p>${rows}</div>`;
}
async function openHourConfirm(month) {
    openModal(`Tunnit: ${monthLabel(month)}`, 'bi-clipboard-check', '<div class="tool-empty">Ladataan…</div>', '');
    const r = await (await fetch('api.php?action=hours_confirm&month=' + month)).json().catch(() => ({}));
    if (r.error) { closeModal(); return showToast(r.error, 'error'); }
    const locked = r.status === 'approved';
    const srcText = r.source === 'leimaukset' ? 'leimauksista' : r.source === 'vuorot' ? 'toteutuneista vuoroista (leimauksia ei ole)' : '';
    document.getElementById('modal-body-el').innerHTML = `
        <div style="text-align:center; margin:4px 0 12px;"><div style="font-size:34px; font-weight:800;">${Number(r.hours).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} h</div><small style="color:var(--text3)">${srcText ? 'laskettu ' + srcText : 'ei kirjattuja tunteja'}</small></div>
        <div style="text-align:center; margin-bottom:10px;">${hoursBadge(r.status)}</div>
        ${r.status === 'returned' && r.admin_note ? `<div class="leave-box warn" style="margin-bottom:10px;">Ylläpito palautti korjattavaksi: ${esc(r.admin_note)}</div>` : ''}
        ${r.changed ? '<div class="leave-box warn" style="margin-bottom:10px;">Tunnit ovat muuttuneet hyväksynnän jälkeen.</div>' : ''}
        ${locked ? '<div class="leave-box">Tunnit on hyväksytty. Pyydä ylläpitäjää avaamaan ne, jos korjattavaa on.</div>'
          : `<div class="form-group"><label class="form-label">Huomautus (pakollinen jos kiistät)</label><textarea id="hc-note" class="form-input" rows="3" maxlength="500" placeholder="Esim. unohdin leimata ulos 12.3.">${esc(r.note || '')}</textarea></div>`}`;
    document.getElementById('modal-footer-el').innerHTML = locked ? `<button class="btn btn-primary" onclick="closeModal()">Sulje</button>`
        : `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-danger" onclick="submitHourConfirm('${month}', true)">Kiistä</button><button class="btn btn-primary" onclick="submitHourConfirm('${month}', false)"><i class="bi bi-check-lg"></i> Vahvista tunnit</button>`;
}
async function submitHourConfirm(month, dispute) {
    const res = await fetch('api.php?action=confirm_hours', { method: 'POST', body: JSON.stringify({ month, dispute: dispute ? 1 : 0, note: document.getElementById('hc-note').value }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    closeModal(); showToast(dispute ? 'Tunnit kiistetty – ylläpito käsittelee' : 'Tunnit vahvistettu'); state.hoursAdmin = null; load();
}

// ---------- Ylläpito: Tilastot → Tuntien hyväksyntä ----------
function hoursAdminMonth() { return state.hoursMonth || (() => { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })(); }
function shiftHoursMonth(dir) { const [y, m] = hoursAdminMonth().split('-').map(Number), d = new Date(y, m - 1 + dir, 1); state.hoursMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); state.hoursAdmin = null; render(); }
async function loadHoursAdmin() {
    const m = hoursAdminMonth(); state.hoursAdminLoading = m;
    try { const r = await (await fetch('api.php?action=hours_confirm&all=1&month=' + m)).json(); state.hoursAdmin = r.error ? { month: m, error: r.error } : r; } catch (e) { state.hoursAdmin = { month: m, error: 'Lataus epäonnistui' }; }
    render();
}
function renderHoursApproval() {
    const m = hoursAdminMonth();
    if ((!state.hoursAdmin || state.hoursAdmin.month !== m) && state.hoursAdminLoading !== m) loadHoursAdmin();
    const d = state.hoursAdmin && state.hoursAdmin.month === m ? state.hoursAdmin : null;
    let body;
    if (!d) body = '<div class="tool-empty">Ladataan…</div>';
    else if (d.error) body = `<div class="leave-box warn">${esc(d.error)}</div>`;
    else if (!d.rows.length) body = '<div class="tool-empty">Ei työtunteja tässä kuussa.</div>';
    else {
        const open = d.rows.filter(r => r.status === 'confirmed').length;
        body = `<div style="overflow-x:auto"><table class="data-table" style="width:100%; font-size:13px; border-collapse:collapse;"><thead><tr style="text-align:left; color:var(--text3)"><th>Työntekijä</th><th>Tunnit</th><th>Tila</th><th>Huomautus</th><th></th></tr></thead><tbody>
        ${d.rows.map(r => `<tr style="border-top:1px solid var(--border)"><td><b>${esc(r.name)}</b></td>
            <td>${Number(r.hours).toLocaleString('fi-FI', { maximumFractionDigits: 2 })} h${r.confirmed_hours !== null && Math.abs(r.confirmed_hours - r.hours) >= 0.05 ? `<br><small style="color:#F59E0B" title="Tunnit muuttuneet vahvistuksen jälkeen">vahvistettaessa ${Number(r.confirmed_hours).toLocaleString('fi-FI', { maximumFractionDigits: 2 })} h</small>` : ''}</td>
            <td>${hoursBadge(r.status)}${r.changed ? ' <small style="color:#F59E0B">muuttunut</small>' : ''}</td><td style="max-width:260px;">${esc(r.note || '')}${r.admin_note ? `<br><small style="color:var(--text3)">Ylläpito: ${esc(r.admin_note)}</small>` : ''}</td>
            <td style="white-space:nowrap;"><a class="btn btn-ghost btn-sm" href="api.php?action=payslip&month=${m}&user_id=${r.user_id}" title="Palkkaerittely PDF" aria-label="Palkkaerittely PDF"><i class="bi bi-file-earmark-pdf"></i></a> <button class="btn btn-primary btn-sm" onclick="decideHours(${r.user_id}, '${m}', 'approved')" ${r.status === 'approved' && !r.changed ? 'disabled' : ''}>Hyväksy</button>
                <button class="btn btn-ghost btn-sm" onclick="decideHours(${r.user_id}, '${m}', 'returned')" ${r.status === 'none' || r.status === 'returned' ? 'disabled' : ''}>Palauta</button></td></tr>`).join('')}</tbody></table></div>
        ${open ? `<div style="margin-top:12px;"><button class="btn btn-primary btn-sm" onclick="approveAllConfirmed('${m}')"><i class="bi bi-check2-all"></i> Hyväksy kaikki vahvistetut (${open})</button></div>` : ''}`;
    }
    return `<div class="card card-sm"><div class="section-header"><span class="section-title"><i class="bi bi-clipboard-check"></i> Tuntien hyväksyntä</span><div class="section-line"></div></div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Edellinen" onclick="shiftHoursMonth(-1)"><i class="bi bi-chevron-left"></i></button>
            <b style="flex:1; text-align:center; text-transform:capitalize">${monthLabel(m)}</b>
            <button class="btn btn-ghost btn-sm btn-icon" aria-label="Seuraava" onclick="shiftHoursMonth(1)"><i class="bi bi-chevron-right"></i></button></div>${body}</div>`;
}
async function decideHours(uid, month, decision) {
    let note = '';
    if (decision === 'returned') { note = prompt('Mitä työntekijän pitää korjata? (näkyy hänelle)', ''); if (note === null) return; }
    const res = await fetch('api.php?action=decide_hours', { method: 'POST', body: JSON.stringify({ user_id: uid, month, decision, note }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    showToast(decision === 'approved' ? 'Hyväksytty' : 'Palautettu'); state.hoursAdmin = null; render();
}
async function approveAllConfirmed(month) {
    const rows = (state.hoursAdmin && state.hoursAdmin.rows || []).filter(r => r.status === 'confirmed');
    if (!confirm(`Hyväksytäänkö ${rows.length} vahvistettua kuukauden tuntia?`)) return;
    for (const r of rows) await fetch('api.php?action=decide_hours', { method: 'POST', body: JSON.stringify({ user_id: r.user_id, month, decision: 'approved' }) });
    showToast('Hyväksytty'); state.hoursAdmin = null; render();
}
