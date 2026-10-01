// ===================== KÄYTTÖOIKEUSROOLIT =====================
// Ylläpitäjä (admin) saa aina kaiken. Työntekijän oikeudet määräytyvät hänen käyttöoikeusroolistaan (Hallinta → Oikeudet).
const PERM_CATALOG = [
    { key: 'shifts.manage',    type: 'extra', label: 'Vuorojen suunnittelu', desc: 'Luoda, muokata, poistaa ja julkaista vuoroja, käyttää pohjia ja miehityssääntöjä, hyväksyä vuoronvaihdot, korjata leimauksia' },
    { key: 'absences.approve', type: 'extra', label: 'Poissaolojen käsittely', desc: 'Hyväksyä ja hylätä poissaolot ja lomat, nähdä syyt, merkitä poissaoloja muille' },
    { key: 'events.manage',    type: 'extra', label: 'Tapahtumat ja varaukset', desc: 'Hallita tapahtumia, ilmoittautumisia ja pöytävarauksia' },
    { key: 'content.manage',   type: 'extra', label: 'Sisällöt', desc: 'Hallita ilmoitustaulua, rutiineja, dokumentteja, perehdytystä ja kyselyjä' },
    { key: 'sales.view',       type: 'extra', label: 'Myynti ja kassa', desc: 'Nähdä myyntitilastot ja kassatilitykset kuvineen, korjata ja poistaa tilityksiä' },
    { key: 'payroll.view',     type: 'extra', label: 'Palkat ja raportit', desc: 'Nähdä palkka-ajo, raportit, työaikapankki, analytiikka ja kaikkien tuntipalkat' },
    { key: 'cash.submit',      type: 'base',  label: 'Kassatilityksen kirjaus', desc: 'Kirjata oman vuoron kassatilitys (viimeiset 3 päivää)' },
    { key: 'trades.use',       type: 'base',  label: 'Vuoronvaihdot', desc: 'Tarjota ja pyytää vuoronvaihtoja' },
    { key: 'absences.request', type: 'base',  label: 'Poissaolohakemukset', desc: 'Hakea poissaoloa ja lomaa' }
];
function can(perm) { return !!state.user && (state.user.role === 'admin' || (state.data.perms || []).includes(perm)); }
// Hallinta-sivun välilehdet, jotka käyttäjälle näytetään (admin: kaikki)
function canAdminTab(t) { if (t.feature && !pubFeature(t.feature)) return false; return state.user.role === 'admin' || (!!t.perm && can(t.perm)); }
function accessRoleName(id) { const r = (state.data.access_roles || []).find(x => x.id === (id || 'employee')); return r ? r.name : 'Työntekijä'; }

function accessDraft() {
    if (!state.accessDraft) state.accessDraft = JSON.parse(JSON.stringify((state.data.access_roles || []).length ? state.data.access_roles : [{ id: 'employee', name: 'Työntekijä', perms: ['cash.submit', 'trades.use', 'absences.request'] }]));
    return state.accessDraft;
}
function accessToggle(ri, key) {
    const r = accessDraft()[ri], i = r.perms.indexOf(key);
    if (i >= 0) r.perms.splice(i, 1); else r.perms.push(key);
    state.accessDirty = true; render();
}
function accessRename(ri, v) { accessDraft()[ri].name = v; state.accessDirty = true; }
function accessAddRole() {
    if (accessDraft().length >= 12) return showToast('Enintään 12 roolia', 'error');
    accessDraft().push({ id: '', name: 'Uusi rooli', perms: ['cash.submit', 'trades.use', 'absences.request'] });
    state.accessDirty = true; render();
}
function accessDeleteRole(ri) {
    const r = accessDraft()[ri];
    const n = (state.data.users || []).filter(u => u.access_role && u.access_role === r.id).length;
    if (!confirm(`Poistetaanko rooli "${r.name}"?` + (n ? ` ${n} käyttäjää palautuu Työntekijä-rooliin.` : ''))) return;
    accessDraft().splice(ri, 1); state.accessDirty = true; render();
}
function accessReset() { state.accessDraft = null; state.accessDirty = false; render(); }
async function saveAccessRoles() {
    const res = await fetch('api.php?action=save_access_roles', { method: 'POST', body: JSON.stringify({ roles: accessDraft() }) }), j = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(j.error || 'Tallennus epäonnistui', 'error');
    state.accessDraft = null; state.accessDirty = false; showToast('Oikeudet tallennettu'); load();
}
function adminTabAccess() {
    const roles = accessDraft();
    const cols = roles.map((r, i) => `<th style="text-align:center; min-width:120px; vertical-align:bottom;">
        <input class="form-input" style="padding:6px 8px; font-size:13px; text-align:center;" maxlength="40" value="${esc(r.name)}" ${r.id === 'employee' ? '' : ''} oninput="accessRename(${i}, this.value)" aria-label="Roolin nimi">
        <div style="font-size:11px; color:var(--text3); margin-top:4px;">${(state.data.users || []).filter(u => u.role === 'employee' && (u.access_role || 'employee') === (r.id || '__new')).length} käyttäjää
        ${r.id === 'employee' ? '· oletus' : `· <a href="#" onclick="accessDeleteRole(${i}); return false;" style="color:var(--red, #dc2626)">poista</a>`}</div></th>`).join('');
    const row = p => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px 6px;"><b>${p.label}</b><br><small style="color:var(--text3)">${p.desc}</small></td>
        <td style="text-align:center;"><i class="bi bi-check-lg" style="color:var(--teal)" title="Ylläpitäjällä on aina kaikki oikeudet"></i></td>
        ${roles.map((r, i) => `<td style="text-align:center;"><input type="checkbox" style="width:20px; height:20px;" ${r.perms.includes(p.key) ? 'checked' : ''} onchange="accessToggle(${i}, '${p.key}')" aria-label="${esc(r.name)}: ${p.label}"></td>`).join('')}</tr>`;
    const group = (title, type) => `<tr><td colspan="${roles.length + 2}" style="padding:12px 6px 4px; font-weight:700; font-size:12px; text-transform:uppercase; color:var(--text3);">${title}</td></tr>${PERM_CATALOG.filter(p => p.type === type).map(row).join('')}`;
    return `<div class="card card-sm">
        <div class="section-header"><span class="section-title"><i class="bi bi-shield-lock"></i> Käyttöoikeusroolit</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 12px;">Määritä, mitä toimintoja kukin rooli saa tehdä. <b>Ylläpitäjä</b> saa aina kaiken, eikä sitä voi rajata. Anna työntekijälle rooli Työntekijät-välilehden muokkauksessa. Palkkatiedot, baarin asetukset, työntekijöiden hallinta ja auditloki pysyvät vain ylläpitäjällä.</p>
        <div style="overflow-x:auto"><table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead><tr><th style="text-align:left;">Toiminto</th><th style="text-align:center; min-width:90px; vertical-align:bottom;">Ylläpitäjä</th>${cols}</tr></thead>
            <tbody>${group('Lisäoikeudet (ylläpitäjän toimintoja)', 'extra')}${group('Perusoikeudet (oletuksena päällä)', 'base')}</tbody>
        </table></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:14px;">
            <button class="btn btn-ghost btn-sm" onclick="accessAddRole()"><i class="bi bi-plus-lg"></i> Lisää rooli</button>
            <span style="flex:1"></span>
            ${state.accessDirty ? '<button class="btn btn-ghost btn-sm" onclick="accessReset()">Peruuta muutokset</button>' : ''}
            <button class="btn btn-primary btn-sm" onclick="saveAccessRoles()" ${state.accessDirty ? '' : 'disabled'}><i class="bi bi-check-lg"></i> Tallenna</button>
        </div></div>`;
}

// ---- Kielivalinta ----
function openLanguageMenu() {
    openModal('Kieli / Language / Språk', 'bi-translate', `<div data-no-i18n>${Object.keys(window.bsLangs).map(k => `<button class="btn ${bsLang() === k ? 'btn-primary' : 'btn-ghost'}" style="width:100%; justify-content:center; margin-bottom:8px;" onclick="bsSetLang('${k}')">${window.bsLangs[k]}</button>`).join('')}</div>
        <p style="font-size:12px; color:var(--text3);">Käännökset kattavat käyttöliittymän tärkeimmät osat; puuttuvat tekstit näkyvät suomeksi. / Translations cover the main parts of the interface; missing texts are shown in Finnish.</p>`, '');
}
