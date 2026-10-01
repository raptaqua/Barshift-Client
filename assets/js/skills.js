// ===================== OSAAMISMATRIISI (Hallinta → Osaaminen) =====================
// Osaamiset (esim. Ovi, Anniskelu, Kahvikone) voi sitoa vuoron rooliin: jos vuoroon asetetulta puuttuu osaaminen tai se on vanhentunut, vuoroon tulee varoitus (ei esto).
function userSkill(uid, sid) { return (state.data.user_skills || []).find(x => x.user_id == uid && x.skill_id == sid) || null; }
function adminTabSkills() {
    const skills = state.data.skills || [], users = (state.data.users || []).filter(u => !u.anonymized_at);
    const today = getLocalDateString();
    const cell = (u, s) => {
        const us = userSkill(u.id, s.id);
        if (!us) return `<td style="text-align:center;"><button class="btn btn-ghost btn-sm" style="opacity:.35" aria-label="Lisää osaaminen" onclick="openUserSkill(${u.id}, ${s.id})">–</button></td>`;
        const expired = us.valid_until && us.valid_until < today, soon = us.valid_until && !expired && us.valid_until <= getLocalDateString(new Date(Date.now() + 60 * 864e5));
        return `<td style="text-align:center;"><button class="btn btn-ghost btn-sm" style="color:${expired ? '#E11D48' : soon ? '#F59E0B' : 'var(--teal)'}" title="${us.valid_until ? 'Voimassa ' + fullDate(us.valid_until) : 'Ei vanhene'}" onclick="openUserSkill(${u.id}, ${s.id})"><i class="bi ${expired ? 'bi-x-circle' : 'bi-check-circle-fill'}"></i>${us.valid_until ? `<small style="display:block; font-size:10px">${us.valid_until.slice(2, 7).split('-').reverse().join('/')}</small>` : ''}</button></td>`;
    };
    const card = (icon, ok, exp) => { const d = exp && exp < today; return ok ? `<i class="bi ${d ? 'bi-x-circle' : 'bi-check-circle-fill'}" style="color:${d ? '#E11D48' : 'var(--teal)'}" title="${exp ? 'Voimassa ' + fullDate(exp) : ''}"></i>` : '<span style="opacity:.35">–</span>'; };
    return `<div class="card card-sm">
        <div class="section-header"><span class="section-title"><i class="bi bi-award"></i> Osaamismatriisi</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 10px;">Merkitse, kuka osaa mitäkin. Kun osaaminen on sidottu vuoron rooliin, suunnittelija saa varoituksen jos vuoroon asetetulta työntekijältä puuttuu se tai se on vanhentunut. Napauta ruutua merkitäksesi osaamisen ja voimassaolon.</p>
        <div style="display:flex; gap:8px; margin-bottom:12px;"><button class="btn btn-primary btn-sm" onclick="openSkillModal()"><i class="bi bi-plus-lg"></i> Uusi osaaminen</button></div>
        <div style="overflow-x:auto"><table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead><tr style="text-align:center; color:var(--text3);"><th style="text-align:left;">Työntekijä</th>
                <th title="Hygieniapassi">Hygieniapassi</th><th title="Anniskelupassi">Anniskelupassi</th><th title="Järjestyksenvalvojan kortti">JV-kortti</th>
                ${skills.map(s => `<th style="min-width:80px;"><a href="#" onclick="openSkillModal(${s.id}); return false;" style="color:inherit; text-decoration:underline dotted;">${esc(s.name)}</a>${s.for_role ? `<div style="font-size:10px; font-weight:400;">vaaditaan: ${esc(s.for_role)}</div>` : ''}</th>`).join('')}</tr></thead>
            <tbody>${users.map(u => `<tr style="border-top:1px solid var(--border)"><td style="padding:6px 4px;"><b>${esc(u.name)}</b></td>
                <td style="text-align:center;">${card('', u.has_hygiene == 1)}</td><td style="text-align:center;">${card('', u.has_alcohol == 1)}</td><td style="text-align:center;">${card('', !!u.expiry_jv, u.expiry_jv)}</td>
                ${skills.map(s => cell(u, s)).join('')}</tr>`).join('')}</tbody>
        </table></div>
        ${skills.length ? '' : '<div class="tool-empty">Ei vielä osaamisia. Lisää esim. "Ovi", "Anniskelu" tai "Kahvikone".</div>'}
        <div style="font-size:12px; color:var(--text3); margin-top:10px;">Hygienia-, anniskelu- ja JV-kortti-sarakkeet tulevat työntekijän tiedoista (Työntekijät-välilehti).</div>
    </div>`;
}
function openSkillModal(id) {
    const s = id ? (state.data.skills || []).find(x => x.id == id) : null; state.editingSkill = s;
    const roles = pubCfg().roles.slice(); if (s && s.for_role && !roles.includes(s.for_role)) roles.push(s.for_role);
    openModal(s ? 'Muokkaa osaamista' : 'Uusi osaaminen', 'bi-award', `
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Nimi</label><input id="sk-name" class="form-input" maxlength="60" placeholder="Esim. Ovi, Anniskelu, Kahvikone" value="${esc(s ? s.name : '')}"></div>
        <div class="form-group"><label class="form-label">Vaaditaan vuoron roolille (valinn.)</label>
            <select id="sk-role" class="form-input"><option value="">Ei sidottu – vain tiedoksi</option>${roles.map(r => `<option ${s && s.for_role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
            <small style="color:var(--text3)">Jos valitset roolin, vuoroon tulee varoitus kun sen työntekijältä puuttuu tämä osaaminen.</small></div>`,
        `${s ? `<button class="btn btn-danger" onclick="deleteSkill(${s.id})"><i class="bi bi-trash"></i></button>` : ''}<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="saveSkill()">Tallenna</button>`);
}
async function saveSkill() {
    const name = document.getElementById('sk-name').value.trim(); if (!name) return showToast('Anna nimi', 'error');
    const res = await fetch('api.php?action=skill', { method: 'POST', body: JSON.stringify({ id: state.editingSkill ? state.editingSkill.id : null, name, for_role: document.getElementById('sk-role').value }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    closeModal(); showToast('Tallennettu'); load();
}
async function deleteSkill(id) {
    if (!confirm('Poistetaanko osaaminen kaikilta työntekijöiltä?')) return;
    await fetch(`api.php?id=${id}&type=skill`, { method: 'DELETE' }); closeModal(); showToast('Poistettu'); load();
}
function openUserSkill(uid, sid) {
    const u = state.data.users.find(x => x.id == uid), s = state.data.skills.find(x => x.id == sid), us = userSkill(uid, sid);
    openModal(`${esc(s.name)} – ${esc(u.name)}`, 'bi-award', `
        <label class="abs-choice" style="margin-bottom:12px;"><input id="us-has" type="checkbox" ${us ? 'checked' : ''}><span><b>Osaa / on pätevä</b></span></label>
        <div class="form-group"><label class="form-label">Voimassa asti (valinn., esim. kortti tai koulutus)</label><input id="us-until" type="date" class="form-input" value="${us && us.valid_until ? us.valid_until : ''}"></div>`,
        `<button class="btn btn-ghost" onclick="closeModal()">Peruuta</button><button class="btn btn-primary" onclick="saveUserSkill(${uid}, ${sid})">Tallenna</button>`);
}
async function saveUserSkill(uid, sid) {
    const res = await fetch('api.php?action=user_skill', { method: 'POST', body: JSON.stringify({ user_id: uid, skill_id: sid, has: document.getElementById('us-has').checked ? 1 : 0, valid_until: document.getElementById('us-until').value }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    closeModal(); load();
}
