if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW rekisteröinti epäonnistui', err));
}
// Asennettava sovellus: Android/Chrome tarjoaa asennuksen napilla, iPhonella ohje; sovelluskuvakkeen merkki nollataan avattaessa
let bsInstallEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); bsInstallEvt = e; const b = document.getElementById('install-box'); if (b) b.style.display = ''; });
window.addEventListener('appinstalled', () => { bsInstallEvt = null; const b = document.getElementById('install-box'); if (b) b.style.display = 'none'; });
function bsIsStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
async function bsInstallApp() { if (!bsInstallEvt) return; bsInstallEvt.prompt(); try { await bsInstallEvt.userChoice; } catch (e) {} bsInstallEvt = null; const b = document.getElementById('install-box'); if (b) b.style.display = 'none'; }
function bsClearBadge() { try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') bsClearBadge(); });
bsClearBadge();

const savedTheme = localStorage.getItem('barshift_theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);

function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('barshift_theme', next);
}

function getLocalDateString(dateObj = new Date()) {
    const d = new Date(dateObj);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}


// ===================== XSS-SUOJAUS =====================
function esc(v) {
    return String(v ?? '').replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}
// Turvallinen JS-merkkijono HTML-attribuutin (onclick) sisälle
function escJs(v) { return esc(JSON.stringify(String(v ?? ''))); }
// Sallitaan vain palvelimen omat kuvapolut
function safeImg(p) { return /^uploads\/[A-Za-z0-9_\/.-]+$/.test(p || '') && !p.includes('..') ? p : ''; }

const PUB_DEFAULTS = { name: '', timezone: 'Europe/Helsinki', roles: ['Baarimestari', 'Järjestyksenvalvoja', 'Tarjoilija', 'Vuoropäällikkö'], min_rest_hours: 11, max_week_hours: null,
    features: { tickets: false, bookings: false }, booking: { capacity: 30, max_party: 8, slot_minutes: 30, duration_minutes: 120, lead_hours: 2, days_ahead: 60, auto_confirm: true, hours: [] }, require_2fa: false, evening_start: 18, night_end: 6, overtime_week_hours: 40, weekly_budget: null, retention_months: 60, side_cost_pct: 0, reminder_hours: 3, clock_alert_minutes: 0, bonuses: { evening: 1.33, night: 2.25, sat: 5.39, sun: 2 } };
function pubCfg() { return Object.assign({}, PUB_DEFAULTS, (state.data && state.data.pub) || {}); }

function getRoleIcon(role) {
    if (role === 'Baarimestari') return '🍸';
    if (role === 'Järjestyksenvalvoja') return '🛡️';
    if (role === 'Tarjoilija') return '👤';
    return '📋';
}

window.currentChatPartnerId = null;

const state = {
    user: JSON.parse(localStorage.getItem('barshift_user')) || null,
    view: (() => { const q = new URLSearchParams(location.search).get('view'); return ['dashboard', 'calendar', 'list', 'events', 'messages', 'stats', 'absences', 'team'].includes(q) ? q : (localStorage.getItem('barshift_view') || 'dashboard'); })(), 
    onlyMine: false, currentDate: new Date(),
    shiftGridDate: new Date(),
    startDate: getLocalDateString(new Date(new Date().setMonth(new Date().getMonth() - 1))),
    endDate: getLocalDateString(new Date(new Date().setMonth(new Date().getMonth() + 1))),
    selectedUserId: 'all', statsStart: '', statsEnd: '', statsUserId: 'all',
    eventsUpcomingLimit: 5, eventsPastLimit: 5, timeEntriesLimit: 10,
    shiftsUpcomingLimit: 15, shiftsPastLimit: 15,
    availabilityMode: false,
    data: { users:[], shifts:[], events:[], trades:[], absences:[], notices:[], pubs:[], stats:{}, time_entries:[], availability:[], tasks:[], task_completions:[], cash_recent: [], perms: [], shift_bids: [], hour_conf: [], skills: [], user_skills: [], system_alerts: [], event_guests: [], access_roles: [], shift_logs: [], shopping_list: [], job_listings: [], private_messages: [] },
    editingEvent: null, editingAbsence: null, editingShift: null, editingUser: null, editingJob: null, editingTask: null, editingShopItem: null, editingLog: null, editingNotice: null, editingTimeEntry: null,
    showFullLogHistory: false, showAllAdminJobs: false, showAllAdminNotices: false
};

// ===================== MODAL HANDLERS =====================
function openModal(title, icon, bodyHTML, footerHTML) {
    document.getElementById('modal-title-el').innerHTML = `<i class="bi ${icon}" style="color:var(--accent);"></i> ${title}`;
    document.getElementById('modal-body-el').innerHTML = bodyHTML;
    document.getElementById('modal-footer-el').innerHTML = footerHTML;
    
    // Piilotetaan footer jos se on tyhjä (Chattia varten)
    document.getElementById('modal-footer-el').style.display = footerHTML === '' ? 'none' : 'flex';

    document.getElementById('modal-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.body.style.overflow = '';
    state.editingShift = null; state.editingEvent = null; state.editingAbsence = null; 
    state.editingUser = null; state.editingJob = null; state.editingTask = null;
    state.editingShopItem = null; state.editingLog = null; state.editingNotice = null;
    state.editingTimeEntry = null;
    window.currentChatPartnerId = null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ===================== WAGE CALCULATION HELPER =====================
function calculateWageParts(d1, d2, baseWageStr) {
    let normalHours = 0, eveningHours = 0, nightHours = 0, saturdayHours = 0, sundayHours = 0;
    let current = new Date(d1);
    const baseWage = parseFloat(baseWageStr) || 0;
    const cfg = pubCfg();
    
    while(current < d2) {
        let next = new Date(current);
        next.setMinutes(current.getMinutes() + 15);
        if (next > d2) next = d2;
        
        let diffHours = (next - current) / (1000 * 60 * 60);
        let hour = current.getHours();
        let day = current.getDay();
        
        if (hour >= cfg.evening_start && hour < 24) eveningHours += diffHours;
        if (hour >= 0 && hour < cfg.night_end) nightHours += diffHours;
        if (day === 6) saturdayHours += diffHours;
        if (day === 0) sundayHours += diffHours;
        
        normalHours += diffHours;
        current = next;
    }
    return { normalHours, eveningHours, nightHours, saturdayHours, sundayHours, baseWage };
}

// ==== BACKGROUND UPDATE ====
async function loadSilent() {
    if (!state.user) return;
    try {
        const res = await fetch(`api.php?_t=${Date.now()}`);
        const nowOffline = res.headers.get('X-BarShift-Offline') === '1'; if (nowOffline !== !!state.offline) { state.offline = nowOffline; render(); }
        const text = await res.text();
        const data = JSON.parse(text);
        if (res.status === 401) { forceLogout(); return; }
        if (data.error) return;

        let dataChanged = false;

        {
            const newData = {
                users: data.users || [], shifts: data.shifts || [], events: data.events || [],
                pub: data.pub || null, shift_templates: data.shift_templates || [], week_templates: data.week_templates || [], staffing_rules: data.staffing_rules || [], bookings: data.bookings || [], event_regs: data.event_regs || {}, checklists: data.checklists || [], checklist_progress: data.checklist_progress || [], documents: data.documents || [], kudos: data.kudos || [], surveys: data.surveys || [], coverage: data.coverage || [], availability_rules: data.availability_rules || [], trades: data.trades || [], absences: data.absences || [], notices: data.notices || [],
                time_entries: data.time_entries || [], availability: data.availability || [],
                tasks: data.tasks || [], task_completions: data.task_completions || [], cash_recent: data.cash_recent || [], perms: data.perms || [], shift_bids: data.shift_bids || [], hour_conf: data.hour_conf || [], skills: data.skills || [], user_skills: data.user_skills || [], system_alerts: data.system_alerts || [], event_guests: data.event_guests || [], access_roles: data.access_roles || [],
                shift_logs: data.shift_logs || [], shopping_list: data.shopping_list || [],
                private_messages: data.private_messages || []
            };
            if (JSON.stringify(state.data) !== JSON.stringify(newData)) {
                state.data = newData;
                dataChanged = true;
            }
        }
        
        if (dataChanged) {
            if (!state.editingEvent && !state.editingAbsence && !state.editingShift && !state.editingUser && !state.editingJob && !state.editingTask && !state.editingShopItem && !state.editingLog && !state.editingNotice && !state.editingTimeEntry) {
                render();
            }
            if (document.getElementById('modal-overlay').classList.contains('open') && window.currentChatPartnerId) {
                renderChatModalContent(true); 
            }
        }
    } catch(e) {}
}

setInterval(loadSilent, 10000);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadSilent();
});
window.addEventListener('focus', loadSilent);

async function load() {
    state.forecast = null; state.hourBank = null;   // tiedot ovat muuttuneet: lasketaan uudelleen tarvittaessa
    if (!state.user) { render(); return; }
    try {
        const res = await fetch(`api.php?_t=${Date.now()}`);
        const wasOffline = state.offline; state.offline = res.headers.get('X-BarShift-Offline') === '1';
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            if (res.status === 401) { forceLogout(); return; }
            if (data.need_2fa) { state.need2fa = true; render(); return; }
            if (state.need2fa) state.need2fa = false;
            if (data.error) return showToast(data.error, 'error');
            {
                state.data = {
                    users: data.users || [], shifts: data.shifts || [], events: data.events || [],
                    pub: data.pub || null, shift_templates: data.shift_templates || [], week_templates: data.week_templates || [], staffing_rules: data.staffing_rules || [], bookings: data.bookings || [], event_regs: data.event_regs || {}, checklists: data.checklists || [], checklist_progress: data.checklist_progress || [], documents: data.documents || [], kudos: data.kudos || [], surveys: data.surveys || [], coverage: data.coverage || [], availability_rules: data.availability_rules || [], trades: data.trades || [], absences: data.absences || [], notices: data.notices || [],
                    time_entries: data.time_entries || [], availability: data.availability || [],
                    tasks: data.tasks || [], task_completions: data.task_completions || [], cash_recent: data.cash_recent || [], perms: data.perms || [], shift_bids: data.shift_bids || [], hour_conf: data.hour_conf || [], skills: data.skills || [], user_skills: data.user_skills || [], system_alerts: data.system_alerts || [], event_guests: data.event_guests || [], access_roles: data.access_roles || [],
                    shift_logs: data.shift_logs || [], shopping_list: data.shopping_list || [],
                    private_messages: data.private_messages || []
                };
            }
            render();
        } catch(e) {
            console.error('BarShift: datan käsittely epäonnistui', e, (text || '').slice(0, 400));
            const parsed = (() => { try { JSON.parse(text); return true; } catch (x) { return false; } })();
            showToast('Virhe datan latauksessa' + (parsed ? ' (näkymän piirto: ' + (e && e.message ? e.message : e) + ')' : ' (palvelin palautti virheen, HTTP ' + res.status + ')'), 'error');
        }
    } catch(e) { showToast('Verkkovirhe. Tarkista netti.', 'error'); }
}
window.addEventListener('online', () => { if (state.user && state.offline) load(); });
window.addEventListener('offline', () => { if (state.user) { state.offline = true; render(); } });

function showToast(msg, type='success') {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = `show ${type}`;
    setTimeout(() => { t.className = ''; }, 4000);
}

function render() {
    const root = document.getElementById('app');
    if (!state.user) { root.innerHTML = renderLogin(); return; }
    if (state.need2fa) { root.innerHTML = renderForced2fa(); return; }
    
    const isAdmin = state.user.role === 'admin';
    const themeIcon = document.body.getAttribute('data-theme') === 'dark' ? 'bi-sun' : 'bi-moon';
    
    const logoHtml = `<div class="nav-logo-text">Bar<span>Shift</span></div>`;
    
    const unreadMsgCount = (state.data.private_messages || []).filter(m => m.receiver_id == state.user.id && m.is_read == 0).length;
    const msgBadge = unreadMsgCount > 0 ? `<div style="position:absolute; top:4px; right:10%; background:#E11D48; color:white; font-size:9px; border-radius:50%; width:16px; height:16px; display:flex; align-items:center; justify-content:center; font-weight:bold; box-shadow:0 2px 4px rgba(225,29,72,0.3); pointer-events:none;">${unreadMsgCount}</div>` : '';
    
    let navHtml = '';
    {
        navHtml = `
            <button class="nav-btn ${state.view==='dashboard'?'active':''}" onclick="nav('dashboard')"><i class="bi bi-house-door"></i><span>Koti</span></button>
            <button class="nav-btn ${state.view==='calendar'?'active':''}" onclick="nav('calendar')"><i class="bi bi-calendar-week"></i><span>Kalenteri</span></button>
            <button class="nav-btn ${state.view==='list'?'active':''}" onclick="nav('list')"><i class="bi bi-layout-text-sidebar"></i><span>Vuorot</span></button>
            <button class="nav-btn ${state.view==='events'?'active':''}" onclick="nav('events')"><i class="bi bi-music-note-beamed"></i><span>Tapahtumat</span></button>
            <button class="nav-btn ${state.view==='messages'?'active':''}" onclick="nav('messages')"><i class="bi bi-chat-dots"></i><span>Viestit</span>${msgBadge}</button>
            <button class="nav-btn ${state.view==='stats'?'active':''}" onclick="nav('stats')"><i class="bi bi-graph-up"></i><span>Tilastot</span></button>
            <button class="nav-btn ${state.view==='absences'?'active':''}" onclick="nav('absences')"><i class="bi bi-calendar-x"></i><span>Poissaolot</span></button>
            <button class="nav-btn ${state.view==='team'?'active':''}" onclick="nav('team')"><i class="bi bi-people-fill"></i><span>Tiimi</span></button>
			${isAdmin || ADMIN_TABS.some(canAdminTab) ? `<button class="nav-btn ${state.view==='admin'?'active':''}" onclick="nav('admin')"><i class="bi bi-people"></i><span>Hallinta</span></button>` : ''}
        `;
    }

    const topBtns = `
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openLanguageMenu()" title="Kieli / Language" aria-label="Kieli / Language" data-no-i18n style="font-size:11px; font-weight:700;">${bsLang().toUpperCase()}</button>
        ${'<button class="btn btn-ghost btn-icon btn-sm" onclick="openSearch()" title="Haku (Ctrl+K)" aria-label="Haku"><i class="bi bi-search"></i></button>'}
        <a class="btn btn-ghost btn-icon btn-sm" href="barshift_ohjeet.html" target="_blank" rel="noopener" title="Ohjeet" aria-label="Ohjeet"><i class="bi bi-question-circle"></i></a>
        ${`<button class="btn btn-ghost btn-icon btn-sm ${state.view==='profile'?'top-active':''}" onclick="nav('profile')" title="Profiili" aria-label="Profiili"><i class="bi bi-person-badge"></i></button>`}
        <button class="btn btn-ghost btn-icon btn-sm" onclick="toggleTheme()" title="Vaihda teema" aria-label="Vaihda teema"><i class="bi ${themeIcon}"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm top-logout" onclick="logout()" title="Kirjaudu ulos" aria-label="Kirjaudu ulos"><i class="bi bi-box-arrow-right"></i></button>`;

    root.innerHTML = `
        <div class="app-container">
            <nav class="nav-bar">
                <div class="nav-logo">
                    ${logoHtml}
                    <div class="user-info-badge" style="margin-top: 12px; display: inline-block;">
                        ${esc(state.user.username)}@${esc(state.user.pub_name)}
                    </div>
                    
                </div>
                ${navHtml}
            </nav>
            <div class="content-col">
                <header class="top-bar">
                    <div class="top-logo">${logoHtml}</div>
                    <div class="top-actions">
                        
                        <div class="user-info-badge top-badge">${esc(state.user.username)}@${esc(state.user.pub_name)}</div>
                        ${topBtns}
                    </div>
                </header>
                ${state.offline ? '<div class="offline-banner"><i class="bi bi-wifi-off"></i> Ei verkkoyhteyttä – näytetään viimeksi ladatut tiedot. Muutokset eivät tallennu ennen kuin yhteys palaa.</div>' : ''}
                <main class="main-content">${renderView()}</main>
            </div>
        </div>
    `;
}

function nav(v) { 
    state.view = v; localStorage.setItem('barshift_view', v); 
    closeModal();
    state.eventsUpcomingLimit = 5; state.eventsPastLimit = 5;
    state.availabilityMode = false;
    render(); 
}

function forceLogout() {
    clearOfflineCache();
    state.user = null; localStorage.removeItem('barshift_user'); localStorage.removeItem('barshift_view');
    closeModal(); render(); showToast('Istunto päättyi, kirjaudu uudelleen', 'error');
}

function clearOfflineCache() { try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'clear' }); } catch (e) {} }
function logout() { 
    clearOfflineCache();
    fetch('api.php?action=logout', { method: 'POST' }).catch(() => {});
    state.user = null; state.data = { users:[], shifts:[], events:[], trades:[], absences:[], notices:[], pubs:[], stats:{}, time_entries:[], availability:[], tasks:[], task_completions:[], cash_recent: [], perms: [], shift_bids: [], hour_conf: [], skills: [], user_skills: [], system_alerts: [], event_guests: [], access_roles: [], shift_logs: [], shopping_list: [], job_listings: [], private_messages: [] };
    closeModal();
    localStorage.removeItem('barshift_user'); localStorage.removeItem('barshift_view'); render(); 
}

function renderView() {
    switch(state.view) {
        case 'dashboard': return renderDashboard();
        case 'calendar': return renderCalendar();
        case 'list': return renderShifts();
        case 'events': return renderEvents();
        case 'messages': return renderMessages();
        case 'stats': return renderStats();
        case 'absences': return renderAbsences();
        case 'team': return renderTeam();
        case 'admin': return renderAdmin();
        case 'profile': return renderProfile();
        default: return renderDashboard();
    }
}


// Pakotettu 2FA: baari vaatii ylläpitäjiltä kaksivaiheisen tunnistautumisen; ennen käyttöönottoa näytetään vain tämä
function renderForced2fa() {
    return `<div class="login-page"><div class="login-card" style="max-width:520px;">
        <div class="login-logo">Bar<span>Shift</span></div>
        <div class="card"><div class="warn-box"><b><i class="bi bi-shield-lock"></i> Kaksivaiheinen tunnistautuminen vaaditaan</b><br>Baarisi on määrittänyt, että ylläpitäjien on käytettävä kaksivaiheista tunnistautumista. Ota se käyttöön nyt jatkaaksesi.</div>
        ${renderTwoFactorCard(state.user)}
        <button class="btn btn-ghost btn-sm" style="margin-top:8px;" onclick="logout()">Kirjaudu ulos</button></div></div></div>`;
}
