// ===================== TIIMI: kiitokset, dokumentit, perehdytys, kyselyt =====================
const TEAM_TABS = [
    { id: 'kudos', label: 'Kiitokset', icon: 'bi-emoji-smile' },
    { id: 'docs', label: 'Dokumentit', icon: 'bi-file-earmark-text' },
    { id: 'onboarding', label: 'Perehdytys', icon: 'bi-list-check' },
    { id: 'surveys', label: 'Kyselyt', icon: 'bi-clipboard-data' }
];
function teamBadge(id) {
    const d = state.data, me = state.user.id;
    if (id === 'docs') return (d.documents || []).filter(x => x.requires_ack && !x.acked).length;
    if (id === 'onboarding') return (d.checklist_progress || []).filter(p => p.user_id == me && !p.completed_at).length;
    if (id === 'surveys') return (d.surveys || []).filter(s => s.status === 'open' && !s.answered).length;
    return 0;
}
function renderTeam() {
    let saved = null; try { saved = localStorage.getItem('barshift_team_tab'); } catch (e) {}
    const cur = TEAM_TABS.find(t => t.id === (state.teamTab || saved)) || TEAM_TABS[0];
    const body = { kudos: teamKudos, docs: teamDocs, onboarding: teamOnboarding, surveys: teamSurveys }[cur.id]();
    return `<div class="page-header"><div class="page-title">Tiimi</div></div>
        <div class="admin-tabs" role="tablist" aria-label="Tiimin osiot">${TEAM_TABS.map(t => { const n = teamBadge(t.id); return `<button class="admin-tab ${t.id === cur.id ? 'active' : ''}" role="tab" aria-selected="${t.id === cur.id}" onclick="setTeamTab('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span>${n ? `<span class="admin-tab-count">${n}</span>` : ''}</button>`; }).join('')}</div>
        <div role="tabpanel">${body}</div>`;
}
function setTeamTab(id) { state.teamTab = id; try { localStorage.setItem('barshift_team_tab', id); } catch (e) {} render(); }
const uName = id => { const u = (state.data.users || []).find(x => x.id == id); return u ? u.name : 'Poistettu käyttäjä'; };
async function postJson(action, body) {
    const r = await (await fetch('api.php?action=' + action, { method: 'POST', body: JSON.stringify(body) })).json();
    if (r.error) { showToast(r.error, 'error'); return null; }
    return r;
}

// ---- Kiitokset ----
function teamKudos() {
    const mates = (state.data.users || []).filter(u => u.id != state.user.id && u.role !== 'superadmin' && !u.anonymized_at);
    const wall = state.data.kudos || [], isAdmin = state.user.role === 'admin';
    return `<div class="card card-sm" style="max-width:640px; margin-bottom:16px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-emoji-smile"></i> Kiitä työkaveria</span><div class="section-line"></div></div>
        <div class="form-group" style="margin-bottom:10px;"><select id="kd-to" class="form-input"><option value="">Valitse työkaveri…</option>${mates.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
        <div style="display:flex; gap:8px;"><input id="kd-msg" class="form-input" maxlength="300" placeholder="Kiitos, että pelasit vuoron!" onkeydown="if(event.key==='Enter')sendKudos()"><button class="btn btn-primary" onclick="sendKudos()"><i class="bi bi-heart"></i> Lähetä</button></div>
    </div>
    ${wall.length ? wall.map(k => `<div class="card card-sm" style="max-width:640px; margin-bottom:10px; border-left:4px solid var(--accent2); display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div><div style="font-size:13px; color:var(--text2);"><b>${esc(uName(k.from_user))}</b> → <b>${esc(uName(k.to_user))}</b> · ${formatDate(k.created_at.slice(0, 10))}</div><div style="margin-top:4px;">🎉 ${esc(k.message)}</div></div>
        ${isAdmin || k.from_user == state.user.id ? `<button class="btn btn-ghost btn-sm btn-icon" aria-label="Poista" onclick="deleteItem(${k.id}, 'kudos')"><i class="bi bi-trash"></i></button>` : ''}</div>`).join('') : '<div class="tool-empty">Ei kiitoksia vielä – ole ensimmäinen! 🎉</div>'}`;
}
async function sendKudos() {
    const to = document.getElementById('kd-to').value, message = document.getElementById('kd-msg').value.trim();
    if (!to) return showToast('Valitse työkaveri', 'error');
    if (await postJson('kudos', { to_user_id: to, message })) { showToast('Kiitos lähetetty!'); load(); }
}

// ---- Dokumentit ----
function teamDocs() {
    const docs = state.data.documents || [], isAdmin = can('content.manage'), users = (state.data.users || []).filter(u => u.role !== 'superadmin' && !u.anonymized_at);
    const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' Mt' : Math.max(1, Math.round(n / 1024)) + ' kt';
    return `${isAdmin ? `<div class="card card-sm" style="max-width:640px; margin-bottom:16px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-upload"></i> Lisää dokumentti</span><div class="section-line"></div></div>
        <div class="form-group" style="margin-bottom:8px;"><input id="dc-title" class="form-input" maxlength="150" placeholder="Otsikko (esim. Avausohje)"></div>
        <div class="form-group" style="margin-bottom:8px;"><input id="dc-desc" class="form-input" maxlength="500" placeholder="Lyhyt kuvaus (valinn.)"></div>
        <div class="form-group" style="margin-bottom:8px;"><input id="dc-file" type="file" class="form-input" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
        <label class="abs-choice" style="margin-bottom:10px;"><input id="dc-ack" type="checkbox"><span><b>Vaadi kuittaus</b> – työntekijän pitää merkitä dokumentti luetuksi</span></label>
        <button class="btn btn-primary" onclick="uploadDocument()"><i class="bi bi-cloud-upload"></i> Lisää</button></div>` : ''}
    ${docs.length ? docs.map(d => `<div class="card card-sm" style="max-width:640px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; flex-wrap:wrap;">
            <div style="min-width:0;"><b><i class="bi ${d.mime === 'application/pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-image'}"></i> ${esc(d.title)}</b>${d.description ? `<div style="font-size:13px; color:var(--text2);">${esc(d.description)}</div>` : ''}<small style="color:var(--text3);">${kb(d.size)} · ${formatDate(d.created_at.slice(0, 10))}${d.requires_ack ? ' · vaatii kuittauksen' : ''}</small></div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;"><a class="btn btn-ghost btn-sm" href="api.php?action=doc_file&id=${d.id}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Avaa</a>
            ${d.requires_ack ? (d.acked ? '<span class="badge badge-teal" style="align-self:center;">Kuitattu ✓</span>' : `<button class="btn btn-primary btn-sm" onclick="ackDocument(${d.id})"><i class="bi bi-check2"></i> Kuittaa luetuksi</button>`) : ''}
            ${isAdmin ? `<button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteItem(${d.id}, 'document')"><i class="bi bi-trash"></i></button>` : ''}</div></div>
        ${isAdmin && d.requires_ack ? `<div style="font-size:12px; color:var(--text2); margin-top:8px;">Kuitannut ${d.acked_by.length}/${users.length}${d.acked_by.length < users.length ? ' · puuttuu: ' + users.filter(u => !d.acked_by.includes(u.id)).map(u => esc(u.name)).join(', ') : ' ✓'}</div>` : ''}</div>`).join('') : '<div class="tool-empty">Ei dokumentteja</div>'}`;
}
async function uploadDocument() {
    const f = document.getElementById('dc-file').files[0], title = document.getElementById('dc-title').value.trim();
    if (!title || !f) return showToast('Anna otsikko ja valitse tiedosto', 'error');
    const fd = new FormData(); fd.append('title', title); fd.append('description', document.getElementById('dc-desc').value); fd.append('requires_ack', document.getElementById('dc-ack').checked ? '1' : '0'); fd.append('file', f);
    const r = await (await fetch('api.php?action=document', { method: 'POST', body: fd })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Dokumentti lisätty'); load();
}
async function ackDocument(id) { if (await postJson('ack_document', { id })) { showToast('Kuitattu'); load(); } }

// ---- Perehdytys ----
function teamOnboarding() {
    const isAdmin = can('content.manage'), prog = state.data.checklist_progress || [], lists = state.data.checklists || [];
    const bar = (p) => { const n = p.items.length, d = p.done.filter(i => i < n).length; return { n, d, pct: Math.round(d / n * 100) }; };
    const mine = prog.filter(p => p.user_id == state.user.id);
    let html = mine.length ? mine.map(p => { const b = bar(p); return `<div class="card card-sm" style="max-width:640px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;"><b>${esc(p.name)}</b><span class="badge ${p.completed_at ? 'badge-teal' : ''}">${b.d}/${b.n}</span></div>
        <div style="height:6px; background:var(--surface2); border-radius:6px; margin:8px 0 10px;"><div style="height:6px; width:${b.pct}%; background:var(--teal); border-radius:6px;"></div></div>
        ${p.items.map((t, i) => `<label style="display:flex; gap:8px; align-items:flex-start; padding:5px 0; font-size:14px; cursor:pointer;"><input type="checkbox" ${p.done.includes(i) ? 'checked' : ''} onchange="toggleChecklist(${p.id}, ${i})" style="margin-top:3px;"><span style="${p.done.includes(i) ? 'text-decoration:line-through; color:var(--text3);' : ''}">${esc(t)}</span></label>`).join('')}</div>`; }).join('')
        : `<div class="tool-empty">${isAdmin ? 'Sinulla ei ole tehtävälistoja.' : 'Ei tehtävälistoja sinulle. Kun ylläpito antaa sinulle perehdytyslistan, se näkyy tässä.'}</div>`;
    if (!isAdmin) return html;
    const users = (state.data.users || []).filter(u => u.role !== 'superadmin' && !u.anonymized_at);
    html += `<div class="section-header" style="margin-top:24px;"><span class="section-title">Listojen hallinta</span><div class="section-line"></div></div>
    <div class="card card-sm" style="max-width:640px; margin-bottom:14px;">
        <div class="form-group" style="margin-bottom:8px;"><input id="cl-name" class="form-input" maxlength="100" placeholder="Listan nimi (esim. Uuden työntekijän perehdytys)"></div>
        <div class="form-group" style="margin-bottom:8px;"><textarea id="cl-items" class="form-input" rows="5" placeholder="Yksi kohta per rivi&#10;Kävi läpi hätäpoistumisreitit&#10;Kassajärjestelmän opastus&#10;Alkoholilain kertaus"></textarea></div>
        <button class="btn btn-primary" onclick="saveChecklist()"><i class="bi bi-plus-lg"></i> Luo lista</button></div>
    ${lists.map(c => { const rows = prog.filter(p => p.checklist_id == c.id); return `<div class="card card-sm" style="max-width:640px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap;"><b>${esc(c.name)}</b> <small style="color:var(--text3);">${c.items.length} kohtaa</small>
            <div style="display:flex; gap:6px;"><select id="as-${c.id}" class="form-input" style="padding:6px 10px; width:auto;"><option value="">Anna työntekijälle…</option>${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><button class="btn btn-ghost btn-sm" onclick="assignChecklist(${c.id})">Anna</button><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteItem(${c.id}, 'checklist')"><i class="bi bi-trash"></i></button></div></div>
        ${rows.length ? `<div style="margin-top:8px; font-size:13px;">${rows.map(p => { const b = bar(p); return `<div style="display:flex; justify-content:space-between; padding:3px 0; border-top:1px solid var(--border);"><span>${esc(uName(p.user_id))}</span><span style="color:${p.completed_at ? 'var(--teal)' : 'var(--text2)'}">${b.d}/${b.n}${p.completed_at ? ' ✓' : ''}</span></div>`; }).join('')}</div>` : ''}</div>`; }).join('')}`;
    return html;
}
async function saveChecklist() {
    const name = document.getElementById('cl-name').value.trim(), items = document.getElementById('cl-items').value.split('\n');
    if (await postJson('checklist', { name, items })) { showToast('Lista luotu'); load(); }
}
async function assignChecklist(cid) {
    const uid = document.getElementById('as-' + cid).value; if (!uid) return showToast('Valitse työntekijä', 'error');
    if (await postJson('assign_checklist', { checklistId: cid, userId: uid })) { showToast('Lista annettu'); load(); }
}
async function toggleChecklist(pid, index) { if (await postJson('checklist_toggle', { progressId: pid, index })) load(); }

// ---- Nimettömät kyselyt ----
function teamSurveys() {
    const isAdmin = can('content.manage'), list = state.data.surveys || [];
    const stars = (id) => [1, 2, 3, 4, 5].map(n => `<label style="cursor:pointer; font-size:24px;"><input type="radio" name="sv-${id}" value="${n}" style="display:none;" onchange="this.parentElement.parentElement.querySelectorAll('span').forEach((s,i)=>s.textContent=i<${n}?'★':'☆')"><span>☆</span></label>`).join('');
    let html = '<p style="font-size:13px; color:var(--text2); max-width:640px;"><i class="bi bi-incognito"></i> Vastaukset ovat nimettömiä: järjestelmä ei tallenna, kuka vastasi mitä. Ylläpito näkee tulokset vasta, kun vastauksia on vähintään 3.</p>';
    if (isAdmin) html += `<div class="card card-sm" style="max-width:640px; margin-bottom:14px;"><div style="display:flex; gap:8px;"><input id="sv-q" class="form-input" maxlength="300" placeholder="Uusi kysymys (esim. Kuinka tyytyväinen olet työvuoroihisi?)"><button class="btn btn-primary" onclick="createSurvey()"><i class="bi bi-plus-lg"></i> Luo</button></div></div>`;
    html += list.length ? list.map(s => `<div class="card card-sm" style="max-width:640px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;"><b>${esc(s.question)}</b><span class="badge ${s.status === 'open' ? 'badge-teal' : ''}">${s.status === 'open' ? 'Auki' : 'Suljettu'}</span></div>
        ${s.status === 'open' && !s.answered ? `<div style="margin:10px 0 6px;">${stars(s.id)}</div><input id="svc-${s.id}" class="form-input" maxlength="500" placeholder="Kommentti (valinnainen, nimetön)" style="margin-bottom:8px;"><button class="btn btn-primary btn-sm" onclick="answerSurvey(${s.id})">Lähetä vastaus</button>`
            : (s.answered ? '<div style="font-size:13px; color:var(--teal); margin-top:6px;">Olet vastannut ✓ Kiitos!</div>' : '')}
        ${isAdmin ? `<div style="margin-top:10px; border-top:1px solid var(--border); padding-top:8px; font-size:13px;">
            ${s.results ? `${s.results.avg !== null ? `<div>Keskiarvo <b>${s.results.avg}</b> / 5 (${s.results.rated} arvosanaa)</div><div style="display:flex; gap:4px; align-items:flex-end; height:44px; margin:6px 0;">${s.results.dist.map((c, i) => `<div title="${i + 1}★: ${c}" style="flex:1; text-align:center; font-size:10px;"><div style="background:var(--teal); height:${Math.max(3, c / Math.max(...s.results.dist, 1) * 34)}px; border-radius:3px;"></div>${i + 1}★</div>`).join('')}</div>` : ''}
                ${s.results.comments.length ? `<div style="color:var(--text2);">${s.results.comments.map(c => `<div style="padding:4px 0; border-top:1px solid var(--border);">“${esc(c)}”</div>`).join('')}</div>` : ''}`
                : `<span style="color:var(--text3);">${s.answer_count} vastausta – tulokset näkyvät, kun niitä on vähintään 3.</span>`}
            <div style="margin-top:8px; display:flex; gap:6px;"><button class="btn btn-ghost btn-sm" onclick="closeSurvey(${s.id}, ${s.status === 'open' ? 'false' : 'true'})">${s.status === 'open' ? 'Sulje kysely' : 'Avaa uudelleen'}</button><button class="btn btn-danger btn-sm btn-icon" aria-label="Poista" onclick="deleteItem(${s.id}, 'survey')"><i class="bi bi-trash"></i></button></div></div>` : ''}</div>`).join('')
        : '<div class="tool-empty">Ei kyselyjä</div>';
    return html;
}
async function createSurvey() { if (await postJson('survey', { question: document.getElementById('sv-q').value.trim() })) { showToast('Kysely luotu'); load(); } }
async function closeSurvey(id, reopen) { if (await postJson('close_survey', { id, reopen })) load(); }
async function answerSurvey(id) {
    const sel = document.querySelector(`input[name="sv-${id}"]:checked`);
    if (await postJson('survey_answer', { surveyId: id, rating: sel ? sel.value : '', comment: document.getElementById('svc-' + id).value })) { showToast('Kiitos vastauksesta!'); load(); }
}
