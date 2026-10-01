// ===================== JÄRJESTELMÄN TILA (Hallinta → Järjestelmä) =====================
async function loadSystemStatus() {
    state.systemLoading = true;
    try { const r = await (await fetch('api.php?action=system_status')).json(); state.systemStatus = r.error ? { error: r.error } : r; }
    catch (e) { state.systemStatus = { error: 'Lataus epäonnistui' }; }
    state.systemLoading = false; render();
}
function adminTabSystem() {
    if (!state.systemStatus && !state.systemLoading) loadSystemStatus();
    const s = state.systemStatus;
    if (!s) return '<div class="tool-empty">Ladataan…</div>';
    if (s.error) return `<div class="leave-box warn">${esc(s.error)}</div>`;
    const dot = ok => `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${ok === null ? 'var(--text3)' : ok ? 'var(--teal)' : '#E11D48'}; margin-right:6px;"></span>`;
    const ago = m => m === null ? 'ei koskaan' : m < 90 ? m + ' min sitten' : m < 2880 ? Math.round(m / 60) + ' h sitten' : Math.round(m / 1440) + ' pv sitten';
    const row = (ok, label, value, sub) => `<div style="display:flex; gap:10px; align-items:flex-start; padding:10px 0; border-top:1px solid var(--border);"><div style="flex:1">${dot(ok)}<b>${label}</b>${sub ? `<div style="font-size:12px; color:var(--text3); margin-left:16px;">${sub}</div>` : ''}</div><div style="text-align:right; font-size:13px;">${value}</div></div>`;
    const cronOk = s.cron.age_minutes === null ? null : s.cron.age_minutes <= s.cron.max_minutes;
    const bkOk = !s.backup.expected ? null : (s.backup.age_hours !== null && s.backup.age_hours <= s.backup.max_hours);
    return `<div class="card card-sm">
        <div class="section-header"><span class="section-title"><i class="bi bi-heart-pulse"></i> Järjestelmän tila</span><div class="section-line"></div></div>
        ${s.alerts.length ? s.alerts.map(a => `<div class="leave-box ${a.level === 'error' ? 'warn' : ''}" style="margin-bottom:8px;"><i class="bi bi-exclamation-triangle"></i> ${esc(a.text)}</div>`).join('') : '<div class="leave-box" style="margin-bottom:8px;"><i class="bi bi-check2-circle"></i> Kaikki kunnossa.</div>'}
        ${row(cronOk, 'Ajastettu ajo (cron.php)', ago(s.cron.age_minutes), 'Muistutukset, hälytykset ja sähköpostijono. Pitäisi ajaa n. 10 min välein.')}
        ${row(bkOk, 'Varmuuskopio', s.backup.last_ok ? ago(Math.round(s.backup.age_hours * 60)) : (s.backup.expected ? 'ei koskaan' : 'ei seurannassa'), s.backup.info ? esc(s.backup.info) : 'tools/backup.sh kirjaa onnistuneen ajon tähän (cron esim. 17 2 * * *).')}
        ${row(s.mail.failed ? false : true, 'Sähköpostijono', `${s.mail.pending} odottaa${s.mail.failed ? `, <b style="color:#E11D48">${s.mail.failed} epäonnistunutta</b>` : ''}`)}
        ${row(s.migrations.applied >= s.migrations.available, 'Tietokannan migraatiot', `${s.migrations.applied} / ${s.migrations.available}`)}
        ${row(s.disk ? (s.disk.free_pct === null || s.disk.free_pct >= 5) : null, 'Levytila', s.disk ? `${s.disk.free_gb} GB vapaana${s.disk.free_pct !== null ? ' (' + s.disk.free_pct + ' %)' : ''}` : '–')}
        ${row(null, 'PHP', esc(s.php))}
        <div style="font-size:12px; color:var(--text3); margin-top:12px;">Ulkoinen valvonta: lisää config.php:hen <code>'health_key' => 'pitkä-satunnainen-avain'</code> ja valvo osoitetta <code>api.php?action=health&amp;key=…</code> (200 = kunnossa, 503 = ongelma) esim. UptimeRobotilla.</div>
        <div style="margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="state.systemStatus=null; render()"><i class="bi bi-arrow-clockwise"></i> Päivitä</button></div>
    </div>`;
}
