// ===================== MANAGEMENT VIEW (ADMIN) =====================
function adminTabUsers() {
    let html = '';
    html += `
        <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="openUserModal()"><i class="bi bi-person-plus"></i> Lisää uusi työntekijä</button>
        </div>`;

    html += `
        <div class="card" style="padding:0; overflow-x:auto;"><table class="bs-table">
            <thead><tr><th>Nimi</th><th>Luvat</th><th>Tavoite</th><th>Loma</th><th>Rooli</th><th></th></tr></thead>
            <tbody>${(state.data.users || []).map(u => `<tr>
                <td><strong>${esc(u.name)}</strong> ${u.anonymized_at ? '<span class="badge" style="background:var(--surface2)">Anonymisoitu</span>' : ''} ${u.employment_type === 'casual' ? '<span class="badge badge-orange" title="Keikkalainen">Keikka</span>' : ''}<br><span style="font-size:11px; color:var(--text3);">${esc(u.username)}@${esc(u.pub_name)}</span>${u.start_date ? `<br><span style="font-size:11px; color:var(--text3);">Aloittanut ${fullDate(u.start_date)} · ${tenureText(u.start_date)}</span>` : '<br><span style="font-size:11px; color:#b45309;">Aloituspäivä puuttuu</span>'}</td>
                <td>
                    <span style="color:${u.has_hygiene==1?'#0D9488':'var(--border2)'};" title="Hygieniapassi"><i class="bi bi-droplet-fill"></i></span>
                    <span style="color:${u.has_alcohol==1?'#0D9488':'var(--border2)'}; margin:0 6px;" title="Anniskelupassi"><i class="bi bi-cup-straw"></i></span>
                </td>
                <td>${u.target_hours ? u.target_hours + ' h' : '-'}</td>
                <td>${(() => { const l = userLeave(u.id); return l && l.hasStart ? `<b>${fnum(l.remaining)} pv</b><br><span style="font-size:11px; color:var(--text3);">kertynyt ${fnum(l.entitled)}, käytetty ${fnum(l.used)}${l.next.earned > 0 ? `<br>ensi vuodelle ${l.next.earned} pv` : ''}</span>` : '<span style="color:var(--text3);">–</span>'; })()}</td>
                <td><span class="badge ${u.role=='admin'?'badge-orange':'badge-blue'}">${esc(u.role)}</span></td>
                <td style="text-align:right">
                    <button class="btn btn-ghost btn-sm btn-icon" title="Muokkaa" aria-label="Muokkaa" onclick="openUserModal(${u.id})"><i class="bi bi-pencil"></i></button>
                    ${!u.anonymized_at ? `<a class="btn btn-ghost btn-sm btn-icon" title="Lataa työntekijän tiedot (GDPR)" aria-label="Lataa työntekijän tiedot" href="api.php?action=export_user_data&id=${u.id}"><i class="bi bi-download"></i></a>` : ''}
                    ${!u.anonymized_at ? `<button class="btn btn-ghost btn-sm btn-icon" title="Lähetä kutsu- tai salasananvaihtolinkki" aria-label="Lähetä kutsulinkki" onclick="sendInvite(${u.id})"><i class="bi bi-envelope"></i></button>` : ''}
                    ${u.totp_enabled == 1 && u.role !== 'admin' ? `<button class="btn btn-ghost btn-sm btn-icon" title="Nollaa kaksivaiheinen tunnistautuminen" aria-label="Nollaa 2FA" onclick="resetTwoFactor(${u.id})"><i class="bi bi-shield-x"></i></button>` : ''}
                    ${!u.anonymized_at && u.id != state.user.id ? `<button class="btn btn-ghost btn-sm btn-icon" title="Anonymisoi (poistaa henkilötiedot, säilyttää työtunnit)" aria-label="Anonymisoi" onclick="anonymizeUser(${u.id})"><i class="bi bi-person-x"></i></button>` : ''}
                    <button class="btn btn-danger btn-sm btn-icon" title="Poista" aria-label="Poista" onclick="deleteItem(${u.id},'user')"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`).join('')}</tbody></table></div>`;
            
    return html;
}

function adminTabNotices() {
    let html = '';
    // ===================== UUTISET / ILMOITUSTAULU MODAALILLA =====================
    const myNotices = state.data.notices || [];
    html += `
        <div class="card card-sm">
            <div class="section-header"><span class="section-title"><i class="bi bi-megaphone"></i> Ilmoitustaulu</span><div class="section-line"></div></div>
            <div style="margin-bottom:12px;">
                <button class="btn btn-primary btn-sm" onclick="openNoticeModal()"><i class="bi bi-plus-lg"></i> Julkaise uusi uutinen</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom:12px;">`;
    
    if (myNotices.length === 0) {
        html += `<div style="font-size:13px; color:var(--text3); padding:10px; text-align:center;">Ei julkaistuja uutisia.</div>`;
    } else {
        const noticesToRender = state.showAllAdminNotices ? myNotices : myNotices.slice(0, 5);
        noticesToRender.forEach(notice => {
            const dateObj = new Date(notice.created_at.replace(' ', 'T'));
            const dateStr = dateObj.toLocaleDateString('fi-FI', {day: 'numeric', month: 'numeric', year: 'numeric'});
            html += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:10px 14px; border-radius:8px; border:1px solid var(--border);">
                    <div>
                        <div style="font-size:14px; font-weight:600; color:var(--text);">${esc(notice.message)}</div>
                        <div style="font-size:12px; color:var(--text3); margin-top:2px;">Julkaistu: ${dateStr}</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="btn btn-ghost btn-sm btn-icon" onclick="openNoticeModal(${notice.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${notice.id}, 'notice')"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            `;
        });
        
        if (myNotices.length > 5) {
            if (!state.showAllAdminNotices) {
                html += `<button class="btn btn-ghost btn-sm" style="width:100%;" onclick="state.showAllAdminNotices=true; render();">Näytä kaikki (${myNotices.length})</button>`;
            } else {
                html += `<button class="btn btn-ghost btn-sm" style="width:100%;" onclick="state.showAllAdminNotices=false; render();">Näytä vähemmän</button>`;
            }
        }
    }
    html += `</div></div>`;

    return html;
}

function adminTabTasks() {
    let html = '';
    // ===================== PÄIVITTÄISET RUTIINIT JA TEHTÄVÄT MODAALILLA =====================
    html += `
        <div class="card card-sm">
            <div class="section-header"><span class="section-title"><i class="bi bi-check2-square"></i> Päivittäiset Rutiinit</span><div class="section-line"></div></div>
            <div style="margin-bottom:12px;">
                <button class="btn btn-primary btn-sm" onclick="openTaskModal()"><i class="bi bi-plus-lg"></i> Lisää uusi rutiini</button>
            </div>
            <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
                ${(state.data.tasks || []).map((t, index) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:10px 14px; border-radius:8px; border:1px solid var(--border);">
                        <div style="font-weight:500; font-size:14px; color:var(--text);">${esc(t.label)}${t.kind === 'cash' ? ' <span class="badge" style="font-size:11px; color:var(--teal)"><i class="bi bi-cash-coin"></i> kassatilitys</span>' : ''}</div>
                        <div style="display:flex; gap:6px;">
                            <button class="btn btn-ghost btn-sm btn-icon" onclick="openTaskModal(${t.id})"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-ghost btn-sm btn-icon" onclick="moveTask(${index}, -1)" ${index === 0 ? 'disabled' : ''}><i class="bi bi-arrow-up"></i></button>
                            <button class="btn btn-ghost btn-sm btn-icon" onclick="moveTask(${index}, 1)" ${index === (state.data.tasks||[]).length - 1 ? 'disabled' : ''}><i class="bi bi-arrow-down"></i></button>
                            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteItem(${t.id}, 'task')"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;

    return html;
}


// ---------- Julkinen profiili (tapahtumakalenteri + kartta) ----------
async function loadPubProfile() {
    state.pubProfileLoading = true;
    try {
        const r = await (await fetch('api.php?action=pub_profile')).json();
        if (r.profile) { state.pubProfile = r.profile; state.pubShare = { id: r.public_id, base: r.base_url }; state.pubProfileError = null; }
        else state.pubProfileError = r.error || 'Profiilin lataus epäonnistui';
    } catch (e) { state.pubProfileError = 'Yhteysvirhe: profiilia ei voitu ladata'; }
    state.pubProfileLoading = false; render();
}
function geoQuery() { return (document.getElementById('pp-address')?.value.trim() || '') + '|' + (document.getElementById('pp-city')?.value.trim() || ''); }
function geoStatusHtml(live) {
    const p = state.pubProfile || {}, g = state.pubGeo;
    const addrNow = live && document.getElementById('pp-address') ? document.getElementById('pp-address').value.trim() : (p.address || '');
    if (live && g && g.q === geoQuery()) return `<div class="geo ok">📍 Löytyi: <b>${esc(g.label || 'sijainti')}</b> <a href="https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lng}#map=17/${g.lat}/${g.lng}" target="_blank" rel="noopener" style="color:var(--accent)">Avaa kartalla</a></div>`;
    if (p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== '' && !state.pubAddrChanged && addrNow === (p.address || '')) return `<div class="geo ok">📍 Sijainti on tallennettu. <a href="https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}" target="_blank" rel="noopener" style="color:var(--accent)">Avaa kartalla</a> <button type="button" class="btn btn-ghost btn-sm" onclick="findGeo()">Hae uudelleen</button></div>`;
    return `<div class="geo">${addrNow ? 'Sijainti haetaan osoitteesta automaattisesti, kun tallennat.' : 'Kirjoita osoite, niin baari näkyy kartalla.'} ${addrNow ? '<button type="button" class="btn btn-ghost btn-sm" onclick="findGeo()">Tarkista sijainti nyt</button>' : ''}</div>`;
}
async function findGeo() {
    const address = document.getElementById('pp-address').value.trim(), city = document.getElementById('pp-city').value.trim();
    if (!address) return showToast('Kirjoita osoite ensin', 'error');
    document.getElementById('pp-geo').innerHTML = '<div class="geo">Haetaan sijaintia…</div>';
    try {
        const res = await fetch('api.php?action=geocode_address', { method: 'POST', body: JSON.stringify({ address, city }) }); const raw = await res.text(); let r;
        try { r = JSON.parse(raw); } catch (pe) { r = { error: `Palvelin vastasi virheellisesti (HTTP ${res.status}): ${raw.replace(/<[^>]*>/g, ' ').trim().slice(0, 140)}` }; }
        if (r.error) { state.pubGeo = null; document.getElementById('pp-geo').innerHTML = `<div class="geo bad">⚠️ ${esc(r.error)}</div>`; return; }
        state.pubGeo = { q: geoQuery(), lat: r.lat, lng: r.lng, label: r.label };
        document.getElementById('pp-geo').innerHTML = geoStatusHtml(true);
    } catch (e) { document.getElementById('pp-geo').innerHTML = `<div class="geo bad">⚠️ Yhteysvirhe sijaintihaussa: ${esc(String(e && e.message || e))}</div>`; }
}
function adminTabProfile() {
    if (state.pubProfileError) return `<div class="leave-box warn"><b>Julkista profiilia ei voitu avata.</b><br>${esc(state.pubProfileError)}<div class="acts" style="margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="state.pubProfileError=null; loadPubProfile()">Yritä uudelleen</button></div></div>`;
    if (!state.pubProfile) { if (!state.pubProfileLoading) loadPubProfile(); return `<div class="tool-empty">Ladataan…</div>`; }
    const p = state.pubProfile, has = p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== '';
    const coord = has ? `${p.lat}, ${p.lng}` : '';
    return `<div class="card card-sm" style="max-width:720px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-globe"></i> Julkinen profiili</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 14px;">Julkinen tapahtumakalenteri näyttää baarien tapahtumat ja sijainnit kartalla; sijainti haetaan osoitteestasi. Baari ei näy siellä, ennen kuin julkaiset profiilin. Vain tiedot tällä sivulla ja julkiseksi merkityt tapahtumat näkyvät; työntekijä- ja vuorotietoja ei koskaan julkaista.</p>
        <label class="abs-choice"><input id="pp-public" type="checkbox" ${p.is_public == 1 ? 'checked' : ''}><span><b>Julkaise baari ja sen julkiset tapahtumat tapahtumakalenterissa</b></span></label>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Julkinen nimi *</label><input id="pp-name" class="form-input" maxlength="120" value="${esc(p.display_name || '')}" placeholder="Esim. Baari Mursu"></div>
            <div class="form-group"><label class="form-label">Kaupunki</label><input id="pp-city" class="form-input" maxlength="80" value="${esc(p.city || '')}" oninput="state.pubGeo=null; document.getElementById('pp-geo').innerHTML = geoStatusHtml(true);"></div>
        </div>
        <div class="form-group" style="margin-bottom:8px;"><label class="form-label">Osoite</label><input id="pp-address" class="form-input" maxlength="200" value="${esc(p.address || '')}" placeholder="Esim. Mannerheimintie 1" oninput="state.pubGeo=null; document.getElementById('pp-geo').innerHTML = geoStatusHtml(true);"></div>
        <div id="pp-geo" style="margin-bottom:14px;">${geoStatusHtml(false)}</div>
        <details style="margin-bottom:14px;"><summary style="cursor:pointer; font-size:13px; color:var(--text2); font-weight:600;">Aseta sijainti käsin (valinnainen)</summary>
            <div class="form-group" style="margin-top:8px;"><label class="form-label">Leveys- ja pituusaste</label><input id="pp-coord" class="form-input" value="${esc(coord)}" placeholder="60.1699, 24.9384">
            <small style="color:var(--text3)">Tarvitset tätä vain, jos osoitehaku ei osu oikeaan paikkaan. Google Mapsissa oikea klikkaus kartalla kopioi koordinaatit.</small></div></details>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Lyhyt esittely</label><textarea id="pp-desc" class="form-input" rows="3" maxlength="500">${esc(p.description || '')}</textarea></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Verkkosivu</label><input id="pp-web" class="form-input" maxlength="200" value="${esc(p.website || '')}" placeholder="https://"></div>
            <div class="form-group"><label class="form-label">Väri kalenterissa</label><input id="pp-color" type="color" class="form-input" style="height:42px; padding:4px;" value="${esc(p.color || '#E14D2A')}"></div>
        </div>
        <button class="btn btn-primary" onclick="savePubProfile()"><i class="bi bi-save"></i> Tallenna profiili</button>
        <a class="btn btn-ghost" style="margin-left:8px;" href="tapahtumat.html" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Avaa julkinen kalenteri</a>
    </div>
    ${shareCardHtml(p)}`;
}
function shareCardHtml(p) {
    const sh = state.pubShare;
    if (!sh || !sh.id) return '';
    if (p.is_public != 1) return `<div class="card card-sm" style="max-width:720px; margin-top:16px;"><div class="section-header"><span class="section-title"><i class="bi bi-share"></i> Jaa ja upota</span><div class="section-line"></div></div><p style="font-size:13px; color:var(--text2); margin:0;">Julkaise profiili ensin, niin saat baarille oman iCal-/RSS-syötteen ja upotettavan tapahtumawidgetin.</p></div>`;
    const b = sh.base, ical = `${b}/api.php?action=public_ics&pub=${sh.id}`, rss = `${b}/api.php?action=public_rss&pub=${sh.id}`;
    const embed = `<iframe src="${b}/widget.html?pub=${sh.id}&n=5" width="360" height="480" style="border:0" loading="lazy" title="Tulevat tapahtumat"></iframe>`;
    const row = (label, val, id) => `<div class="form-group" style="margin-bottom:12px;"><label class="form-label">${label}</label><div style="display:flex; gap:6px;"><input id="${id}" class="form-input" readonly value="${esc(val)}" onclick="this.select()"><button class="btn btn-ghost btn-sm" onclick="copyField('${id}')" title="Kopioi"><i class="bi bi-clipboard"></i></button></div></div>`;
    return `<div class="card card-sm" style="max-width:720px; margin-top:16px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-share"></i> Jaa ja upota</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 14px;">Vain julkiset tapahtumat. Tilaa iCal Google-/Apple-kalenteriin, RSS lukijaan tai upota tapahtumalista omalle sivullesi.</p>
        ${row('iCal-syöte (kalenteritilaus)', ical, 'sh-ical')}
        ${row('RSS-syöte', rss, 'sh-rss')}
        ${row('Upotuskoodi (widget)', embed, 'sh-embed')}
        <small style="color:var(--text3)">Widgetin asetukset osoitteessa: <code>n</code> = tapahtumien määrä (1–20), <code>theme=dark</code> = tumma, <code>color=E14D2A</code> = korostusväri.</small>
        <div style="margin-top:10px;"><a class="btn btn-ghost btn-sm" href="widget.html?pub=${sh.id}" target="_blank" rel="noopener"><i class="bi bi-eye"></i> Esikatsele widget</a></div>
    </div>`;
}
function copyField(id) {
    const el = document.getElementById(id); if (!el) return;
    el.select();
    (navigator.clipboard ? navigator.clipboard.writeText(el.value) : Promise.reject()).then(() => showToast('Kopioitu'), () => { document.execCommand('copy'); showToast('Kopioitu'); });
}
async function savePubProfile() {
    const p = state.pubProfile || {}, initCoord = (p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== '') ? `${p.lat}, ${p.lng}` : '';
    const raw = document.getElementById('pp-coord').value.trim();
    const address = document.getElementById('pp-address').value.trim(), city = document.getElementById('pp-city').value.trim();
    let lat = '', lng = '', geocode = 0;
    if (raw !== initCoord) {                               // sijainti asetettu käsin
        if (raw) {
            const m = raw.replace(/[;\s]+/g, ',').split(',').filter(Boolean);
            if (m.length !== 2 || isNaN(m[0]) || isNaN(m[1])) return showToast('Koordinaatit muodossa: 60.1699, 24.9384', 'error');
            lat = m[0]; lng = m[1];
        }
    } else if (state.pubGeo && state.pubGeo.q === geoQuery()) { lat = state.pubGeo.lat; lng = state.pubGeo.lng; }     // esikatselun tulos
    else if (initCoord && address === (p.address || '') && city === (p.city || '')) { lat = p.lat; lng = p.lng; }      // ei muutosta
    else if (address) geocode = 1;                          // osoite muuttunut: haetaan palvelimella
    const data = { display_name: document.getElementById('pp-name').value, city, address,
        description: document.getElementById('pp-desc').value, website: document.getElementById('pp-web').value.trim(), color: document.getElementById('pp-color').value,
        lat, lng, geocode, is_public: document.getElementById('pp-public').checked ? 1 : 0 };
    const r = await (await fetch('api.php?action=save_pub_profile', { method: 'POST', body: JSON.stringify(data) })).json();
    if (r.error) return showToast(r.error, 'error');
    state.pubProfile = null; state.pubGeo = null; render();
    if (r.warning) showToast(r.warning, 'error');
    else showToast(data.is_public ? 'Profiili tallennettu ja julkaistu' : 'Profiili tallennettu (ei julkinen)');
}

const PUB_SET_TABS = [
    { id: 'general',  label: 'Yleiset',            icon: 'bi-sliders' },
    { id: 'pay',      label: 'Palkka',             icon: 'bi-cash-stack' },
    { id: 'services', label: 'Palvelut',           icon: 'bi-toggles' },
    { id: 'security', label: 'Tietoturva ja laskutus', icon: 'bi-shield-check' }
];
// Vaihto piilottaa/näyttää osiot ilman uudelleenpiirtoa, joten tallentamattomat muutokset säilyvät välilehtien välillä
function setPubSetTab(id) {
    state.psTab = id;
    document.querySelectorAll('.ps-grp').forEach(g => { g.style.display = g.dataset.g === id ? '' : 'none'; });
    document.querySelectorAll('[data-pstab]').forEach(b => { const on = b.dataset.pstab === id; b.classList.toggle('active', on); });
}
function adminTabPub() {
    const p = pubCfg(), d = state.data.pub || {}, b = p.bonuses;
    const psTab = PUB_SET_TABS.some(t => t.id === state.psTab) ? state.psTab : 'general';
    const tzs = ['Europe/Helsinki', 'Europe/Stockholm', 'Europe/Tallinn', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/London', 'Europe/Berlin', 'UTC'];
    if (!tzs.includes(p.timezone)) tzs.push(p.timezone);
    return `<div class="card card-sm" style="max-width:720px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-shop"></i> Baarin asetukset</span><div class="section-line"></div></div>
        <p style="font-size:13px; color:var(--text2); margin:0 0 14px;">Kirjautumistunnus <b>tunnus@${esc(state.user.pub_name)}</b> ei muutu, vaikka vaihdat nimen.</p>
        <div class="admin-tabs" role="tablist" aria-label="Baarin asetusten osiot" style="margin-bottom:16px;">${PUB_SET_TABS.map(t => `<button type="button" class="admin-tab ${t.id === psTab ? 'active' : ''}" role="tab" data-pstab="${t.id}" onclick="setPubSetTab('${t.id}')"><i class="bi ${t.icon}"></i><span>${t.label}</span></button>`).join('')}</div>
        <div class="ps-grp" data-g="general" style="${psTab === 'general' ? '' : 'display:none'}">
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Baarin nimi *</label><input id="ps-name" class="form-input" maxlength="120" value="${esc(p.name)}"></div>
            <div class="form-group"><label class="form-label">Aikavyöhyke</label><select id="ps-tz" class="form-input">${tzs.map(z => `<option ${z === p.timezone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></div>
        </div>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Vuororoolit (yksi per rivi)</label><textarea id="ps-roles" class="form-input" rows="4">${esc(p.roles.join('\n'))}</textarea></div>
        <div class="section-header"><span class="section-title">Työaikasäännöt</span><div class="section-line"></div></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Vähimmäislepo vuorojen välillä (h)</label><input id="ps-rest" type="number" step="0.5" min="0" max="24" class="form-input" value="${p.min_rest_hours}"></div>
            <div class="form-group"><label class="form-label">Viikkotuntien varoitusraja (h)</label><input id="ps-maxw" type="number" step="1" min="1" max="168" class="form-input" value="${p.max_week_hours ?? ''}" placeholder="ei rajaa"></div>
        </div>
        <div class="section-header"><span class="section-title">Muistutukset ja hälytykset</span><div class="section-line"></div></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Vuoromuistutus (h ennen alkua, 0 = pois)</label><input id="ps-rem" type="number" min="0" max="48" class="form-input" value="${p.reminder_hours}"></div>
            <div class="form-group"><label class="form-label">Leimaushälytys (min, 0 = pois)</label><input id="ps-clk" type="number" min="0" max="240" class="form-input" value="${p.clock_alert_minutes}"></div>
        </div>
        <small style="color:var(--text3); display:block; margin:-6px 0 14px;">Muistutus lähtee työntekijälle push-ilmoituksena (tai sähköpostina). Leimaushälytys ilmoittaa työntekijälle ja adminille, jos sisään- tai ulosleimaus puuttuu näin monta minuuttia vuoron alusta tai lopusta. Vaatii ajastetun ajon (cron.php).</small>
        </div>
        <div class="ps-grp" data-g="pay" style="${psTab === 'pay' ? '' : 'display:none'}">
        <div class="section-header"><span class="section-title">Palkkalisät</span><div class="section-line"></div></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Ilta (€/h)</label><input id="ps-b-e" type="number" step="0.01" min="0" class="form-input" value="${b.evening}"></div>
            <div class="form-group"><label class="form-label">Yö (€/h)</label><input id="ps-b-n" type="number" step="0.01" min="0" class="form-input" value="${b.night}"></div>
            <div class="form-group"><label class="form-label">Lauantai (€/h)</label><input id="ps-b-s" type="number" step="0.01" min="0" class="form-input" value="${b.sat}"></div>
            <div class="form-group"><label class="form-label">Sunnuntai (kerroin)</label><input id="ps-b-u" type="number" step="0.1" min="0" class="form-input" value="${b.sun}"></div>
        </div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Ilta alkaa (klo)</label><input id="ps-ev" type="number" min="12" max="23" class="form-input" value="${p.evening_start}"></div>
            <div class="form-group"><label class="form-label">Yö päättyy (klo)</label><input id="ps-ne" type="number" min="0" max="12" class="form-input" value="${p.night_end}"></div>
        </div>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Työnantajan sivukulut (%)</label><input id="ps-side" type="number" step="0.1" min="0" max="100" class="form-input" value="${p.side_cost_pct}"><small style="color:var(--text3)">Lisätään palkkaan raportin kustannuslaskelmassa (esim. 22).</small></div>
        <div class="section-header"><span class="section-title">Palkkalajit, ylityö ja budjetti</span><div class="section-line"></div></div>
        <p style="font-size:12px; color:var(--text3); margin:0 0 8px;">Palkkalajikoodit näkyvät "Palkkatapahtumat"-CSV:ssä; aseta ne palkkajärjestelmäsi mukaisiksi.</p>
        <div class="form-row" style="margin-bottom:14px; flex-wrap:wrap;">
            ${[['base', 'Perus'], ['evening', 'Ilta'], ['night', 'Yö'], ['sat', 'La'], ['sun', 'Su']].map(([k, l]) => `<div class="form-group" style="min-width:90px;"><label class="form-label">${l}</label><input id="ps-pc-${k}" class="form-input" maxlength="20" value="${esc(((state.data.pub || {}).pay_codes || {})[k] || '')}"></div>`).join('')}
        </div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Ylityöraja (h / viikko)</label><input id="ps-ot" type="number" step="0.5" min="10" max="80" class="form-input" value="${p.overtime_week_hours}"></div>
            <div class="form-group"><label class="form-label">Viikkobudjetti henkilöstökuluille (€, valinn.)</label><input id="ps-budget" type="number" step="1" min="0" class="form-input" value="${p.weekly_budget ?? ''}" placeholder="ei budjettia"></div>
        </div>
        </div>
        <div class="ps-grp" data-g="services" style="${psTab === 'services' ? '' : 'display:none'}">
        ${customerSettingsHtml(p)}
        </div>
        <div class="ps-grp" data-g="security" style="${psTab === 'security' ? '' : 'display:none'}">
        <label class="abs-choice" style="margin-bottom:14px;"><input id="ps-r2fa" type="checkbox" ${p.require_2fa ? 'checked' : ''}><span><b>Vaadi ylläpitäjiltä kaksivaiheinen tunnistautuminen</b><br><small>Ylläpitäjä ilman 2FA:ta ohjataan ottamaan se käyttöön ennen kuin hän pääsee jatkamaan. Ota ensin oma 2FA käyttöön (Oma profiili → Turvallisuus).</small></span></label>
        <div class="section-header"><span class="section-title">Tietosuoja</span><div class="section-line"></div></div>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Työaika- ja vuorotietojen säilytysaika (kk)</label><input id="ps-ret" type="number" min="24" max="120" class="form-input" value="${p.retention_months}"><small style="color:var(--text3)">Sitä vanhemmat leimaukset ja vuorot poistetaan ajastetulla siivouksella (cron.php). 24–120 kk.</small></div>
        <div class="section-header"><span class="section-title">Laskutus</span><div class="section-line"></div></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Laskutusnimi</label><input id="ps-bn" class="form-input" maxlength="120" value="${esc(d.billing_name || '')}"></div>
            <div class="form-group"><label class="form-label">Y-tunnus / ALV</label><input id="ps-bv" class="form-input" maxlength="30" value="${esc(d.billing_vat || '')}"></div>
        </div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Laskutussähköposti</label><input id="ps-be" type="email" class="form-input" maxlength="150" value="${esc(d.billing_email || '')}"></div>
            <div class="form-group"><label class="form-label">Laskutusosoite</label><input id="ps-ba" class="form-input" maxlength="250" value="${esc(d.billing_address || '')}"></div>
        </div>
        </div>
        <button class="btn btn-primary" onclick="savePubSettings()"><i class="bi bi-save"></i> Tallenna asetukset</button>
    </div>`;
}
async function savePubSettings() {
    const v = id => document.getElementById(id).value;
    const data = { require_2fa: document.getElementById('ps-r2fa').checked, ...customerSettingsData(), name: v('ps-name'), timezone: v('ps-tz'), roles: v('ps-roles').split('\n'), min_rest_hours: v('ps-rest'), max_week_hours: v('ps-maxw'),
        evening_start: v('ps-ev'), night_end: v('ps-ne'), bonuses: { evening: v('ps-b-e'), night: v('ps-b-n'), sat: v('ps-b-s'), sun: v('ps-b-u') },
        retention_months: v('ps-ret'), overtime_week_hours: v('ps-ot'), weekly_budget: v('ps-budget'), pay_codes: { base: v('ps-pc-base'), evening: v('ps-pc-evening'), night: v('ps-pc-night'), sat: v('ps-pc-sat'), sun: v('ps-pc-sun') }, reminder_hours: v('ps-rem'), clock_alert_minutes: v('ps-clk'), side_cost_pct: v('ps-side'), billing_name: v('ps-bn'), billing_vat: v('ps-bv'), billing_email: v('ps-be'), billing_address: v('ps-ba') };
    const r = await (await fetch('api.php?action=save_pub_settings', { method: 'POST', body: JSON.stringify(data) })).json();
    if (r.error) return showToast(r.error, 'error');
    state.data.pub = r.pub; render(); showToast('Baarin asetukset tallennettu');
}

async function anonymizeUser(id) {
    const u = state.data.users.find(x => x.id == id); if (!u) return;
    if (!confirm(`Anonymisoidaanko "${u.name}"?\n\nNimi, tunnus, puhelin, viestit ja saatavuus poistetaan, tunnus lukitaan. Vuorot ja työtunnit säilyvät nimettöminä. Tätä ei voi perua.`)) return;
    const r = await (await fetch('api.php?action=anonymize_user', { method: 'POST', body: JSON.stringify({ userId: id }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Työntekijä anonymisoitu'); load();
}
async function loadAuditLog() {
    state.auditLoading = true;
    try { const r = await (await fetch('api.php?action=audit_log')).json(); state.auditLog = r.log || []; state.auditError = r.error || null; }
    catch (e) { state.auditError = 'Yhteysvirhe'; }
    state.auditLoading = false; render();
}
function adminTabAudit() {
    if (!state.auditLog && !state.auditLoading) loadAuditLog();
    if (state.auditError) return `<div class="leave-box warn">${esc(state.auditError)}</div>`;
    if (!state.auditLog) return `<div class="tool-empty">Ladataan…</div>`;
    return `<div class="card" style="padding:0; overflow-x:auto;">
        <div style="padding:14px 18px; font-size:13px; color:var(--text2);">Viimeiset 300 admin-toimintoa. Loki ei sisällä salasanoja eikä viestien sisältöjä; vanhat rivit poistuvat säilytysajan jälkeen.
            <button class="btn btn-ghost btn-sm" style="margin-left:8px;" onclick="state.auditLog=null; render()"><i class="bi bi-arrow-clockwise"></i> Päivitä</button></div>
        <table class="bs-table"><thead><tr><th>Aika</th><th>Tekijä</th><th>Toiminto</th><th>Kohde</th><th>Lisätieto</th></tr></thead>
        <tbody>${state.auditLog.length ? state.auditLog.map(r => `<tr><td style="white-space:nowrap">${esc(r.created_at.slice(0, 16).replace('T', ' '))}</td><td>${esc(r.user_name || '')}</td><td><b>${esc(r.action)}</b></td><td>${esc(r.target || '')}</td><td>${esc(r.detail || '')}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">Ei merkintöjä</td></tr>'}</tbody></table></div>`;
}

const ADMIN_TABS = [
    { id: 'users',   label: 'Työntekijät',      icon: 'bi-people',        render: adminTabUsers,   count: () => (state.data.users || []).length },
    { id: 'notices', perm: 'content.manage', label: 'Ilmoitustaulu',    icon: 'bi-megaphone',     render: adminTabNotices, count: () => (state.data.notices || []).length },
    { id: 'tasks', perm: 'content.manage',   label: 'Rutiinit',         icon: 'bi-check2-square', render: adminTabTasks,   count: () => (state.data.tasks || []).length },
    { id: 'cash', perm: 'sales.view',    label: 'Kassa',            icon: 'bi-cash-coin',     render: () => adminTabCash(), count: () => 0 },
    { id: 'guests', perm: 'events.manage', feature: 'guests', label: 'Vieraat', icon: 'bi-person-heart', render: () => adminTabGuests(), count: () => 0 },
    { id: 'skills', perm: 'shifts.manage', label: 'Osaaminen',  icon: 'bi-award', render: () => adminTabSkills(), count: () => 0 },
    { id: 'coverage', perm: 'shifts.manage', label: 'Miehitys',         icon: 'bi-people',        render: () => adminTabCoverage(), count: () => (state.data.coverage || []).filter(c => c.shortage > 0).length },
    { id: 'bookings', perm: 'events.manage', label: 'Varaukset',        icon: 'bi-calendar2-check', render: () => adminTabBookings(), count: () => (state.data.bookings || []).filter(b => b.status === 'pending').length },
    { id: 'gigapps', perm: 'shifts.manage', feature: 'hub_gigs', label: 'Keikkahakemukset', icon: 'bi-person-lines-fill', render: () => adminTabGigApps(), count: () => (state.gigApps || []).filter(a => a.status === 'pending').length },
    { id: 'pub',     label: 'Baari',            icon: 'bi-shop',          render: adminTabPub,     count: () => 0 },
    { id: 'profile', label: 'Julkinen profiili', icon: 'bi-globe', render: adminTabProfile, count: () => (state.pubProfile && state.pubProfile.is_public == 1) ? '✓' : 0 },
    { id: 'analytics', perm: 'payroll.view', label: 'Analytiikka',   icon: 'bi-bar-chart-line', render: () => adminTabAnalytics(), count: () => 0 },
    { id: 'access', label: 'Oikeudet',      icon: 'bi-shield-lock',   render: () => adminTabAccess(), count: () => 0 },
    { id: 'system', label: 'Järjestelmä',   icon: 'bi-heart-pulse',   render: () => adminTabSystem(), count: () => (state.data.system_alerts || []).length },
    { id: 'audit',   label: 'Auditloki',        icon: 'bi-journal-text',  render: adminTabAudit,   count: () => 0 },
];

function setAdminTab(id) {
    state.adminTab = id;
    try { localStorage.setItem('barshift_admin_tab', id); } catch (e) {}
    render();
}

function renderAdmin() {
    let saved = null;
    try { saved = localStorage.getItem('barshift_admin_tab'); } catch (e) {}
    const tabs = ADMIN_TABS.filter(canAdminTab);
    const current = tabs.find(t => t.id === (state.adminTab || saved)) || tabs[0];
    if (!current) return '<div class="empty-state"><p>Ei oikeuksia.</p></div>';

    let html = `<div class="page-header"><div class="page-title">Hallintapaneeli</div></div>`;
    html += `<div class="admin-tabs" role="tablist" aria-label="Hallinnan osiot">${tabs.map(t => {
        const n = t.count();
        return `<button class="admin-tab ${t.id === current.id ? 'active' : ''}" role="tab" aria-selected="${t.id === current.id}" onclick="setAdminTab('${t.id}')">`
             + `<i class="bi ${t.icon}"></i><span>${t.label}</span>${n ? `<span class="admin-tab-count">${n}</span>` : ''}</button>`;
    }).join('')}</div>`;
    html += `<div role="tabpanel">${current.render()}</div>`;
    return html;
}

// ===================== USER MODAL CREATION =====================
function openUserModal(userId = null) {
    const eu = userId ? state.data.users.find(u => u.id == userId) : null;
    state.editingUser = eu;
    const title = eu ? 'Muokkaa työntekijän tietoja' : 'Lisää uusi työntekijä';
    
    const body = `
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Koko nimi</label><input id="u-name" class="form-input" placeholder="Matti Meikäläinen" value="${esc(eu ? eu.name : '')}"></div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Käyttäjätunnus</label><input id="u-user" class="form-input" value="${esc(eu ? eu.username : '')}"></div>
            <div class="form-group"><label class="form-label">Salasana</label><input id="u-pass" type="password" class="form-input" placeholder="${eu ? 'Tyhjä = ei muuteta' : '••••••••'}"></div>
        </div>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Työntekijänumero (palkkajärjestelmää varten, valinn.)</label><input id="u-empno" class="form-input" maxlength="20" value="${esc(eu && eu.employee_number ? eu.employee_number : '')}"></div>
        <div class="form-group" style="margin-bottom:14px;"><label class="form-label">Sähköposti (valinnainen)</label><input id="u-email" type="email" class="form-input" maxlength="150" placeholder="nimi@example.fi" value="${esc(eu && eu.email ? eu.email : '')}">
            <small style="color:var(--text3)">Kutsulinkkiä, salasanan palautusta ja ilmoitusten varakanavaa varten.</small></div>
        ${eu ? '' : `<label class="abs-choice" style="margin-bottom:8px;"><input id="u-invite" type="checkbox" onchange="document.getElementById('u-pass').disabled = this.checked; if (this.checked) { document.getElementById('u-pass').value = ''; }"><span><b>Lähetä kutsulinkki</b> – työntekijä asettaa salasanansa itse<br><small>Linkki lähetetään sähköpostilla, jos osoite on annettu ja sähköposti on käytössä; muuten saat linkin jaettavaksi itse.</small></span></label>`}
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Tuntipalkka (€/h)</label><input id="u-wage" type="number" step="0.01" class="form-input" value="${eu ? eu.hourly_wage : ''}"></div>
            <div class="form-group"><label class="form-label">Tavoitetunnit / kk</label><input id="u-target" type="number" class="form-input" value="${eu ? (eu.target_hours || '') : ''}"></div>
        </div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group">
                <label class="form-label">Järjestelmärooli</label>
                <select id="u-role" class="form-input" onchange="document.getElementById('u-arole-wrap').style.display = this.value === 'admin' ? 'none' : ''"><option value="employee" ${eu?.role==='employee'?'selected':''}>Työntekijä</option><option value="admin" ${eu?.role==='admin'?'selected':''}>Admin</option></select>
            </div>
            <div class="form-group" id="u-arole-wrap" style="${eu?.role==='admin'?'display:none':''}">
                <label class="form-label">Käyttöoikeusrooli</label>
                <select id="u-arole" class="form-input">${(state.data.access_roles || []).map(r => `<option value="${esc(r.id)}" ${(eu?.access_role || 'employee') === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
            </div>
            <div class="form-group">
                <label class="form-label">JV-kortti vanhenee (jos on)</label>
                <input id="u-expiry-jv" type="date" class="form-input" value="${eu && eu.expiry_jv ? eu.expiry_jv : ''}">
            </div>
        </div>
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Aloittanut työssä (aloituspäivä)</label><input id="u-start" type="date" class="form-input" value="${eu && eu.start_date ? eu.start_date : ''}"><small style="color:var(--text3)">Tarvitaan vuosiloman kertymän laskentaan.</small></div>
            <div class="form-group"><label class="form-label">Työsuhteen tyyppi</label>
                <select id="u-emp" class="form-input"><option value="regular" ${eu?.employment_type!=='casual'?'selected':''}>Vakituinen</option><option value="casual" ${eu?.employment_type==='casual'?'selected':''}>Keikkalainen</option></select>
                <small style="color:var(--text3)">Keikkalaisella loma kertyy 35 h / kk mukaan.</small></div>
        </div>
        <div class="form-row" style="align-items:center;">
            <div class="form-group" style="flex-direction:row; align-items:center; gap:6px;">
                <input id="u-has-h" type="checkbox" ${eu?.has_hygiene == 1 ? 'checked' : ''} style="width:18px; height:18px;"><label class="form-label" style="margin:0;">Hygieniapassi</label>
            </div>
            <div class="form-group" style="flex-direction:row; align-items:center; gap:6px;">
                <input id="u-has-a" type="checkbox" ${eu?.has_alcohol == 1 ? 'checked' : ''} style="width:18px; height:18px;"><label class="form-label" style="margin:0;">Anniskelupassi</label>
            </div>
        </div>
    `;
    
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="addUser()"><i class="bi bi-save"></i> Tallenna työntekijä</button>
    `;
    openModal(title, 'bi-person-badge', body, footer);
}

// ===================== TALLENNUKSET (työntekijä, uutinen, hätähuuto, puutelista) =====================
async function saveNotice() { 
    const msg = document.getElementById('m-notice-msg').value.trim(); 
    if(!msg) return; 
    const id = state.editingNotice ? state.editingNotice.id : null;
    await fetch('api.php?action=notice', { method:'POST', body: JSON.stringify({ id: id, message: msg, pub_name: state.user.pub_name }) }); 
    closeModal(); showToast('Uutinen tallennettu!'); load(); 
}

async function addUser() { 
    const expiry_jv = document.getElementById('u-expiry-jv').value;
    const inviteBox = document.getElementById('u-invite');
    const invite = !!(inviteBox && inviteBox.checked);   // (link-valinta lähetetään erikseen)
    const data = { 
        id: state.editingUser ? state.editingUser.id : null, 
        name: document.getElementById('u-name').value, 
        username: document.getElementById('u-user').value, 
        password: document.getElementById('u-pass').value, 
        email: document.getElementById('u-email').value.trim(),
        employee_number: document.getElementById('u-empno').value.trim(),
        invite: invite,
        role: document.getElementById('u-role').value, access_role: (document.getElementById('u-arole') || {}).value || '', 
        hourly_wage: document.getElementById('u-wage').value, 
        target_hours: document.getElementById('u-target').value,
        has_hygiene: document.getElementById('u-has-h').checked ? 1 : 0, 
        has_alcohol: document.getElementById('u-has-a').checked ? 1 : 0, 
        expiry_jv: expiry_jv ? expiry_jv : null,
        start_date: document.getElementById('u-start').value || null,
        employment_type: document.getElementById('u-emp').value,
        color: '#E14D2A', 
        pub_name: state.user.pub_name 
    }; 
    const ur = await (await fetch('api.php?action=user', { method:'POST', body: JSON.stringify(data) })).json();
    if (ur.error) return showToast(ur.error, 'error');
    closeModal(); 
    load(); 
    if (ur.invite) showInviteResult(data.name, ur.invite);
}


async function saveShopItem() {
    const item = document.getElementById('m-shop-item').value.trim(); if(!item) return;
    const fd = new FormData(); if (state.editingShopItem) fd.append('id', state.editingShopItem.id);
    fd.append('item_name', item); fd.append('assigned_to', document.getElementById('m-shop-assignee').value);
    const f = document.getElementById('m-shop-img').files[0]; if (f) fd.append('image', f);
    const r = await (await fetch('api.php?action=add_shop_item', { method: 'POST', body: fd })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Puutelista päivitetty!'); load();
}
async function shopStatus(itemId, status) { const r = await postJson('shop_status', { itemId, status }); if (r) load(); }


// ===================== UUTISET / ILMOITUSTAULU MODAL =====================
function openNoticeModal(noticeId = null) {
    const n = noticeId ? state.data.notices.find(x => x.id == noticeId) : null;
    state.editingNotice = n;
    const title = n ? 'Muokkaa uutista' : 'Julkaise uusi uutinen';
    
    const body = `
        <div class="form-group">
            <label class="form-label">Uutisen sisältö</label>
            <textarea id="m-notice-msg" class="form-input" rows="3" placeholder="Kirjoita viesti tähän...">${esc(n ? n.message : '')}</textarea>
        </div>
    `;
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveNotice()"><i class="bi bi-send"></i> ${n ? 'Tallenna muutokset' : 'Julkaise'}</button>
    `;
    openModal(title, 'bi-megaphone', body, footer);
}

// ===================== ROUTINE TASK MODAL =====================
function openTaskModal(taskId = null) {
    const t = taskId ? state.data.tasks.find(x => x.id == taskId) : null;
    state.editingTask = t;
    const title = t ? 'Muokkaa rutiinia' : 'Lisää uusi rutiinitehtävä';
    
    const body = `
        <div class="form-group">
            <label class="form-label">Rutiinitehtävän nimi</label>
            <input id="m-task-label" class="form-input" placeholder="Esim. Roskien vienti, Hanojen pesu" value="${esc(t ? t.label : '')}">
        </div>
        <label style="display:flex; gap:8px; align-items:flex-start; font-size:13px; margin-top:10px;"><input type="checkbox" id="m-task-cash" ${t && t.kind === 'cash' ? 'checked' : ''}><span><b>Kassatilitys</b> – kuittaus tehdään syöttämällä päivän loppusumma (myynti, kortit, käteinen). Loppusumma päivittää Tilastojen myyntigraafin. Baarilla voi olla yksi tällainen rutiini.</span></label>
    `;
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveTask()"><i class="bi bi-check-lg"></i> Tallenna rutiini</button>
    `;
    openModal(title, 'bi-check2-square', body, footer);
}

// ===================== PUUTELISTA MODAL =====================
function openShoppingModal(itemId = null) {
    const s = itemId ? state.data.shopping_list.find(x => x.id == itemId) : null;
    state.editingShopItem = s;
    const title = s ? 'Muokkaa puutetta' : 'Lisää puutelistaan';
    
    const body = `
        <div class="form-group">
            <label class="form-label">Puuttuvan asian nimi</label>
            <input id="m-shop-item" class="form-input" placeholder="Esim. WC-paperi, Pillit" value="${esc(s ? s.item_name : '')}">
        </div>
        <div class="form-group" style="margin-top:12px;"><label class="form-label">Vastuuhenkilö (valinn.)</label>
            <select id="m-shop-assignee" class="form-input"><option value="">Ei vielä</option>${(state.data.users || []).filter(u => !u.anonymized_at).map(u => `<option value="${u.id}" ${s && s.assigned_to == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
        <div class="form-group" style="margin-top:12px;"><label class="form-label">Kuva (valinn., esim. rikkinäinen laite)</label><input id="m-shop-img" type="file" accept="image/*" class="form-input"></div>
    `;
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveShopItem()"><i class="bi bi-check-lg"></i> Tallenna</button>
    `;
    openModal(title, 'bi-cart3', body, footer);
}

// ===================== VUOROKIRJA MODAL =====================
function openShiftLogModal(logId = null) {
    const l = logId ? state.data.shift_logs.find(x => x.id == logId) : null;
    state.editingLog = l;
    const title = l ? 'Muokkaa merkintää vuorokirjassa' : 'Kirjoita terveiset vuorokirjaan';
    
    const body = `
        <div class="form-group">
            <label class="form-label">Terveiset / Viesti seuraavalle vuorolle</label>
            <input id="m-log-msg" class="form-input" placeholder="Kirjoita terveiset tähän..." value="${esc(l ? l.message : '')}">
        </div>
        <div class="form-group" style="margin-top:12px;"><label class="form-label">Kuva (valinn.)</label><input id="m-log-img" type="file" accept="image/*" class="form-input"></div>
    `;
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveShiftLog()"><i class="bi bi-check-lg"></i> Tallenna viesti</button>
    `;
    openModal(title, 'bi-journal-text', body, footer);
}

// ===================== LEIMAUSTEN MUOKKAUS MODAL =====================
function openTimeEntryModal(id) {
    const t = state.data.time_entries.find(x => x.id == id);
    state.editingTimeEntry = t;
    
    const inDate = t.clock_in.split(' ')[0];
    const inTime = t.clock_in.split(' ')[1].substring(0,5);
    const outDate = t.clock_out.split(' ')[0];
    const outTime = t.clock_out.split(' ')[1].substring(0,5);

    const body = `
        <div class="form-row" style="margin-bottom:14px;">
            <div class="form-group"><label class="form-label">Sisään (Pvm)</label><input id="te-in-date" type="date" class="form-input" value="${inDate}"></div>
            <div class="form-group"><label class="form-label">Sisään (Aika)</label><input id="te-in-time" type="time" class="form-input" value="${inTime}"></div>
        </div>
        <div class="form-row">
            <div class="form-group"><label class="form-label">Ulos (Pvm)</label><input id="te-out-date" type="date" class="form-input" value="${outDate}"></div>
            <div class="form-group"><label class="form-label">Ulos (Aika)</label><input id="te-out-time" type="time" class="form-input" value="${outTime}"></div>
        </div>
    `;
    const footer = `
        <button class="btn btn-ghost" onclick="closeModal()">Peruuta</button>
        <button class="btn btn-primary" onclick="saveTimeEntry()"><i class="bi bi-save"></i> Tallenna muutokset</button>
    `;
    openModal('Muokkaa leimausta', 'bi-clock-history', body, footer);
}

// ===================== SAVES & ACTIONS =====================
async function saveTimeEntry() {
    const inD = document.getElementById('te-in-date').value;
    const inT = document.getElementById('te-in-time').value;
    const outD = document.getElementById('te-out-date').value;
    const outT = document.getElementById('te-out-time').value;

    if (!inD || !inT || !outD || !outT) return showToast("Täytä kaikki kentät!", "error");

    const data = {
        id: state.editingTimeEntry.id,
        clock_in: inD + ' ' + inT + ':00',
        clock_out: outD + ' ' + outT + ':00'
    };

    await fetch('api.php?action=time_entry', { method: 'POST', body: JSON.stringify(data) });
    closeModal();
    showToast("Leimaus päivitetty!");
    load();
}

async function saveShift() { 
    const rawUserId = document.getElementById('m-user').value; const userId = (rawUserId === "0" || !rawUserId) ? null : rawUserId;
    const date = document.getElementById('m-date').value; const start = document.getElementById('m-start').value;
    const warns = await checkShiftWarnings();
    if (warns.length && !confirm('Huomioitavaa:\n\n• ' + warns.map(w => w.msg).join('\n• ') + '\n\nTallennetaanko silti?')) return;
    const rep = document.getElementById('m-repeat');
    const data = { id: state.editingShift?.id || null, userId: userId, date: date, start: start, end: document.getElementById('m-end').value, role: document.getElementById('m-role').value, pub_name: state.user.pub_name,
        status: document.getElementById('m-draft').checked ? 'draft' : 'published', repeat_weeks: rep ? parseInt(rep.value) || 0 : 0 };
    if (document.getElementById('m-hub')) { data.hub_gig = document.getElementById('m-hub').checked; data.hub_pay = document.getElementById('m-hubpay').value; }
    const r = await (await fetch('api.php?action=shift', { method:'POST', body: JSON.stringify(data) })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast(r.created ? `${r.created} vuoroa luotu` : "Tallennettu!"); load(); 
}
async function saveShiftLog() {
    const msg = document.getElementById('m-log-msg').value.trim(); if(!msg) return;
    const fd = new FormData(); if (state.editingLog) fd.append('id', state.editingLog.id); fd.append('message', msg);
    const f = document.getElementById('m-log-img').files[0]; if (f) fd.append('image', f);
    const r = await (await fetch('api.php?action=add_log', { method: 'POST', body: fd })).json();
    if (r.error) return showToast(r.error, 'error');
    closeModal(); showToast('Vuorokirja päivitetty!'); load();
}




async function deleteItem(id, type) { 
    if(!confirm('Poistetaanko lopullisesti?')) return; 
    await fetch(`api.php?id=${id}&type=${type}`, { method:'DELETE' }); 
    showToast('Poistettu'); load(); 
}

function changeDate(days) { state.currentDate.setDate(state.currentDate.getDate() + days); render(); }
function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(),0,1))) / 86400000) + 1)/7); }
function formatDate(dateStr) { const days = ['Su','Ma','Ti','Ke','To','Pe','La']; const d = new Date(dateStr + 'T00:00:00'); return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}.`; }

// ===================== KUTSULINKIT ja 2FA-nollaus (admin) =====================
async function sendInvite(id) {
    const u = state.data.users.find(x => x.id == id); if (!u) return;
    if (!confirm(`Luodaanko ${u.name} uusi linkki salasanan asettamiseen? Aiemmat linkit lakkaavat toimimasta.`)) return;
    const r = await (await fetch('api.php?action=send_invite', { method: 'POST', body: JSON.stringify({ userId: id }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showInviteResult(u.name, r.invite);
}
function showInviteResult(name, inv) {
    const body = `<p style="font-size:14px; margin:0 0 12px;">${inv.emailed ? `Linkki lähetettiin henkilön <b>${esc(name)}</b> sähköpostiin.` : `Sähköpostia ei lähetetty (osoite puuttuu tai sähköposti ei ole käytössä). Jaa linkki henkilölle <b>${esc(name)}</b> itse, esim. viestillä.`}</p>
        <label class="form-label">Salasanan asetuslinkki</label>
        <div style="display:flex; gap:6px;"><input id="inv-link" class="form-input" readonly value="${esc(inv.link)}" onclick="this.select()"><button class="btn btn-ghost btn-sm" onclick="copyField('inv-link')" title="Kopioi"><i class="bi bi-clipboard"></i></button></div>
        <small style="color:var(--text3)">Linkki on kertakäyttöinen ja voimassa 7 päivää. Älä jaa sitä muille.</small>`;
    openModal('Kutsulinkki', 'bi-envelope-check', body, `<button class="btn btn-primary" onclick="closeModal()">Valmis</button>`);
}
async function resetTwoFactor(id) {
    const u = state.data.users.find(x => x.id == id); if (!u) return;
    if (!confirm(`Nollataanko ${u.name} kaksivaiheinen tunnistautuminen? Hän voi ottaa sen uudelleen käyttöön profiilistaan.`)) return;
    const r = await (await fetch('api.php?action=reset_2fa', { method: 'POST', body: JSON.stringify({ userId: id }) })).json();
    if (r.error) return showToast(r.error, 'error');
    showToast('Nollattu'); load();
}
