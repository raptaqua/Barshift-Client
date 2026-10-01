// ===================== ASIAKASPALVELUT (baarikohtaisesti aktivoitavat): tapahtumailmoittautuminen/liput ja pöytävaraukset =====================
function pubFeature(name) { return !!((state.data.pub || {}).features || {})[name]; }

// ---- Tapahtumalomakkeen lisäkentät ----
function eventRegFields(ev) {
    if (!pubFeature('tickets')) return '';
    const mode = ev?.registration || 'none';
    return `<div class="section-header" style="margin-top:14px;"><span class="section-title"><i class="bi bi-ticket-perforated"></i> Ilmoittautuminen ja liput</span><div class="section-line"></div></div>
        <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Julkinen ilmoittautuminen</label>
            <select id="e-reg" class="form-input" onchange="document.getElementById('e-reg-more').style.display = this.value === 'none' ? 'none' : 'block'">
                <option value="none" ${mode === 'none' ? 'selected' : ''}>Ei käytössä</option><option value="rsvp" ${mode === 'rsvp' ? 'selected' : ''}>Ilmoittautuminen (ilmainen)</option><option value="tickets" ${mode === 'tickets' ? 'selected' : ''}>Lippuvaraus (maksu ovella) tai ulkoinen lippulinkki</option></select></div>
        <div id="e-reg-more" style="display:${mode === 'none' ? 'none' : 'block'};">
            <div class="form-row" style="margin-bottom:12px;"><div class="form-group"><label class="form-label">Paikkoja (tyhjä = ei rajaa)</label><input id="e-cap" type="number" min="1" class="form-input" value="${ev?.capacity ?? ''}"></div>
                <div class="form-group"><label class="form-label">Hinta € (tiedoksi)</label><input id="e-price" type="number" step="0.01" min="0" class="form-input" value="${ev?.ticket_price ?? ''}"></div></div>
            <div class="form-group" style="margin-bottom:12px;"><label class="form-label">Ulkoinen lippulinkki (https://, valinn.)</label><input id="e-turl" class="form-input" maxlength="255" value="${esc(ev?.ticket_url || '')}" placeholder="https://"><small style="color:var(--text3)">Jos annat linkin, kävijä ohjataan siihen (esim. Tiketti/Ticketmaster) eikä ilmoittautumista oteta vastaan täällä. BarShift ei käsittele maksuja.</small></div>
        </div>`;
}
function eventRegFormData(fd) {
    if (!pubFeature('tickets') || !document.getElementById('e-reg')) return;
    fd.append('registration', document.getElementById('e-reg').value); fd.append('capacity', document.getElementById('e-cap').value);
    fd.append('ticket_price', document.getElementById('e-price').value); fd.append('ticket_url', document.getElementById('e-turl').value.trim());
}
function eventRegBadge(e) {
    if (!pubFeature('tickets') || !e.registration || e.registration === 'none') return '';
    const r = (state.data.event_regs || {})[e.id] || { qty: 0, arrived: 0 };
    return ` <a href="#" onclick="openEventRegs(${e.id}); return false;" class="sl-badge trade" style="text-decoration:none;" title="Näytä ilmoittautuneet"><i class="bi bi-people"></i> ${r.qty}${e.capacity ? '/' + e.capacity : ''}</a>${r.rating_cnt ? ` <span class="sl-badge" style="background:#F59E0B22; color:#B45309;" title="${r.rating_cnt} palautetta">★ ${String(r.rating_avg).replace('.', ',')}</span>` : ''}`;
}
async function openEventRegs(eventId) {
    const e = state.data.events.find(x => x.id == eventId); if (!e) return;
    openModal('Ilmoittautuneet: ' + e.title, 'bi-people', '<div class="tool-empty">Ladataan…</div>', `<a class="btn btn-ghost" href="api.php?action=event_registrations&eventId=${eventId}&format=csv"><i class="bi bi-filetype-csv"></i> CSV</a><button class="btn btn-primary" onclick="closeModal()">Sulje</button>`);
    const r = await (await fetch('api.php?action=event_registrations&eventId=' + eventId)).json();
    if (r.error) { closeModal(); return showToast(r.error, 'error'); }
    const act = r.registrations.filter(x => x.status === 'confirmed'), total = act.reduce((a, x) => a + x.qty, 0);
    const wlist = r.waitlist || [];
    const fbs = r.registrations.filter(x => x.rating), fbAvg = fbs.length ? (fbs.reduce((a, x) => a + x.rating, 0) / fbs.length) : 0;
    document.getElementById('modal-body-el').innerHTML = `<p style="font-size:13px; color:var(--text2); margin:0 0 10px;">${total} henkilöä ${e.capacity ? '/ ' + e.capacity + ' paikkaa' : ''} · saapunut ${act.filter(x => x.arrived == 1).reduce((a, x) => a + x.qty, 0)}</p>
        ${r.registrations.length ? r.registrations.map(x => `<div class="att-row" style="align-items:center; ${x.status === 'cancelled' ? 'opacity:.5;' : ''}"><div><b>${esc(x.name)}</b> · ${x.qty} hlö · <code>${esc(x.code)}</code>${x.paid_cents > 0 ? ` <span class="badge" style="background:#0D948822; color:#0D9488;">💳 ${(x.paid_cents / 100).toLocaleString('fi-FI', { minimumFractionDigits: 2 })} €</span>` : ''}<br><small>${esc(x.email)}${x.status === 'cancelled' ? (x.paid_cents > 0 ? ' · peruttu – <b style="color:#E11D48">palauta maksu Stripessä</b>' : ' · peruttu') : ''}</small></div>
            ${x.status === 'confirmed' ? `<div style="display:flex; gap:6px;"><button class="btn ${x.arrived == 1 ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="regUpdate(${x.id}, { arrived: ${x.arrived == 1 ? 0 : 1} }, ${eventId})">${x.arrived == 1 ? 'Saapunut ✓' : 'Saapui'}</button><button class="btn btn-danger btn-sm btn-icon" aria-label="Peru" onclick="if(confirm('Perutaanko ilmoittautuminen?')) regUpdate(${x.id}, { status: 'cancelled' }, ${eventId})"><i class="bi bi-x-lg"></i></button></div>` : ''}</div>`).join('') : '<div class="tool-empty">Ei ilmoittautuneita</div>'}
        ${fbs.length ? `<div style="margin-top:14px; font-size:13px;"><b>Palaute: ★ ${fbAvg.toFixed(1).replace('.', ',')} (${fbs.length} vastausta)</b>${fbs.filter(x => x.feedback_text).map(x => `<div style="padding:4px 0; border-top:1px solid var(--border);">${'★'.repeat(x.rating)}${'☆'.repeat(5 - x.rating)} ${esc(x.feedback_text)}</div>`).join('')}</div>` : ''}
        ${wlist.length ? `<div style="margin-top:14px; font-size:13px;"><b>Odotuslista (${wlist.length})</b>${wlist.map((w, i) => `<div style="padding:3px 0; border-top:1px solid var(--border);">${i + 1}. ${esc(w.name)} · ${w.qty} hlö · ${esc(w.email)}${w.notified_at ? ' <small style="color:var(--text3)">(ilmoitettu)</small>' : ''}</div>`).join('')}</div>` : ''}`;
}
async function regUpdate(id, patch, eventId) { if (await postJson('reg_update', { id, ...patch })) { openEventRegs(eventId); load(); } }

// ---- Baari-välilehden asetusosio ----
function customerSettingsHtml(p) {
    const b = p.booking, hours = b.hours || [], row = d => { const h = hours.find(x => x.dow === d); return `<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;"><label style="min-width:110px; display:flex; gap:6px; align-items:center;"><input type="checkbox" id="bh-on-${d}" ${h ? 'checked' : ''}> ${DOW_LONG[d]}</label><input id="bh-o-${d}" type="time" class="form-input" style="width:auto;" value="${h ? h.open : '16:00'}"> – <input id="bh-c-${d}" type="time" class="form-input" style="width:auto;" value="${h ? h.close : '23:00'}"></div>`; };
    return `<div class="section-header"><span class="section-title"><i class="bi bi-people"></i> Asiakaspalvelut (valinnaiset)</span><div class="section-line"></div></div>
        <p style="font-size:12px; color:var(--text3); margin:0 0 8px;">Ota käyttöön vain ne, joita baarissanne tarvitaan. Ne näkyvät kävijöille vasta, kun baarin julkinen profiili on julkaistu.</p>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="ps-ft" type="checkbox" ${p.features.tickets ? 'checked' : ''}><span><b>Ilmoittautuminen ja liput tapahtumiin</b><br><small>Tapahtumalomakkeeseen tulee ilmoittautumisen, paikkamäärän ja lippulinkin asetukset. Kävijät saavat vahvistuksen ja muistutuksen sähköpostilla (vaatii sähköpostin käyttöönoton).</small></span></label>
        <label class="abs-choice" style="margin-bottom:10px;"><input id="ps-fb" type="checkbox" ${p.features.bookings ? 'checked' : ''} onchange="document.getElementById('bk-settings').style.display = this.checked ? 'block' : 'none'"><span><b>Pöytävaraukset</b><br><small>Kävijät varaavat pöydän julkiselta sivulta; sinä vahvistat tai hylkäät varaukset Hallinta → Varaukset -välilehdellä.</small></span></label>
        <div id="bk-settings" style="display:${p.features.bookings ? 'block' : 'none'}; margin-bottom:14px; padding:12px; border:1px solid var(--border); border-radius:10px;">
            <div class="form-row" style="margin-bottom:10px; flex-wrap:wrap;">
                <div class="form-group"><label class="form-label">Paikkoja yhteensä</label><input id="bk-cap" type="number" min="1" class="form-input" value="${b.capacity}"></div>
                <div class="form-group"><label class="form-label">Suurin ryhmä</label><input id="bk-max" type="number" min="1" max="30" class="form-input" value="${b.max_party}"></div>
                <div class="form-group"><label class="form-label">Varauksen kesto (min)</label><input id="bk-dur" type="number" min="30" step="15" class="form-input" value="${b.duration_minutes}"></div>
            </div>
            <div class="form-row" style="margin-bottom:10px; flex-wrap:wrap;">
                <div class="form-group"><label class="form-label">Aikavälit</label><select id="bk-slot" class="form-input">${[15, 30, 60].map(m => `<option value="${m}" ${b.slot_minutes === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Vähintään (h) etukäteen</label><input id="bk-lead" type="number" min="0" max="72" class="form-input" value="${b.lead_hours}"></div>
                <div class="form-group"><label class="form-label">Enintään (pv) eteenpäin</label><input id="bk-days" type="number" min="1" max="365" class="form-input" value="${b.days_ahead}"></div>
            </div>
            <label class="abs-choice" style="margin-bottom:10px;"><input id="bk-auto" type="checkbox" ${b.auto_confirm ? 'checked' : ''}><span><b>Vahvista automaattisesti</b> kun tilaa on (muuten kukin varaus odottaa hyväksyntääsi)</span></label>
            <div class="form-label" style="margin-bottom:6px;">Varausaika (aukioloaika, jolloin pöytiä voi varata)</div>${[0, 1, 2, 3, 4, 5, 6].map(row).join('')}
        </div>
        <div class="section-header" style="margin-top:18px;"><span class="section-title"><i class="bi bi-toggles"></i> Muut valinnaiset ominaisuudet</span><div class="section-line"></div></div>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="fx-bidding" type="checkbox" ${p.features.bidding ? 'checked' : ''}><span><b>Vuorojen haku</b><br><small>Avoimeen vuoroon ei voi napata suoraan, vaan työntekijät hakevat sitä ja ylläpito valitsee hakijoista.</small></span></label>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="fx-auto" type="checkbox" ${p.features.autoschedule ? 'checked' : ''}><span><b>Automaattinen vuorosuunnitelma</b><br><small>"Luo viikon luonnos" -toiminto täyttää miehityssääntöjen vaatimat vuorot luonnoksiksi saatavuuden, lepoaikojen, osaamisten, tavoitetuntien ja kuormituksen mukaan.</small></span></label>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="fx-rem" type="checkbox" ${p.features.reminders ? 'checked' : ''} onchange="document.getElementById('fx-rem-more').style.display = this.checked ? 'block' : 'none'"><span><b>Muistutukset vieraille</b><br><small>Sähköposti- (ja halutessa teksti)viesti ennen pöytävarausta tai tapahtumaa. Vähentää poisjääntejä.</small></span></label>
        <div id="fx-rem-more" style="display:${p.features.reminders ? 'block' : 'none'}; margin:0 0 10px 28px;">
            <div class="form-group" style="max-width:220px;"><label class="form-label">Muistutus (h ennen)</label><input id="fx-remh" type="number" min="2" max="72" class="form-input" value="${p.guest_reminder_hours || 24}"></div>
            <label class="abs-choice"><input id="fx-sms" type="checkbox" ${p.reminder_sms ? 'checked' : ''}><span><b>Lähetä myös tekstiviesti</b> (vaatii palvelimen SMS-asetukset ja vieraan puhelinnumeron; tekstiviestit maksavat)</span></label>
        </div>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="fx-pay" type="checkbox" ${p.features.payments ? 'checked' : ''}><span><b>Verkkomaksu lippuihin</b><br><small>Maksullisten tapahtumaliput maksetaan MobilePaylla ilmoittautumisen yhteydessä (vaatii Stripe-avaimet palvelimen asetuksissa ja MobilePayn käyttöönoton Stripessä).</small></span></label>
        <label class="abs-choice" style="margin-bottom:8px;"><input id="fx-guests" type="checkbox" ${p.features.guests ? 'checked' : ''}><span><b>Vieraskortisto</b><br><small>Kanta-asiakkaat, VIP-merkinnät, allergiat ja käyntihistoria varauksista ja ilmoittautumisista. Vain henkilökunnan käyttöön.</small></span></label>`;
}
function customerSettingsData() {
    const v = id => document.getElementById(id), hours = [];
    for (let d = 0; d < 7; d++) if (v('bh-on-' + d) && v('bh-on-' + d).checked) hours.push({ dow: d, open: v('bh-o-' + d).value, close: v('bh-c-' + d).value });
    return { feature_tickets: v('ps-ft').checked, feature_bookings: v('ps-fb').checked,
        features_ext: { bidding: v('fx-bidding').checked, autoschedule: v('fx-auto').checked, reminders: v('fx-rem').checked, payments: v('fx-pay').checked, guests: v('fx-guests').checked, guest_reminder_hours: v('fx-remh').value, reminder_sms: v('fx-sms').checked },
        booking: { capacity: v('bk-cap').value, max_party: v('bk-max').value, duration_minutes: v('bk-dur').value, slot_minutes: v('bk-slot').value, lead_hours: v('bk-lead').value, days_ahead: v('bk-days').value, auto_confirm: v('bk-auto').checked, hours } };
}

// ---- Admin: Varaukset-välilehti ----
const BK_STATUS = { pending: ['Odottaa', '#F59E0B'], confirmed: ['Vahvistettu', '#0D9488'], declined: ['Hylätty', '#94A3B8'], cancelled: ['Peruttu', '#94A3B8'], seated: ['Paikalla', '#3B82F6'], no_show: ['Ei saapunut', '#E11D48'] };
function adminTabBookings() {
    if (!pubFeature('bookings')) return `<div class="card card-sm" style="max-width:640px;"><p style="margin:0; color:var(--text2);">Pöytävaraukset eivät ole käytössä. Ota ne käyttöön kohdassa <b>Hallinta → Baari → Asiakaspalvelut</b>.</p></div>`;
    const list = (state.data.bookings || []).filter(b => state.bkShowAll || !['cancelled', 'declined'].includes(b.status));
    const byDay = {}; list.forEach(b => (byDay[b.starts_at.slice(0, 10)] = byDay[b.starts_at.slice(0, 10)] || []).push(b));
    const pid = state.pubShare && state.pubShare.id;
    if (!state.pubShare && !state.pubProfileLoading) loadPubProfile();
    return `<div class="card card-sm" style="max-width:760px; margin-bottom:14px;">
        <div class="section-header"><span class="section-title"><i class="bi bi-plus-circle"></i> Kirjaa varaus (puhelin / ovi)</span><div class="section-line"></div></div>
        <div class="form-row" style="align-items:flex-end; flex-wrap:wrap; gap:8px;">
            <div class="form-group"><label class="form-label">Nimi</label><input id="nb-name" class="form-input" maxlength="100"></div>
            <div class="form-group" style="max-width:90px;"><label class="form-label">Hlö</label><input id="nb-party" type="number" min="1" value="2" class="form-input"></div>
            <div class="form-group"><label class="form-label">Päivä</label><input id="nb-date" type="date" class="form-input" value="${getLocalDateString()}"></div>
            <div class="form-group"><label class="form-label">Kello</label><input id="nb-time" type="time" class="form-input" value="19:00"></div>
            <div class="form-group"><label class="form-label">Puhelin</label><input id="nb-phone" class="form-input" maxlength="30"></div>
            <div class="form-group"><button class="btn btn-primary" onclick="createBooking()"><i class="bi bi-plus-lg"></i> Lisää</button></div>
        </div>
        ${pid ? `<small style="color:var(--text3)">Kävijöiden varaussivu: <a href="varaus.html?pub=${pid}" target="_blank" rel="noopener">varaus.html?pub=${pid}</a></small>` : ''}
    </div>
    <div style="display:flex; justify-content:flex-end; margin-bottom:8px;"><label style="font-size:12px; color:var(--text2);"><input type="checkbox" ${state.bkShowAll ? 'checked' : ''} onchange="state.bkShowAll=this.checked; render()"> Näytä perutut</label></div>
    ${Object.keys(byDay).sort().map(d => `<div class="card card-sm" style="max-width:760px; margin-bottom:12px;"><b>${formatDate(d)}</b> <small style="color:var(--text3)">· ${byDay[d].filter(b => !['cancelled', 'declined'].includes(b.status)).reduce((a, b) => a + b.party_size, 0)} hlö</small>
        ${byDay[d].map(b => { const st = BK_STATUS[b.status]; return `<div style="padding:8px 0; border-top:1px solid var(--border);"><div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><div><b>${b.starts_at.slice(11, 16)}</b> · ${esc(b.name)} · ${b.party_size} hlö <span class="badge" style="background:${st[1]}22; color:${st[1]};">${st[0]}</span>${guestBookingBadges(b)}
            <br><small style="color:var(--text2);">${b.phone ? '📞 ' + esc(b.phone) + ' ' : ''}${b.email ? '✉ ' + esc(b.email) : ''}${b.note ? ' · “' + esc(b.note) + '”' : ''} · <code>${esc(b.code)}</code></small></div>
            <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:flex-start;">${bkActions(b)}</div></div></div>`; }).join('')}</div>`).join('') || '<div class="tool-empty">Ei varauksia</div>'}`;
}
function bkActions(b) {
    const btn = (to, label, cls) => `<button class="btn ${cls || 'btn-ghost'} btn-sm" onclick="setBookingStatus(${b.id}, '${to}')">${label}</button>`;
    if (b.status === 'pending') return btn('confirmed', 'Vahvista', 'btn-primary') + btn('declined', 'Hylkää');
    if (b.status === 'confirmed') return btn('seated', 'Paikalla') + btn('no_show', 'Ei tullut') + btn('cancelled', 'Peru');
    if (b.status === 'seated' || b.status === 'no_show') return btn('confirmed', 'Palauta');
    return '';
}
async function setBookingStatus(id, status) { if (await postJson('booking_status', { id, status })) load(); }
async function createBooking() {
    const v = id => document.getElementById(id).value;
    if (await postJson('booking_create', { name: v('nb-name'), party: v('nb-party'), date: v('nb-date'), time: v('nb-time'), phone: v('nb-phone') })) { showToast('Varaus lisätty'); load(); }
}
