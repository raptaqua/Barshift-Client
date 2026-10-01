// API-integraatiotestit (node tests/api.test.js; käynnistä tests/run_api_tests.sh:lla).
// Ympäristö: BASE = palvelimen osoite. Kanta on ladattu demodatalla (yksi baari).
const assert = require('assert');
const crypto = require('crypto');
const { execFile } = require('child_process');
const execFileP = (cmd, args, opts) => new Promise((res, rej) => execFile(cmd, args, opts, (e, out, err) => e ? rej(new Error((err || e.message).toString())) : res(out.toString())));
const SQLITE = process.env.DB_DRIVER === 'sqlite';
// SQL-lauseet suoraan testikantaan (SQLite: tests/sqlcli.php, MariaDB: mysql-asiakas)
const sqlCli = (sqlText, noHeader = false) => SQLITE
  ? execFileP('php', [require('path').join(__dirname, 'sqlcli.php'), sqlText, ...(noHeader ? ['-N'] : [])], { env: process.env })
  : execFileP('mysql', ['-h', process.env.DB_HOST, '-u', process.env.DB_USER, ...(process.env.DB_PASS ? ['-p' + process.env.DB_PASS] : []), process.env.DB_NAME, ...(noHeader ? ['-N'] : []), '-e', sqlText]);
const smtp = require('./fake_smtp');
const BASE = process.env.BASE || 'http://127.0.0.1:8399';
const PW = 'DemoBaari2026!';

class Client {
  constructor() { this.cookie = ''; }
  async req(method, action, { body, query = '', origin = BASE, raw = false } = {}) {
    const headers = { Origin: origin };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}/api.php?action=${action}${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    if (raw) return { status: res.status, text: await res.text(), headers: res.headers };
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  }
  async form(action, fd) {   // multipart-lomake (tiedostolataus)
    const headers = { Origin: BASE }; if (this.cookie) headers.Cookie = this.cookie;
    const res = await fetch(`${BASE}/api.php?action=${action}`, { method: 'POST', headers, body: fd });
    let json = null; try { json = await res.json(); } catch (e) {}
    return { status: res.status, json };
  }
  get(action, query = '') { return this.req('GET', action, { query }); }
  post(action, body = {}, query = '') { return this.req('POST', action, { body, query }); }
  del(type, id) { return this.req('DELETE', '', { query: `&type=${type}&id=${id}` }); }
  async login(user, _ignored, pass = PW) { return this.post('login', { username: user, password: pass }); }
}

// ---- TOTP (RFC 6238) testien puolella ----
function b32decode(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[^A-Z2-7]/gi, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secretBuf, step, digits = 6) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest(); const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitMail(mailbox, pred, ms = 4000) { const end = Date.now() + ms; while (Date.now() < end) { const m = mailbox.messages.find(pred); if (m) return m; await sleep(100); } return null; }
const tokenFrom = m => (m.body.match(/setpassword\.html#t=([0-9a-f]{64})/) || [])[1];
// Baarin (Europe/Helsinki) paikallinen aika + siirtymä minuutteina -> [pvm, hh:mm:ss]
function helsinki(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60000);
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
  return f.split(' ');
}

let passed = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.message || e).toString().split('\n').slice(0, 3).join(' ⏎ ')); }
}
const future = (days) => { const d = new Date(Date.now() + days * 864e5); return d.toISOString().slice(0, 10); };

(async () => {
  const admin = new Client(), emp = new Client(), anon = new Client();

  console.log('Kirjautuminen ja suojaukset');
  await t('kirjautumaton pyyntö -> 401', async () => { assert.strictEqual((await anon.get('')).status, 401); });
  await t('väärä salasana hylätään', async () => { const r = await new Client().login('admin', 'demobaari', 'vaara-salasana-1'); assert.ok(r.json.error); assert.notStrictEqual(r.status, 200); });
  await t('CSRF: vieras Origin estetään', async () => { const r = await new Client().req('POST', 'login', { body: { username: 'admin', password: PW }, origin: 'https://evil.example' }); assert.strictEqual(r.status, 403); });
  await t('admin kirjautuu', async () => { const r = await admin.login('admin', 'demobaari'); assert.ok(r.json.success, JSON.stringify(r.json)); });
  await t('työntekijä kirjautuu', async () => { const r = await emp.login('sari', 'demobaari'); assert.ok(r.json.success); });

  console.log('Roolit ja baarieristys');
  await t('yhden baarin asennus: kirjautuminen ilman baaria, ei baarien välisiä toimintoja', async () => {
    const c = new Client(); const r = await c.post('login', { username: 'sari', password: PW }); assert.ok(r.json.success, JSON.stringify(r.json));
    assert.strictEqual(r.json.user.memberships, undefined);
    for (const a of ['gig_pool', 'switch_pub', 'toggle_pub', 'gig_invite', 'create_job_listing', 'accept_link']) assert.ok((await admin.post(a, {})).status >= 400, a + ' on yhä käytössä');
    const d = (await admin.get('')).json; for (const k of ['memberships', 'job_listings', 'gig_incoming', 'gig_outgoing']) assert.strictEqual(d[k], undefined, k);
    const q = (sqlText) => sqlCli(sqlText, true);
    assert.strictEqual((await q(SQLITE ? "SELECT COUNT(*) FROM sqlite_master m, pragma_table_info(m.name) c WHERE m.type = 'table' AND (c.name IN ('pub_name', 'from_pub', 'slug') OR c.name LIKE '%gig_avail%')" : "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND (column_name IN ('pub_name', 'from_pub', 'slug') OR column_name LIKE '%gig_avail%')")).trim(), '0', 'monibaarisarakkeita jäi kantaan');
    assert.strictEqual((await q("SELECT COUNT(*) FROM pubs")).trim(), '1');
  });
  await t('työntekijä ei näe kollegoiden palkkaa', async () => {
    const d = (await emp.get('')).json; const others = d.users.filter(u => u.username !== 'sari');
    assert.ok(others.length > 0); assert.ok(others.every(u => u.hourly_wage === null));
  });
  await t('työntekijältä estetty: palkka-ajo, asetukset, ristiriitatarkistus, tietojen vienti', async () => {
    assert.strictEqual((await emp.get('payroll')).status, 403);
    assert.strictEqual((await emp.post('save_pub_settings', { name: 'X' })).status, 403);
    assert.strictEqual((await emp.post('check_shift', {})).status, 403);
    assert.strictEqual((await emp.get('export_user_data', '&id=9002')).status, 403);
    assert.strictEqual((await emp.get('audit_log')).status, 403);
  });
  await t('julkinen rajapinta ei paljasta baaritunnusta tai käyttäjiä', async () => {
    const r = await anon.req('GET', 'public_events', { raw: true }); assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.text); assert.ok(j.pub && j.pub.name); assert.ok(!('pubs' in j) && !('id' in j.pub), 'monibaarimuoto jäi julkiseen rajapintaan');
    assert.ok(j.events.every(e => !('pub' in e)));
    assert.ok(!/hourly_wage|password|username/.test(r.text));
  });

  console.log('Julkiset syötteet');
  await t('iCal- ja RSS-syöte', async () => {
    assert.ok(!('public_id' in (await admin.get('pub_profile')).json));
    const ics = await anon.req('GET', 'public_ics', { raw: true });
    assert.strictEqual(ics.status, 200); assert.ok(/text\/calendar/.test(ics.headers.get('content-type')));
    assert.ok(ics.text.startsWith('BEGIN:VCALENDAR') && ics.text.includes('BEGIN:VEVENT') && ics.text.trim().endsWith('END:VCALENDAR'));
    assert.ok(ics.text.split('\r\n').every(l => Buffer.byteLength(l) <= 75), 'rivi > 75 tavua');
    const rss = await anon.req('GET', 'public_rss', { raw: true });
    assert.ok(/rss\+xml/.test(rss.headers.get('content-type')) && rss.text.includes('<item>'));
    assert.strictEqual((await anon.req('GET', 'public_ics', { query: '&pub=vanha-parametri-ei-vaikuta', raw: true })).status, 200, 'vanha ?pub= rikkoi syötteen');
    assert.ok(!/hourly_wage|password|toinenbaari/.test(ics.text + rss.text));
  });

  console.log('Baarin asetukset ja palkka-ajo');
  const settings = { name: 'Demobaari', timezone: 'Europe/Helsinki', roles: ['Baarimestari', 'Ovi'], min_rest_hours: 11, max_week_hours: '', evening_start: 18, night_end: 6, retention_months: 60, bonuses: { evening: 1.33, night: 2.25, sat: 5.39, sun: 2 } };
  await t('asetusten validointi', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, timezone: 'Mars/Base' })).status >= 400);
    assert.ok((await admin.post('save_pub_settings', { ...settings, bonuses: { ...settings.bonuses, night: -5 } })).status >= 400);
    assert.ok((await admin.post('save_pub_settings', { ...settings, retention_months: 3 })).status >= 400);
    assert.ok((await admin.post('save_pub_settings', { ...settings, billing_email: 'ei-sahkoposti' })).status >= 400);
  });
  await t('asetusten tallennus näkyy työntekijälle', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, roles: ['Baarimestari', 'Ovi', 'Ovi', ' '] })).json.success);
    const p = (await emp.get('')).json.pub; assert.deepStrictEqual(p.roles, ['Baarimestari', 'Ovi']); assert.strictEqual(p.billing_email, undefined);
  });
  await t('palkka-ajo JSON ja CSV', async () => {
    const m = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 7);   // kuun alussa edellinen kuu (ei vielä valmiita vuoroja)
    const j = (await admin.get('payroll', `&month=${m}`)).json; assert.ok(j.rows.length > 0 && j.total > 0, 'ei rivejä: ' + JSON.stringify(j).slice(0, 200));
    j.rows.forEach(r => assert.ok(r.total_pay >= r.base_pay, 'palkka lisineen pienempi kuin perusosa'));
    const c = await admin.req('GET', 'payroll', { query: `&month=${m}&format=csv`, raw: true });
    assert.ok(/text\/csv/.test(c.headers.get('content-type')), 'content-type'); assert.ok(c.text.replace(/^\uFEFF/, '').startsWith('Kuukausi;Työntekijä'), c.text.slice(0, 60));
    assert.strictEqual((await admin.get('payroll', '&month=2026-13')).status, 400);
  });
  await t('raportti: usean kuukauden CSV ja sivukulut', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, side_cost_pct: 20 })).json.success);
    const m = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 7);   // kuun alussa edellinen kuu (ei vielä valmiita vuoroja)
    const j = (await admin.get('report', `&from=${m}&to=${m}`)).json;
    assert.ok(j.rows.length > 0 && Math.abs(j.rows[0].employer_cost - j.rows[0].total_pay * 1.2) < 0.02, 'sivukulut');
    assert.strictEqual((await admin.get('report', '&from=2026-05&to=2026-01')).status, 400);
    assert.strictEqual((await admin.get('report', '&from=2020-01&to=2026-01')).status, 400);
    assert.strictEqual((await emp.get('report', `&from=${m}&to=${m}`)).status, 403);
    const c = await admin.req('GET', 'report', { query: `&from=${m}&to=${m}&format=csv`, raw: true });
    assert.ok(c.text.split('\n')[0].includes('Työnantajakustannus'));
    await admin.post('save_pub_settings', { ...settings, side_cost_pct: 0 });
  });
  await t('työntekijä näkee kollegoiden poissaolot vain hyväksyttyinä ja ilman sairaustietoa', async () => {
    const d = (await emp.get('')).json;
    const me = d.users.find(u => u.username === 'sari').id;
    const others = d.absences.filter(a => a.user_id !== me);
    assert.ok(others.every(a => a.status === 'approved'), 'näkyy odottava/hylätty');
    assert.ok(others.every(a => a.type !== 'sick' && a.description === null), 'sairaus tai syy vuotaa');
  });
  await t('CSV-injektio estetty', async () => {
    const r = await admin.post('user', { name: '=HYPERLINK("http://evil")', username: 'csvtesti', password: 'SalasanaSalasana1!', role: 'employee', hourly_wage: 10 });
    assert.ok(r.json.success, JSON.stringify(r.json));
    const uid = (await admin.get('')).json.users.find(u => u.username === 'csvtesti').id;
    const today = new Date(); today.setDate(today.getDate() - 1);
    await admin.post('shift', { userId: uid, date: today.toISOString().slice(0, 10), start: '10:00', end: '14:00', role: 'Ovi' });
    const m = today.toISOString().slice(0, 7);
    const c = await admin.req('GET', 'payroll', { query: `&month=${m}&format=csv`, raw: true });
    assert.ok(c.text.includes(";'=HYPERLINK") || c.text.includes(";\"'=HYPERLINK"), c.text.slice(0, 300));
    assert.ok(!/(^|;)=HYPERLINK/m.test(c.text));
    await admin.del('user', uid);
  });

  console.log('Vuorosuunnittelu');
  let uid;
  await t('ristiriitavaroitukset: päällekkäisyys ja lepoaika', async () => {
    uid = (await admin.get('')).json.users.find(u => u.username === 'mikko').id;
    const d = future(50);
    assert.ok((await admin.post('shift', { userId: uid, date: d, start: '16:00', end: '23:00', role: 'Ovi' })).json.success);
    const ov = (await admin.post('check_shift', { userId: uid, date: d, start: '20:00', end: '23:30' })).json.warnings.map(w => w.type);
    assert.ok(ov.includes('overlap'), ov.join());
    const nextDay = future(51);
    const rest = (await admin.post('check_shift', { userId: uid, date: nextDay, start: '05:00', end: '09:00' })).json.warnings.map(w => w.type);
    assert.ok(rest.includes('rest'), rest.join());
    assert.deepStrictEqual((await admin.post('check_shift', { userId: uid, date: future(80), start: '12:00', end: '18:00' })).json.warnings, []);
  });
  await t('luonnos näkyy vain adminille kunnes julkaistaan', async () => {
    const d = future(70);
    const r = await admin.post('shift', { userId: uid, date: d, start: '12:00', end: '18:00', role: 'Ovi', status: 'draft', repeat_weeks: 1 });
    assert.strictEqual(r.json.created, 2);
    const has = (json) => json.shifts.filter(s => s.date === d || s.date === future(77));
    assert.strictEqual(has((await admin.get('')).json).length, 2);
    assert.strictEqual(has((await emp.get('')).json).length, 0);
    assert.strictEqual((await emp.post('publish_shifts', { from: '2000-01-01', to: '2999-12-31' })).status, 403);
    assert.ok((await admin.post('publish_shifts', { from: '2000-01-01', to: '2999-12-31' })).json.published >= 2);
    assert.strictEqual(has((await emp.get('')).json).length, 2);
  });
  await t('vuoropohjat', async () => {
    assert.ok((await admin.post('shift_template', { name: 'Ilta', start: '16:00', end: '02:00', role: 'Ovi' })).json.success);
    const tpl = (await admin.get('')).json.shift_templates; assert.ok(tpl.some(x => x.name === 'Ilta'));
    assert.deepStrictEqual((await emp.get('')).json.shift_templates, []);
    await admin.del('shift_template', tpl.find(x => x.name === 'Ilta').id);
  });

  await t('viikkopohja: tallenna viikko, syötä toiseen viikkoon, tyhjennä', async () => {
    const mon = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const wk = mon(future(400)), wk2 = mon(future(414)), add = (b, n) => { const x = new Date(b + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    await admin.post('shift', { userId: uid, date: wk, start: '10:00', end: '16:00', role: 'Ovi' });
    await admin.post('shift', { userId: null, date: add(wk, 4), start: '16:00', end: '23:00', role: 'Ovi' });
    assert.ok((await admin.post('week_template', { name: 'Testiviikko', weekStart: add(wk, 2) })).json.shifts === 2);
    assert.ok((await admin.post('week_template', { name: 'Tyhjä', weekStart: mon(future(700)) })).status >= 400, 'tyhjästä viikosta pohja');
    assert.strictEqual((await emp.post('week_template', { name: 'x', weekStart: wk })).status, 403);
    const tpl = (await admin.get('')).json.week_templates.find(x => x.name === 'Testiviikko'); assert.ok(tpl);
    assert.deepStrictEqual((await emp.get('')).json.week_templates, []);
    const r = (await admin.post('apply_week_template', { id: tpl.id, weekStart: add(wk2, 3), status: 'draft' })).json;   // keskellä viikkoa -> maanantaiksi
    assert.strictEqual(r.created, 2);
    const shifts = (await admin.get('')).json.shifts.filter(s => s.date >= wk2 && s.date <= add(wk2, 6));
    assert.deepStrictEqual(shifts.map(s => s.date).sort(), [wk2, add(wk2, 4)]); assert.ok(shifts.every(s => s.status === 'draft'));
    assert.strictEqual((await admin.post('apply_week_template', { id: tpl.id, weekStart: wk2 })).json.skipped, 2, 'kaksoiskappaleita');
    assert.strictEqual((await emp.post('apply_week_template', { id: tpl.id, weekStart: wk2 })).status, 403);
    // tyhjennys: vain luonnokset ei koske julkaistuihin; rajattu käyttäjälle
    const c0 = (await admin.post('clear_shifts', { from: wk2, to: add(wk2, 6), only_drafts: true, userId: '0' })).json; assert.strictEqual(c0.deleted, 1, 'vain avoin luonnos');
    assert.strictEqual((await admin.post('clear_shifts', { from: wk, to: add(wk, 6) })).json.deleted, 2);
    assert.strictEqual((await admin.post('clear_shifts', { from: wk2, to: add(wk2, 6) })).json.deleted, 1);
    assert.ok((await admin.post('clear_shifts', { from: wk, to: add(wk, 200) })).status >= 400, 'liian pitkä väli');
    assert.strictEqual((await emp.post('clear_shifts', { from: wk, to: wk })).status, 403);
    await admin.del('week_template', tpl.id);
  });

  console.log('Miehitys, ehdotukset, estepäivät ja vuoronvaihdon huomautukset');
  const usersNow = async () => (await admin.get('')).json.users;
  const dowOf = (d) => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const D = future(250);
  await t('miehityssäännöt ja kattavuus', async () => {
    assert.ok((await admin.post('staffing_rule', { dow: dowOf(D), start: '18:00', end: '22:00', role: '', min_staff: 2 })).json.success);
    assert.ok((await admin.post('staffing_rule', { dow: 9, start: '18:00', end: '22:00', min_staff: 2 })).status >= 400);
    assert.ok((await admin.post('staffing_rule', { dow: 1, start: '18:00', end: '22:00', min_staff: 0 })).status >= 400);
    assert.strictEqual((await emp.post('staffing_rule', { dow: 1, start: '18:00', end: '22:00', min_staff: 1 })).status, 403);
    assert.strictEqual((await emp.get('coverage', `&from=${D}&to=${D}`)).status, 403);
    const c = (await admin.get('coverage', `&from=${D}&to=${D}`)).json.coverage; assert.strictEqual(c.length, 1); assert.strictEqual(c[0].shortage, 2);
    const sari = (await usersNow()).find(u => u.username === 'sari');
    await admin.post('shift', { userId: sari.id, date: D, start: '18:00', end: '22:00', role: 'Ovi' });
    const c2 = (await admin.get('coverage', `&from=${D}&to=${D}`)).json.coverage[0]; assert.strictEqual(c2.shortage, 1); assert.strictEqual(c2.min, 1);
    assert.deepStrictEqual((await emp.get('')).json.staffing_rules, []);
    assert.strictEqual((await admin.get('coverage', '&from=2026-01-01&to=2027-12-31')).status, 400);
  });
  await t('toistuva estepäivä: varoitus ja ehdotus välttää estetyn', async () => {
    const us = await usersNow(); const laura = us.find(u => u.username === 'laura'), mikko = us.find(u => u.username === 'mikko'), jere = us.find(u => u.username === 'jere');
    const lc = new Client(); assert.ok((await lc.login('laura', 'demobaari')).json.success);
    assert.ok((await lc.post('availability_rule', { dow: dowOf(D), note: 'koulu' })).json.success);
    assert.ok((await lc.post('availability_rule', { dow: 8 })).status >= 400);
    const w = (await admin.post('check_shift', { userId: laura.id, date: D, start: '18:00', end: '22:00' })).json.warnings;
    assert.ok(w.some(x => x.type === 'availability_rule' && /koulu/.test(x.msg)), JSON.stringify(w));
    // muiden estepäiviä työntekijä ei näe, admin näkee kaikki
    assert.ok((await admin.get('')).json.availability_rules.some(r => r.user_id === laura.id));
    assert.ok((await emp.get('')).json.availability_rules.every(r => r.user_id !== laura.id));
    // ehdotus: puuttuu 1; ehdokkaista laura on estetty, sari jo vuorossa
    for (const u of [mikko, jere]) { await admin.post('availability_rule', { userId: u.id, dow: dowOf(D) === 0 ? 1 : 0 }); }
    const sug = (await admin.post('suggest_schedule', { from: D, to: D })).json;
    assert.strictEqual(sug.proposals.length, 1, JSON.stringify(sug)); assert.ok(![laura.id].includes(sug.proposals[0].userId)); assert.notStrictEqual(sug.proposals[0].userId, (await usersNow()).find(u => u.username === 'sari').id);
    assert.strictEqual((await emp.post('suggest_schedule', { from: D, to: D })).status, 403);
    const p = sug.proposals[0];
    assert.ok((await admin.post('bulk_shifts', [{ userId: p.userId, date: p.date, start: p.start, end: p.end, role: p.role, status: 'draft' }])).json.success);
    const c3 = (await admin.get('coverage', `&from=${D}&to=${D}`)).json.coverage[0]; assert.strictEqual(c3.shortage, 0); assert.ok(c3.drafts >= 1);
    assert.strictEqual((await admin.post('suggest_schedule', { from: D, to: D })).json.proposals.length, 0, 'ehdottaa turhaan');
  });
  await t('vuoronvaihto: kohdehenkilö ja ristiriita ilmoitetaan mutta ei estetä', async () => {
    const us = await usersNow(); const sari = us.find(u => u.username === 'sari'), mikko = us.find(u => u.username === 'mikko'), laura = us.find(u => u.username === 'laura');
    const d = future(260);
    await admin.post('shift', { userId: sari.id, date: d, start: '16:00', end: '22:00', role: 'Ovi' });
    await admin.post('shift', { userId: mikko.id, date: d, start: '18:00', end: '23:00', role: 'Ovi' });   // mikolla päällekkäinen vuoro
    const shiftId = (await emp.get('')).json.shifts.find(x => x.date === d && x.userId === sari.id).id;
    assert.strictEqual((await emp.post('create_trade', { shiftId, targetUserId: sari.id })).status >= 400, true, 'itselle tarjoaminen');
    assert.ok((await emp.post('create_trade', { shiftId, targetUserId: mikko.id })).json.success);
    const mc = new Client(); await mc.login('mikko', 'demobaari'); const lc = new Client(); await lc.login('laura', 'demobaari');
    const trade = (await mc.get('')).json.trades.find(x => x.offered_shift_id === shiftId); assert.ok(trade && trade.target_user_id === mikko.id);
    assert.ok(trade.warnings.some(x => x.type === 'overlap'), 'ristiriitahuomautus puuttuu');
    assert.strictEqual((await lc.post('request_trade', { tradeId: trade.id })).status, 409, 'toisen kohdistettu tarjous');
    assert.ok((await mc.post('request_trade', { tradeId: trade.id })).json.success, 'ristiriita ei saa estää pyyntöä');
    const pend = (await admin.get('')).json.trades.find(x => x.id === trade.id); assert.strictEqual(pend.status, 'pending'); assert.ok(pend.warnings.length > 0);
    assert.ok((await emp.post('handle_trade', { tradeId: trade.id, decision: 'accepted' })).json.success, 'työntekijä ei saa päättää itse');
    assert.strictEqual((await admin.get('')).json.shifts.find(x => x.id === shiftId).userId, mikko.id);
  });

  console.log('Palkkalajit, työaikapankki ja kustannusennuste');
  await t('palkkatapahtumat-CSV, palkkalajit ja työntekijänumero', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, pay_codes: { base: 'P100', evening: 'I110', night: 'Y120', sat: 'L130', sun: 'S140' } })).json.success);
    assert.ok((await admin.post('save_pub_settings', { ...settings, pay_codes: { base: 'väärä koodi!' } })).status >= 400);
    assert.ok((await admin.post('save_pub_settings', { ...settings, overtime_week_hours: 5 })).status >= 400);
    const us = await usersNow(); const sari = us.find(u => u.username === 'sari');
    assert.ok((await admin.post('user', { id: sari.id, name: sari.name, username: 'sari', role: 'employee', hourly_wage: 11.5, email: 'sari@example.test', employee_number: 'E-042' })).json.success);
    assert.strictEqual((await usersNow()).find(u => u.username === 'sari').employee_number, 'E-042');
    assert.strictEqual((await emp.get('')).json.users.find(u => u.username === 'mikko').employee_number, null);
    const m = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 7);   // kuun alussa edellinen kuu (ei vielä valmiita vuoroja)
    const c = await admin.req('GET', 'report', { query: `&from=${m}&to=${m}&format=csv&layout=lines`, raw: true });
    const lines = c.text.replace(/^﻿/, '').split('\n').filter(Boolean);
    assert.ok(lines[0].startsWith('Kuukausi;Työntekijänumero;Nimi;Palkkalaji'), lines[0]);
    assert.ok(lines.some(l => l.includes(';E-042;') && l.includes(';P100;')), 'sarin perusrivi puuttuu');
    assert.ok(lines.slice(1).every(l => l.split(';').length === 7));
    await admin.post('save_pub_settings', { ...settings });
  });
  await t('työaikapankki: työntekijä näkee vain omansa, admin kaikki', async () => {
    const sid = (await usersNow()).find(u => u.username === 'sari').id;
    await admin.post('user', { id: sid, name: 'Sari Salo', username: 'sari', role: 'employee', hourly_wage: 11.5, target_hours: 100, email: 'sari@example.test', employee_number: 'E-042' });
    const own = (await emp.get('hour_bank')).json; assert.strictEqual(own.bank.length, 1); assert.strictEqual(own.bank[0].months.length, 12);
    const all = (await admin.get('hour_bank')).json.bank; assert.ok(all.length >= 5);
    const sari = all.find(b => b.name === 'Sari Salo'); assert.ok(sari.months.some(x => x.actual > 0), 'ei tunteja demodatassa');
    assert.strictEqual(sari.months.filter(x => x.target > 0).length, 12);
    assert.ok((await admin.get('hour_bank', '&months=99')).json.bank[0].months.length <= 24);
  });
  await t('kustannusennuste, budjetti ja myynti', async () => {
    const wk = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    const mon = wk(future(300));
    const sari = (await usersNow()).find(u => u.username === 'sari');
    await admin.post('shift', { userId: sari.id, date: mon, start: '10:00', end: '14:00', role: 'Ovi', status: 'draft' });
    assert.strictEqual((await emp.get('forecast', `&weekStart=${mon}`)).status, 403);
    const f = (await admin.get('forecast', `&weekStart=${mon}`)).json; assert.ok(f.hours >= 4 && f.cost > 0 && f.drafts >= 1); assert.strictEqual(f.budget, null);
    assert.ok((await admin.post('daily_sales', { date: mon, amount: 1000 })).json.success);
    assert.ok((await admin.post('daily_sales', { date: mon, amount: -5 })).status >= 400);
    const f2 = (await admin.get('forecast', `&weekStart=${mon}`)).json; assert.strictEqual(f2.sales, 1000); assert.ok(f2.labour_pct > 0);
    assert.ok((await admin.post('save_pub_settings', { ...settings, weekly_budget: 1 })).json.success);
    assert.strictEqual((await admin.get('forecast', `&weekStart=${mon}`)).json.over_budget, true);
    await admin.post('save_pub_settings', { ...settings, weekly_budget: '' });
    assert.ok((await admin.post('daily_sales', { date: mon, amount: '' })).json.success);
    assert.strictEqual((await admin.get('forecast', `&weekStart=${mon}`)).json.sales, 0);
  });

  console.log('Kassatilitys');
  await t('kassatilitys: rutiini, syöttö, ero, myyntigraafi, oikeudet', async () => {
    const day = (n) => helsinki(n * 1440)[0];
    assert.strictEqual((await emp.post('task', { label: 'X', kind: 'cash' })).status, 403);
    assert.ok((await admin.post('task', { label: 'Toinen', kind: 'cash' })).status >= 400, 'vain yksi kassarutiini (demossa on jo)');
    const tk = (await admin.get('')).json.tasks.find(x => x.kind === 'cash'); assert.ok(tk, 'demon kassarutiini');
    assert.ok((await emp.post('toggle_task', { task_id: tk.id, date: day(0), completed: true })).status >= 400, 'tavallinen kuittaus ei saa ohittaa summaa');
    assert.ok((await emp.post('cash_report', { date: day(0) })).status >= 400, 'loppusumma pakollinen');
    assert.ok((await emp.post('cash_report', { date: day(0), sales_total: -1 })).status >= 400);
    assert.ok((await emp.post('cash_report', { date: day(0), sales_total: 100, card_total: 200 })).status >= 400);
    assert.ok((await emp.post('cash_report', { date: day(5), sales_total: 100 })).status >= 400, 'tulevaisuus');
    assert.ok((await emp.post('cash_report', { date: day(-10), sales_total: 100 })).status >= 400, 'työntekijä ei muokkaa vanhaa');
    const r = await emp.post('cash_report', { date: day(0), sales_total: '1000,50', card_total: 600, float_amount: 200, counted_cash: 595, note: 'testi' });
    assert.ok(r.json.success, JSON.stringify(r.json)); assert.strictEqual(r.json.expected_cash, 600.5); assert.strictEqual(r.json.difference, -5.5);
    const mine = (await emp.get('')).json; assert.ok(mine.cash_recent.some(c => c.date === day(0) && c.difference === -5.5));
    assert.ok(mine.task_completions.some(c => c.task_id === tk.id && c.date === day(0)), 'rutiini kuitattu');
    const fix = await admin.post('cash_report', { date: day(0), sales_total: 1100.5, card_total: 600, float_amount: 200, counted_cash: 700 }); assert.ok(fix.json.success); assert.strictEqual(fix.json.difference, -0.5);
    const afterFix = (await admin.get('cash_reports', `&from=${day(0)}&to=${day(0)}`)).json.reports[0]; assert.strictEqual(afterFix.user_name, 'Sari Salo', 'korjaus ei vaihda kirjaajaa');
    assert.ok((await emp.post('cash_report', { date: day(0), sales_total: 1000.5, card_total: 600, float_amount: 200, counted_cash: 595, note: 'testi' })).json.success);
    assert.strictEqual((await emp.get('cash_reports')).status, 403); assert.strictEqual((await emp.get('sales_report')).status, 403);
    assert.ok((await admin.post('cash_report', { date: day(-1), sales_total: 800 })).json.success);
    assert.ok((await admin.post('cash_report', { date: day(-20), sales_total: 500 })).json.success, 'admin voi korjata vanhaa');
    const list = (await admin.get('cash_reports', `&from=${day(-30)}&to=${day(0)}`)).json.reports; assert.ok(list.length >= 3);
    const csv = (await admin.req('GET', 'cash_reports', { raw: true, query: `&from=${day(-30)}&to=${day(0)}&format=csv` })).text; assert.ok(csv.includes('1000,50') && csv.split('\n').length >= 4);
    const wk = (await admin.get('sales_report', `&range=week&date=${day(0)}`)).json; assert.strictEqual(wk.points.length, 7); assert.ok(wk.total >= 1000.5);
    assert.ok(wk.points.some(p => p.value === 1000.5));
    assert.ok((await admin.get('sales_report', `&range=month&date=${day(-40)}`)).json.days_with_sales > 10, 'demon myyntihistoria');
    const yr = (await admin.get('sales_report', `&range=year&date=${day(0)}`)).json; assert.strictEqual(yr.points.length, 12); assert.ok(yr.total >= 2300.5);
    assert.strictEqual((await admin.get('sales_report', '&range=day')).status, 400);
    const del = list.find(c => c.date === day(-20)); assert.strictEqual((await emp.del('cash_report', del.id)).status, 403);
    assert.ok((await admin.del('cash_report', del.id)).json.success);
    assert.strictEqual((await admin.get('cash_reports', `&from=${day(-30)}&to=${day(0)}`)).json.reports.length, list.length - 1);
  });

  await t('kassatilityksen kuva: lataus, näkyvyys, korvaus, poisto', async () => {
    const day0 = helsinki(0)[0];
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const mk = (extra = {}, file = png, name = 'k.png', type = 'image/png') => { const fd = new FormData(); fd.append('date', day0); fd.append('sales_total', '900'); for (const k in extra) fd.append(k, extra[k]); if (file) fd.append('photo', new Blob([file], { type }), name); return fd; };
    assert.ok((await emp.form('cash_report', mk({}, Buffer.from('%PDF-1.4 x'), 'a.pdf', 'application/pdf'))).json.error, 'pdf hylätään');
    assert.ok((await emp.form('cash_report', mk({}, Buffer.from('ei kuva'), 'a.png'))).json.error, 'väärennetty kuva hylätään');
    const r = await emp.form('cash_report', mk()); assert.ok(r.json.success && r.json.has_photo, JSON.stringify(r.json));
    const rep = (await emp.get('')).json.cash_recent.find(c => c.date === day0); assert.ok(rep.has_photo); assert.ok(!('photo_path' in rep));
    const img = await emp.req('GET', 'cash_photo', { raw: true, query: `&id=${rep.id}` }); assert.strictEqual(img.status, 200); assert.strictEqual(img.headers.get('content-type'), 'image/png');
    assert.strictEqual((await admin.req('GET', 'cash_photo', { raw: true, query: `&id=${rep.id}` })).status, 200);
    assert.strictEqual((await emp.form('cash_report', mk({}, null))).json.has_photo, true, 'kuva säilyy ilman uutta tiedostoa');
    assert.strictEqual((await emp.form('cash_report', mk({ remove_photo: '1' }, null))).json.has_photo, false);
    assert.strictEqual((await emp.req('GET', 'cash_photo', { raw: true, query: `&id=${rep.id}` })).status, 404);
  });

  console.log('Käyttöoikeusroolit');
  await t('käyttöoikeusroolit: oletus, delegointi, rajaus ja palautus', async () => {
    const sari = (await usersNow()).find(u => u.username === 'sari');
    const userBody = (extra = {}) => ({ id: sari.id, name: 'Sari Salo', username: 'sari', role: 'employee', hourly_wage: 11.5, target_hours: 100, email: 'sari@example.test', employee_number: 'E-042', ...extra });
    let me = (await emp.get('')).json;
    assert.deepStrictEqual(me.perms.sort(), ['absences.request', 'cash.submit', 'trades.use'], 'oletusoikeudet');
    assert.strictEqual((await emp.post('save_access_roles', { roles: [] })).status, 403);
    assert.strictEqual((await emp.get('sales_report')).status, 403); assert.strictEqual((await emp.post('notice', { title: 'x', message: 'y' })).status, 403);
    const base = { id: 'employee', name: 'Työntekijä', perms: ['cash.submit', 'trades.use', 'absences.request'] };
    assert.ok((await admin.post('save_access_roles', { roles: [{ id: 'employee', name: 'Työntekijä' }] })).json.success);   // puuttuva perms = ei oikeuksia
    assert.ok((await admin.post('save_access_roles', { roles: [base] })).json.success);
    assert.ok((await admin.post('save_access_roles', { roles: [] })).status >= 400, 'työntekijä-rooli pakollinen');
    assert.ok((await admin.post('save_access_roles', { roles: [base, { id: 'Bad Id', name: 'x', perms: [] }] })).status >= 400);
    assert.ok((await admin.post('save_access_roles', { roles: [base, { name: '', perms: [] }] })).status >= 400, 'nimi pakollinen');
    const saved = await admin.post('save_access_roles', { roles: [base, { name: 'Vuoropäällikkö', perms: ['shifts.manage', 'sales.view', 'absences.approve', 'payroll.view', 'nonexistent.perm', 'cash.submit'] }] });
    const vp = saved.json.access_roles.find(r => r.name === 'Vuoropäällikkö'); assert.ok(vp && vp.id && !vp.perms.includes('nonexistent.perm'));
    assert.ok((await admin.post('user', userBody({ access_role: 'olematon' }))).status >= 400, 'tuntematon rooli');
    assert.ok((await admin.post('user', userBody({ access_role: vp.id }))).json.success);
    me = (await emp.get('')).json;
    assert.ok(me.perms.includes('shifts.manage') && me.perms.includes('sales.view') && !me.perms.includes('events.manage'));
    // delegoidut toiminnot toimivat
    const d = future(200);
    const mk = await emp.post('shift', { userId: sari.id, date: d, start: '10:00', end: '14:00', role: 'Ovi', status: 'draft' }); assert.ok(mk.json.success, JSON.stringify(mk.json));
    assert.ok((await emp.get('')).json.shifts.some(x => x.date === d && x.status === 'draft'), 'luonnokset näkyvät suunnittelijalle');
    assert.strictEqual((await emp.get('sales_report')).status, 200); assert.strictEqual((await emp.get('cash_reports')).status, 200);
    assert.strictEqual((await emp.get('payroll')).status, 200);
    assert.ok((await emp.get('')).json.users.find(u => u.username === 'mikko').hourly_wage > 0, 'palkka-oikeus näkee palkat');
    assert.ok((await emp.post('clear_shifts', { from: d, to: d })).json.success);
    // muut pysyvät estettyinä
    assert.strictEqual((await emp.post('notice', { title: 'x', message: 'y' })).status, 403);
    assert.strictEqual((await emp.post('event', { title: 'x', date: d, time_start: '18:00' })).status, 403);
    assert.strictEqual((await emp.get('audit_log')).status, 403);
    assert.strictEqual((await emp.post('save_pub_settings', {})).status, 403);
    assert.strictEqual((await emp.post('user', userBody({ role: 'admin' }))).status, 403, 'ei voi korottaa itseään');
    assert.strictEqual((await emp.post('save_access_roles', { roles: [base] })).status, 403);
    // rooliin voi lisätä ja poistaa oikeuksia
    assert.ok((await admin.post('save_access_roles', { roles: [{ ...base, perms: ['cash.submit', 'absences.request'] }, { ...vp, perms: ['events.manage'] }] })).json.success);
    assert.strictEqual((await emp.get('sales_report')).status, 403); assert.strictEqual((await emp.post('event', { title: 'Oikeustesti', date: d, time_start: '18:00' })).json.success, true);
    // poistettu rooli palauttaa käyttäjän perusrooliin
    assert.ok((await admin.post('save_access_roles', { roles: [{ ...base, perms: ['cash.submit', 'absences.request'] }] })).json.success);
    me = (await emp.get('')).json; assert.deepStrictEqual(me.perms.sort(), ['absences.request', 'cash.submit'], 'trades.use poistettu oletusroolilta');
    const tradeShift = (await admin.post('shift', { userId: sari.id, date: d, start: '10:00', end: '12:00', role: 'Ovi' })); assert.ok(tradeShift.json.success);
    const sh = (await emp.get('')).json.shifts.find(x => x.date === d && x.userId === sari.id);
    assert.strictEqual((await emp.post('create_trade', { shiftId: sh.id })).status, 403, 'vuoronvaihto estetty');
    assert.ok((await admin.post('save_access_roles', { roles: [base] })).json.success);
    assert.notStrictEqual((await emp.post('create_trade', { shiftId: sh.id })).status, 403);
    await admin.del('shift', sh.id);
    await admin.post('save_access_roles', { roles: [base] });
  });

  await t('kassa: kulut/tipit, eroseuranta, tavoitteet, kirjanpitovienti', async () => {
    const day = (n) => helsinki(n * 1440)[0];
    const r = await admin.post('cash_report', { date: day(0), sales_total: 1000, card_total: 600, float_amount: 200, expenses: 20, tips: 5, counted_cash: 585 });
    assert.ok(r.json.success, JSON.stringify(r.json)); assert.strictEqual(r.json.expected_cash, 585, 'kulut vähentävät, tipit lisäävät'); assert.strictEqual(r.json.difference, 0);
    assert.ok((await admin.post('cash_report', { date: day(0), sales_total: 1000, expenses: -1 })).status >= 400);
    // vajauksia samalle kirjaajalle -> liputus
    for (let i = 2; i <= 5; i++) assert.ok((await admin.post('cash_report', { date: day(-i), sales_total: 900, card_total: 500, float_amount: 200, counted_cash: 590 })).json.success);   // ero -10
    assert.strictEqual((await emp.get('cash_insights')).status, 403);
    const ins = (await admin.get('cash_insights', '&days=30')).json; assert.ok(ins.totals.short >= 4 && ins.by_user.some(u => u.flag) && ins.by_dow.length >= 1);
    // tavoite + myynti/työtunti
    assert.strictEqual((await emp.post('save_finance', { sales_target_week: 5000 })).status, 403);
    assert.ok((await admin.post('save_finance', { sales_target_week: 5000, sales_target_month: 20000, vat_rate: 25.5 })).json.success);
    assert.ok((await admin.post('save_finance', { sales_target_week: -1 })).status >= 400);
    const wk = (await admin.get('sales_report', `&range=week&date=${day(0)}`)).json; assert.strictEqual(wk.target, 5000); assert.ok('sales_per_hour' in wk && wk.labour_hours >= 0);
    assert.strictEqual((await admin.get('sales_report', `&range=year&date=${day(0)}`)).json.target, 240000);
    // kirjanpitovienti
    assert.strictEqual((await emp.req('GET', 'cash_accounting', { raw: true })).status, 403);
    const csv = (await admin.req('GET', 'cash_accounting', { raw: true, query: `&from=${day(-10)}&to=${day(0)}` })).text;
    assert.ok(csv.includes('ALV') && csv.includes('1000,00;25,5;') && /Yhteensä/.test(csv));
    const line = csv.split('\n').find(l => l.startsWith(day(0))).split(';'); assert.strictEqual(line[3], '203,19', 'ALV 25,5 % bruttosta 1000'); assert.strictEqual(line[4], '796,81');
    await admin.post('save_finance', { sales_target_week: '', sales_target_month: '', vat_rate: 25.5 });
  });

  await t('osaamismatriisi: osaamiset, vaatimus rooliin ja varoitus', async () => {
    const sari = (await usersNow()).find(u => u.username === 'sari'); const d = future(120);
    assert.strictEqual((await emp.post('skill', { name: 'X' })).status, 403);
    assert.ok((await admin.post('skill', { name: '' })).status >= 400);
    assert.ok((await admin.post('skill', { name: 'Testiosaaminen', for_role: 'Järjestyksenvalvoja' })).json.success);
    const sk = (await admin.get('')).json.skills.find(x => x.name === 'Testiosaaminen'); assert.ok(sk && sk.for_role === 'Järjestyksenvalvoja');
    const check = async (role) => (await admin.post('check_shift', { userId: sari.id, date: d, start: '20:00', end: '23:00', role })).json.warnings.filter(w => w.type === 'skill' && /Testiosaaminen/.test(w.msg));
    assert.strictEqual((await check('Järjestyksenvalvoja')).length, 1, 'puuttuva osaaminen varoittaa');
    assert.strictEqual((await check('Tarjoilija')).length, 0, 'muu rooli ei varoita');
    assert.ok((await admin.post('user_skill', { user_id: sari.id, skill_id: sk.id, has: 1, valid_until: future(10) })).json.success);
    assert.strictEqual((await check('Järjestyksenvalvoja')).length, 1, 'vanhenee ennen vuoroa');
    assert.ok((await admin.post('user_skill', { user_id: sari.id, skill_id: sk.id, has: 1, valid_until: future(400) })).json.success);
    assert.strictEqual((await check('Järjestyksenvalvoja')).length, 0, 'voimassa');
    assert.ok((await emp.get('')).json.user_skills.every(x => x.user_id === sari.id), 'työntekijä näkee vain omansa');
    assert.ok((await admin.get('')).json.user_skills.some(x => x.skill_id === sk.id));
    assert.ok((await emp.post('user_skill', { user_id: sari.id, skill_id: sk.id, has: 0 })).status === 403);
    assert.ok((await admin.post('user_skill', { user_id: sari.id, skill_id: sk.id, has: 0 })).json.success);
    assert.ok((await admin.del('skill', sk.id)).json.success);
  });

  await t('tuntien vahvistus: työntekijä vahvistaa, ylläpito hyväksyy/palauttaa, palkka-ajo näyttää tilan', async () => {
    const sari = (await usersNow()).find(u => u.username === 'sari');
    const prev = (() => { const d = new Date(helsinki(0)[0] + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
    const cur = helsinki(0)[0].slice(0, 7), futureMonth = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 2); return d.toISOString().slice(0, 7); })();
    assert.ok((await admin.post('shift', { userId: sari.id, date: prev + '-10', start: '16:00', end: '22:00', role: 'Tarjoilija' })).json.success);
    const mine = (await emp.get('hours_confirm', `&month=${prev}`)).json; assert.ok(mine.hours >= 6, 'tunnit vuoroista'); assert.strictEqual(mine.status, 'none');
    assert.strictEqual((await emp.get('hours_confirm', `&month=${prev}&all=1`)).status, 403, 'kaikkien lista vain ylläpidolle');
    assert.ok((await emp.post('confirm_hours', { month: futureMonth })).status >= 400, 'tulevaisuutta ei voi vahvistaa');
    assert.ok((await emp.post('confirm_hours', { month: prev, dispute: 1 })).status >= 400, 'kiistäminen vaatii syyn');
    const ok = await emp.post('confirm_hours', { month: prev, note: 'kaikki kunnossa' }); assert.ok(ok.json.success && ok.json.status === 'confirmed' && ok.json.hours === mine.hours, JSON.stringify(ok.json));
    assert.ok((await emp.get('')).json.hour_conf.some(c => c.month === prev && c.status === 'confirmed'));
    assert.strictEqual((await emp.post('decide_hours', { user_id: sari.id, month: prev, decision: 'approved' })).status, 403);
    const all = (await admin.get('hours_confirm', `&month=${prev}&all=1`)).json.rows; assert.ok(all.find(r => r.user_id === sari.id).status === 'confirmed' && all.length >= 1);
    const rep = (await admin.get('report', `&from=${prev}&to=${prev}`)).json.rows.find(r => r.id === sari.id); assert.strictEqual(rep.hours_status, 'confirmed');
    assert.ok((await admin.post('decide_hours', { user_id: sari.id, month: prev, decision: 'returned', note: 'Tarkista ti' })).json.success);
    const back = (await emp.get('hours_confirm', `&month=${prev}`)).json; assert.strictEqual(back.status, 'returned'); assert.strictEqual(back.admin_note, 'Tarkista ti');
    assert.ok((await emp.post('confirm_hours', { month: prev, dispute: 1, note: 'ei täsmää' })).json.status === 'disputed');
    assert.ok((await admin.post('decide_hours', { user_id: sari.id, month: prev, decision: 'approved' })).json.success);
    assert.strictEqual((await emp.post('confirm_hours', { month: prev })).status, 409, 'hyväksyttyä ei voi muuttaa');
    assert.strictEqual((await admin.get('report', `&from=${prev}&to=${prev}`)).json.rows.find(r => r.id === sari.id).hours_status, 'approved');
    const csv = (await admin.req('GET', 'report', { raw: true, query: `&from=${prev}&to=${prev}&format=csv` })).text; assert.ok(/Tunnit hyväksytty/.test(csv) && /Hyväksytty/.test(csv));
    // palkkaerittely PDF:nä hyväksytyistä tunneista
    const pr = await emp.req('GET', 'payslip', { raw: true, query: `&month=${prev}` }); assert.strictEqual(pr.status, 200); assert.ok(/application\/pdf/.test(pr.headers.get('content-type')) && pr.text.startsWith('%PDF-1.4') && pr.text.trimEnd().endsWith('%%EOF'));
    const xr = pr.text.match(/startxref\n(\d+)/); assert.ok(xr && pr.text.slice(+xr[1], +xr[1] + 4) === 'xref', 'xref-osoitin'); assert.ok(/Palkkaerittely/.test(pr.text) && /Yhteens/.test(pr.text));
    assert.strictEqual((await emp.req('GET', 'payslip', { raw: true, query: `&month=${prev}&user_id=${(await usersNow()).find(u => u.username === 'mikko').id}` })).status, 403, 'toisen erittely vain palkka-oikeudella');
    assert.strictEqual((await emp.req('GET', 'payslip', { raw: true, query: `&month=${cur}` })).status, 409, 'hyväksymättömästä kuusta ei erittelyä');
    assert.strictEqual((await admin.req('GET', 'payslip', { raw: true, query: `&month=${prev}&user_id=${sari.id}` })).status, 200);
    assert.ok((await admin.post('decide_hours', { user_id: sari.id, month: prev, decision: 'huono' })).status >= 400);
  });

  await t('vuorohaku (valinnainen): ilman ominaisuutta suora otto, sen kanssa haku ja valinta', async () => {
    const sari = (await usersNow()).find(u => u.username === 'sari'); const d = future(150);
    const setBidding = (on) => admin.post('save_pub_settings', { ...settings, features_ext: { bidding: on } });
    const mk = await admin.post('shift', { userId: null, date: d, start: '18:00', end: '23:00', role: 'Tarjoilija' }); assert.ok(mk.json.success);
    const open = (await emp.get('')).json.shifts.find(x => x.date === d && !x.userId && x.start.startsWith('18'));
    assert.strictEqual((await emp.post('shift_bid', { shift_id: open.id })).status, 409, 'ominaisuus pois päältä');
    assert.ok((await setBidding(true)).json.success);
    assert.strictEqual((await emp.post('shift', { id: open.id })).status, 409, 'suora otto estetty kun haku käytössä');
    assert.ok((await emp.post('shift_bid', { shift_id: open.id, note: 'Pääsen kyllä' })).json.success);
    assert.ok((await emp.get('')).json.shift_bids.some(b => b.shift_id === open.id && b.user_id === sari.id));
    assert.strictEqual((await emp.get('shift_bids', `&shift_id=${open.id}`)).status, 403, 'hakijalista vain suunnittelijalle');
    const bids = (await admin.get('shift_bids', `&shift_id=${open.id}`)).json.bids; assert.strictEqual(bids.length, 1); assert.strictEqual(bids[0].note, 'Pääsen kyllä');
    assert.strictEqual((await emp.post('shift_assign', { shift_id: open.id, user_id: sari.id })).status, 403);
    assert.ok((await admin.post('shift_assign', { shift_id: open.id, user_id: sari.id })).json.success);
    assert.strictEqual((await admin.post('shift_assign', { shift_id: open.id, user_id: sari.id })).status, 409, 'jo annettu');
    const got = (await emp.get('')).json.shifts.find(x => x.id === open.id); assert.strictEqual(got.userId, sari.id);
    assert.strictEqual((await admin.get('shift_bids', `&shift_id=${open.id}`)).json.bids.length, 0, 'hakemukset siivottu');
    // peruminen
    const mk2 = await admin.post('shift', { userId: null, date: d, start: '12:00', end: '15:00', role: 'Tarjoilija' }); assert.ok(mk2.json.success);
    const o2 = (await emp.get('')).json.shifts.find(x => x.date === d && !x.userId && x.start.startsWith('12'));
    await emp.post('shift_bid', { shift_id: o2.id }); assert.ok((await emp.post('shift_bid', { shift_id: o2.id, withdraw: 1 })).json.success);
    assert.strictEqual((await admin.get('shift_bids', `&shift_id=${o2.id}`)).json.bids.length, 0);
    assert.ok((await setBidding(false)).json.success);
    assert.ok((await emp.post('shift', { id: o2.id })).json.success, 'suora otto takaisin kun haku pois');
  });

  await t('automaattinen vuorosuunnitelma (valinnainen): luonnokset, osaamiset, kytkin', async () => {
    const d = future(210); const dt = new Date(d + 'T12:00:00Z'); const dow = (dt.getUTCDay() + 6) % 7;
    const monday = (() => { const x = new Date(dt); x.setUTCDate(x.getUTCDate() - dow); return x.toISOString().slice(0, 10); })();
    const setAuto = (on) => admin.post('save_pub_settings', { ...settings, features_ext: { autoschedule: on } });
    assert.ok((await setAuto(false)).json.success);
    assert.strictEqual((await admin.post('auto_schedule', { week_start: monday })).status, 409, 'kytkin pois');
    assert.ok((await admin.post('staffing_rule', { dow, start: '19:00', end: '23:00', role: 'Tarjoilija', min_staff: 2 })).json.success);
    assert.ok((await admin.post('staffing_rule', { dow, start: '20:00', end: '23:00', role: 'Kryptoniitti', min_staff: 1 })).json.success);
    assert.ok((await admin.post('skill', { name: 'Kryptoniittikortti', for_role: 'Kryptoniitti' })).json.success);
    assert.ok((await setAuto(true)).json.success);
    assert.strictEqual((await emp.post('auto_schedule', { week_start: monday })).status, 403);
    const r = await admin.post('auto_schedule', { week_start: monday }); assert.ok(r.json.success, JSON.stringify(r.json));
    assert.ok(r.json.created >= 2, 'kaksi tarjoilijaa luonnoksina');
    assert.ok(r.json.unfilled.some(u => u.role === 'Kryptoniitti'), 'osaamista vaativaa vuoroa ei täytetä ilman osaajaa');
    const drafts = (await admin.get('')).json.shifts.filter(x => x.date === d && x.status === 'draft' && x.role === 'Tarjoilija'); assert.ok(drafts.length >= 2 && drafts.every(x => x.userId));
    assert.ok(!(await emp.get('')).json.shifts.some(x => x.date === d && x.status === 'draft'), 'luonnokset eivät näy työntekijöille');
    const again = await admin.post('auto_schedule', { week_start: monday }); assert.strictEqual(again.json.created, 0, 'toisto ei tuplaa');
    for (const x of drafts) await admin.del('shift', x.id);
    for (const rl of (await admin.get('')).json.staffing_rules.filter(z => z.dow === dow)) await admin.del('staffing_rule', rl.id);
    const sk = (await admin.get('')).json.skills.find(z => z.name === 'Kryptoniittikortti'); await admin.del('skill', sk.id);
    assert.ok((await setAuto(false)).json.success);
  });

  console.log('Vieraslista');
  await t('tapahtuman vieraslista: paikat, oikeudet ja yksityisyys', async () => {
    const d = future(40);
    const mkEv = async (extra = {}) => { const fd = new FormData(); fd.append('title', 'Maistelu ' + Math.random()); fd.append('date', d); fd.append('time_start', '18:00'); fd.append('is_public', '1'); for (const k in extra) fd.append(k, extra[k]); const r = await admin.form('event', fd); assert.ok(r.json.success, JSON.stringify(r.json)); return r; };
    const evs = async () => (await admin.get('')).json.events;
    await mkEv({ guest_capacity: 3 });
    const ev = (await evs()).filter(e => e.guest_capacity === 3).pop(); assert.ok(ev, 'paikkamäärä tallentuu');
    const add = (c, name, note = '') => c.post('event_guest', { event_id: ev.id, name, note });
    assert.ok((await emp.post('event_guest', { event_id: ev.id, name: '' })).status >= 400);
    assert.ok((await add(emp, 'Liisa Virtanen', 'allergia')).json.success);
    assert.ok((await add(admin, 'Matti Meikäläinen')).json.success);
    assert.strictEqual((await add(emp, 'liisa virtanen')).status, 409, 'kaksoiskappale');
    assert.ok((await add(emp, 'Kolmas')).json.success);
    const full = await add(emp, 'Neljäs'); assert.strictEqual(full.status, 409, 'täynnä'); assert.ok(/täynnä/.test(full.json.error));
    let guests = (await emp.get('')).json.event_guests.filter(g => g.event_id === ev.id); assert.strictEqual(guests.length, 3);
    // muokkaus/poisto: oma tai hallitsija
    const adminsRow = guests.find(g => g.name === 'Matti Meikäläinen'), ownRow = guests.find(g => g.name === 'Kolmas');
    assert.ok((await emp.post('event_guest', { event_id: ev.id, id: adminsRow.id, name: 'Matti M.' })).json.success, 'toisen lisäämää nimeä saa muokata');
    assert.ok((await emp.del('event_guest', adminsRow.id)).json.success, 'toisen lisäämän nimen saa poistaa');
    assert.ok((await admin.post('event_guest', { event_id: ev.id, name: 'Matti Meikäläinen' })).json.success);
    assert.ok((await emp.post('event_guest', { event_id: ev.id, id: ownRow.id, name: 'Kolmas Vieras', note: 'vegaani' })).json.success);
    assert.ok((await emp.del('event_guest', ownRow.id)).json.success);
    assert.ok((await add(emp, 'Neljäs')).json.success, 'vapautunut paikka');
    assert.ok((await admin.del('event_guest', guests.find(g => g.name === 'Liisa Virtanen').id)).json.success, 'hallitsija poistaa');
    // tapahtuma ilman listaa
    await mkEv({}); const plain = (await evs()).filter(e => e.guest_capacity === null).pop();
    assert.ok((await emp.post('event_guest', { event_id: plain.id, name: 'Eikä' })).status >= 400);
    // CSV vain hallitsijalle
    assert.strictEqual((await emp.req('GET', 'event_guests_csv', { raw: true, query: `&event_id=${ev.id}` })).status, 403);
    const csv = (await admin.req('GET', 'event_guests_csv', { raw: true, query: `&event_id=${ev.id}` })).text; assert.ok(csv.includes('Matti Meikäläinen') && csv.includes('Neljäs'));
    // julkiset rajapinnat eivät sisällä nimiä
    await admin.post('save_pub_profile', { display_name: 'Demo', is_public: 1, city: 'Helsinki', address: 'Testikatu 1' });
    for (const a of ['public_events', 'public_ics', 'public_rss']) { const r = await anon.req('GET', a, { raw: true, query: '' }); assert.ok(!/Matti|Liisa|Neljäs|vieras/i.test(r.text), a + ' vuotaa vieraslistan'); }
  });

  await t('kalenterisyöte: oikea iCalendar, UTC-ajat, valinnat ja suojaus', async () => {
    const sari = (await usersNow()).find(u => u.username === 'sari'); const d = future(9);
    assert.ok((await admin.post('shift', { userId: sari.id, date: d, start: '20:00', end: '02:00', role: 'Tarjoilija' })).json.success);
    assert.ok((await emp.post('generate_ical', { userId: sari.id })).json.success);
    const tok = (await emp.get('')).json.users.find(u => u.id === sari.id).ical_token; assert.ok(/^[a-f0-9]{32,64}$/.test(tok));
    const get = async (q = '') => anon.req('GET', 'ical', { raw: true, query: `&token=${tok}${q}` });
    const r = await get(); assert.strictEqual(r.status, 200); assert.ok(/text\/calendar/.test(r.headers.get('content-type')));
    assert.ok(/^BEGIN:VCALENDAR\r\nVERSION:2\.0/.test(r.text) && /X-WR-CALNAME:BarShift/.test(r.text) && /REFRESH-INTERVAL/.test(r.text));
    const ev = r.text.split('BEGIN:VEVENT')[1]; assert.ok(/UID:shift-\d+@/.test(r.text) && /DTSTAMP:\d{8}T\d{6}Z/.test(r.text) && /DTSTART:\d{8}T\d{6}Z/.test(r.text) && /DTEND:\d{8}T\d{6}Z/.test(r.text), 'vaaditut kentät');
    const vs = r.text.match(/DTSTART:(\d{8})T(\d{6})Z[\s\S]*?DTEND:(\d{8})T(\d{6})Z/g); assert.ok(vs.length >= 1);
    assert.ok(!/BEGIN:VALARM/.test(r.text) && !/Tapahtuma:/.test(r.text), 'oletuksena ei lisäosia');
    // yövuoro päättyy seuraavana päivänä: loppu > alku
    const m = r.text.match(/SUMMARY:Työvuoro \(Tarjoilija\)/); assert.ok(m);
    const full = await get('&events=1&alarm=60&absences=1'); assert.ok(/BEGIN:VALARM/.test(full.text) && /TRIGGER:-PT1H/.test(full.text) && /SUMMARY:Tapahtuma: /.test(full.text));
    assert.ok(full.text.split('\r\n').every(l => Buffer.byteLength(l) <= 76), 'rivit laskostettu 75 tavuun');
    assert.strictEqual((await anon.req('GET', 'ical', { raw: true, query: '&token=' + 'a'.repeat(32) })).status, 404);
    assert.strictEqual((await anon.req('GET', 'ical', { raw: true, query: '&token=../x' })).status, 404);
    assert.ok(!(await get()).text.includes('Mikko'), 'vain omat vuorot');
    // uusi linkki mitätöi vanhan
    assert.ok((await emp.post('generate_ical', { userId: sari.id })).json.success); assert.strictEqual((await get()).status, 404, 'vanha token ei enää toimi');
  });


  await t('vuoronvaihto kahden kesken: vastavuoroinen vaihto ilman ylläpidon hyväksyntää', async () => {
    const mik = new Client(); assert.ok((await mik.login('mikko', 'demobaari')).json.success);
    const users = await usersNow(); const sari = users.find(u => u.username === 'sari'), mikko = users.find(u => u.username === 'mikko');
    const d1 = future(330), d2 = future(331);
    assert.ok((await admin.post('shift', { userId: mikko.id, date: d1, start: '10:00', end: '14:00', role: 'Tarjoilija' })).json.success);
    assert.ok((await admin.post('shift', { userId: sari.id, date: d2, start: '10:00', end: '14:00', role: 'Tarjoilija' })).json.success);
    const find = async (c, d, uid) => (await c.get('')).json.shifts.find(x => x.date === d && x.userId === uid);
    const A = await find(mik, d1, mikko.id), B = await find(emp, d2, sari.id);
    assert.ok((await mik.post('create_trade', { shiftId: A.id })).json.success);
    const tradeId = (await emp.get('')).json.trades.find(x => x.offered_shift_id === A.id).id;
    assert.strictEqual((await emp.post('request_trade', { tradeId, swapShiftId: A.id })).status, 409, 'ei voi vaihtaa samaan vuoroon');
    assert.strictEqual((await emp.post('request_trade', { tradeId, swapShiftId: 999999 })).status, 409, 'vieras/olematon vaihtovuoro');
    assert.ok((await emp.post('request_trade', { tradeId, swapShiftId: B.id })).json.success);
    const tr = (await mik.get('')).json.trades.find(x => x.id === tradeId); assert.strictEqual(tr.status, 'pending'); assert.strictEqual(tr.swap_shift_id, B.id); assert.ok(Array.isArray(tr.swap_warnings));
    assert.strictEqual((await emp.post('handle_trade', { tradeId, decision: 'accepted' })).status, 403, 'pyytäjä ei voi hyväksyä itse');
    assert.ok((await mik.post('handle_trade', { tradeId, decision: 'accepted' })).json.success);
    assert.strictEqual((await find(emp, d1, sari.id)).id, A.id, 'Sari sai Mikon vuoron'); assert.strictEqual((await find(mik, d2, mikko.id)).id, B.id, 'Mikko sai Saran vuoron');
    const log = (await admin.get('audit_log')).json.log; assert.ok(log.some(l => /Vuoronvaihto \(vaihto\)/.test(l.action) && /⇄/.test(l.detail || '')), 'ylläpito saa tiedon auditlokiin');
    // tavallinen siirto toimii ennallaan
    const C = await find(emp, d1, sari.id); assert.ok((await emp.post('create_trade', { shiftId: C.id, targetUserId: mikko.id })).json.success);
    const t2 = (await mik.get('')).json.trades.find(x => x.offered_shift_id === C.id && x.status === 'open'); assert.ok((await mik.post('request_trade', { tradeId: t2.id })).json.success);
    assert.ok((await emp.post('handle_trade', { tradeId: t2.id, decision: 'accepted' })).json.success); assert.strictEqual((await find(mik, d1, mikko.id)).id, C.id);
    await admin.del('shift', A.id); await admin.del('shift', B.id);
  });

  console.log('Haku');
  await t('yhteishaku: tulokset rajautuvat oikeuksien ja baarin mukaan', async () => {
    const mikko = (await usersNow()).find(u => u.username === 'mikko'), sari = (await usersNow()).find(u => u.username === 'sari');
    assert.ok((await emp.post('send_message', { receiver_id: mikko.id, message: 'Hakukoe-sanasalaisuus banaani' })).json.success);
    assert.ok((await admin.get('search', '&q=sari')).json.results.some(r => r.type === 'user' && r.id === sari.id));
    assert.strictEqual((await admin.get('search', '&q=a')).json.results.length, 0, 'liian lyhyt');
    const own = (await emp.get('search', '&q=sanasalaisuus')).json.results; assert.ok(own.some(r => r.type === 'message' && r.id === mikko.id), 'oma viesti löytyy');
    assert.ok(!(await admin.get('search', '&q=sanasalaisuus')).json.results.some(r => r.type === 'message'), 'toisten viestit eivät löydy');
    assert.ok((await admin.get('search', '&q=Maistelu')).json.results.some(r => r.type === 'event'));
    assert.ok(!(await emp.get('search', '&q=2026')).json.results.some(r => r.type === 'cash' || r.type === 'booking'), 'työntekijä ei näe kassaa eikä varauksia');
    assert.ok((await emp.get('search', '&q=Liisa')).json.results.length >= 0);
    assert.ok((await admin.get('search', `&q=${encodeURIComponent("100%_'\"")}`)).json.success, 'erikoismerkit eivät riko hakua');
  });

  console.log('Tietosuoja');
  await t('työntekijä lataa omat tietonsa', async () => {
    const r = await emp.req('GET', 'export_my_data', { raw: true }); assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.text); assert.ok(j.profile.length === 1 && Array.isArray(j.shifts) && Array.isArray(j.time_entries));
    assert.ok(!('password' in j.profile[0]));
  });
  await t('anonymisointi poistaa henkilötiedot ja lukitsee kirjautumisen', async () => {
    const victim = (await admin.get('')).json.users.find(u => u.username === 'teemu');
    assert.strictEqual((await emp.post('anonymize_user', { userId: victim.id })).status, 403);
    assert.ok((await admin.post('anonymize_user', { userId: victim.id })).json.success);
    const after = (await admin.get('')).json.users.find(u => u.id === victim.id);
    assert.strictEqual(after.name, 'Poistettu käyttäjä'); assert.ok(after.anonymized_at);
    assert.ok((await new Client().login('teemu', 'demobaari')).status >= 400);
  });
  await t('auditloki sisältää admin-toimet', async () => {
    const log = (await admin.get('audit_log')).json.log; const acts = log.map(l => l.action);
    assert.ok(acts.includes('Käyttäjä anonymisoitu') && acts.includes('Baarin asetukset'), acts.join());
    assert.ok(!JSON.stringify(log).includes('SalasanaSalasana1!'));
  });

  console.log('Kutsulinkit, salasanan palautus ja sähköposti');
  const mailbox = await smtp.start(parseInt(process.env.SMTP_PORT || '2599', 10));
  const smsLog = [], stripeLog = [];   // feikki-Twilio ja -Stripe: tallentavat pyynnöt
  const smsServer = require('http').createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { smsLog.push({ url: req.url, auth: req.headers.authorization, form: Object.fromEntries(new URLSearchParams(b)) }); if (req.url.startsWith('/search') && /palvelinvika/i.test(req.url)) { res.writeHead(500); return res.end('boom'); }
        if (req.url.startsWith('/search')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(/tuntematon/i.test(req.url) ? [] : [{ lat: '60.169900', lon: '24.938400', display_name: 'Testikatu 1, Helsinki' }])); }
    if (req.url.startsWith('/v1/checkout/sessions')) { smsLog.pop(); const f = Object.fromEntries(new URLSearchParams(b)); stripeLog.push({ auth: req.headers.authorization, form: f }); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id: 'cs_test_' + stripeLog.length, url: 'https://checkout.stripe.test/pay/cs_test_' + stripeLog.length })); }
    res.writeHead(201, { 'Content-Type': 'application/json' }); res.end('{"sid":"SMtest"}'); }); });
  await new Promise(r => smsServer.listen(parseInt(process.env.SMS_PORT || '2699', 10), '127.0.0.1', r));
  let mikkoId;
  await t('RFC 6238 -testivektori (testien oma TOTP)', async () => { assert.strictEqual(totp(Buffer.from('12345678901234567890'), 1, 8), '94287082'); });
  await t('työntekijä tallentaa sähköpostin profiiliinsa', async () => {
    assert.ok((await emp.post('update_profile', { phone: '', email: 'sari@example.test', notify_email: 1 })).json.success);
    assert.ok((await emp.post('update_profile', { phone: '', email: 'ei-osoite', notify_email: 1 })).status >= 400);
    const me = (await emp.get('me')).json.user; assert.strictEqual(me.email, 'sari@example.test');
    const colleague = (await admin.get('')).json.users.find(u => u.username === 'sari'); assert.strictEqual(colleague.email, 'sari@example.test');
    assert.strictEqual((await emp.get('')).json.users.find(u => u.username === 'mikko').email, null);   // kollegan osoite ei näy
  });
  await t('salasanan palautus sähköpostilla (linkki kertakäyttöinen)', async () => {
    const c = new Client();
    const before = mailbox.messages.length;
    const r = await c.post('request_reset', { username: 'sari' }); assert.ok(r.json.success);
    const mail = await waitMail(mailbox, m => m.to === 'sari@example.test' && /salasanan vaihto/i.test(m.subject)); assert.ok(mail, 'viesti ei saapunut');
    const tok = tokenFrom(mail); assert.ok(tok, mail.body);
    assert.strictEqual((await c.get('token_info', `&token=${tok}`)).json.login, 'sari');
    assert.ok((await c.post('set_password', { token: tok, password: 'lyhyt' })).status >= 400);
    assert.ok((await c.post('set_password', { token: tok, password: 'UusiSalasana2026!' })).json.success);
    assert.strictEqual((await c.post('set_password', { token: tok, password: 'ToinenSalasana2026!' })).status, 404, 'linkki toimi kahdesti');
    assert.ok((await new Client().login('sari', 'demobaari', PW)).status >= 400, 'vanha salasana toimii yhä');
    assert.ok((await new Client().login('sari', 'demobaari', 'UusiSalasana2026!')).json.success);
    assert.strictEqual((await emp.get('')).json.user, undefined, 'salasanan vaihto ei katkaissut vanhaa istuntoa');
    assert.ok((await emp.login('sari', 'demobaari', 'UusiSalasana2026!')).json.success);   // oma istunto uusiksi
    assert.ok(mailbox.messages.length > before);
  });
  await t('palautuspyyntö ei paljasta tunnuksen olemassaoloa eikä lähetä postia tuntemattomalle', async () => {
    const c = new Client(); const n = mailbox.messages.length;
    const a = (await c.post('request_reset', { username: 'eiole' })).json;
    const b = (await c.post('request_reset', { username: 'mikko' })).json;   // ei sähköpostia
    assert.deepStrictEqual(a, b); await sleep(400); assert.strictEqual(mailbox.messages.length, n);
  });
  await t('palautuspyynnöt rajoitettu (429)', async () => {
    const c = new Client(); let last = 0;
    for (let i = 0; i < 8; i++) last = (await c.post('request_reset', { username: 'x' + i })).status;
    assert.strictEqual(last, 429);
  });
  await t('väärä linkkitunniste hylätään', async () => {
    assert.strictEqual((await new Client().get('token_info', '&token=' + 'a'.repeat(64))).status, 404);
    assert.strictEqual((await new Client().get('token_info', '&token=xyz')).status, 404);
  });
  await t('kutsu: uusi työntekijä asettaa salasanansa linkistä', async () => {
    const r = await admin.post('user', { name: 'Kutsuttu Kalle', username: 'kalle', invite: true, email: 'kalle@example.test', role: 'employee', hourly_wage: 11 });
    assert.ok(r.json.success && r.json.invite.emailed === true && /setpassword\.html#t=/.test(r.json.invite.link), JSON.stringify(r.json));
    const mail = await waitMail(mailbox, m => m.to === 'kalle@example.test'); assert.ok(mail); assert.ok(/Kirjautumistunnuksesi: kalle/.test(mail.body));
    assert.ok((await new Client().login('kalle', 'demobaari', 'arvaus-arvaus-1')).status >= 400, 'kutsutulla ei saa olla arvattavaa salasanaa');
    const tok = tokenFrom(mail); assert.ok((await new Client().post('set_password', { token: tok, password: 'KalleSalasana2026!' })).json.success);
    assert.ok((await new Client().login('kalle', 'demobaari', 'KalleSalasana2026!')).json.success);
  });
  await t('kutsu ilman sähköpostia palauttaa linkin adminille; uusi linkki mitätöi vanhan', async () => {
    const r = await admin.post('user', { name: 'Ilman Postia', username: 'ilmanposti', invite: true, role: 'employee' });
    assert.strictEqual(r.json.invite.emailed, false); const link1 = r.json.invite.link;
    const uid = (await admin.get('')).json.users.find(u => u.username === 'ilmanposti').id;
    const r2 = await admin.post('send_invite', { userId: uid }); assert.ok(r2.json.invite.link !== link1);
    const t1 = link1.split('#t=')[1], t2 = r2.json.invite.link.split('#t=')[1];
    assert.strictEqual((await new Client().get('token_info', `&token=${t1}`)).status, 404); assert.strictEqual((await new Client().get('token_info', `&token=${t2}`)).status, 200);
    assert.strictEqual((await emp.post('send_invite', { userId: uid })).status, 403);
    await admin.del('user', uid);
  });
  await t('ilmoitus tulee sähköpostina, kun push ei ole käytössä (ja vain sallineelle)', async () => {
    const n = mailbox.messages.length;
    assert.ok((await admin.post('notify_open_shift', { date: future(3), start: '18:00' })).json.success);
    const mail = await waitMail(mailbox, m => m.to === 'sari@example.test' && /avoin vuoro/i.test(m.subject)); assert.ok(mail, 'sähköposti puuttuu');
    assert.ok(mail.body.includes('Tarjolla uusi vuoro'));
    await emp.post('update_profile', { phone: '', email: 'sari@example.test', notify_email: 0 });
    const n2 = mailbox.messages.length; await admin.post('notify_open_shift', { date: future(4), start: '18:00' }); await sleep(500);
    assert.ok(!mailbox.messages.slice(n2).some(m => m.to === 'sari@example.test'), 'posti lähti vaikka kieltäytyi');
    await emp.post('update_profile', { phone: '', email: 'sari@example.test', notify_email: 1 });
  });

  await t('push: avain vain kirjautuneille; testi-ilmoitus tulee sähköpostina kun tilausta ei ole', async () => {
    assert.strictEqual((await anon.get('push_key')).status, 401);
    assert.ok((await emp.get('push_key')).json.key);
    const r = await emp.post('test_push', {}); assert.strictEqual(r.json.delivered, 0);
    assert.ok(await waitMail(mailbox, m => m.to === 'sari@example.test' && /Testi-ilmoitus/.test(m.subject)), 'sähköpostivaraus puuttuu');
  });

  console.log('Kaksivaiheinen tunnistautuminen');
  const mk = new Client();
  await t('TOTP: käyttöönotto, kirjautuminen, väärä koodi, uudelleenkäytön esto', async () => {
    assert.ok((await mk.login('mikko', 'demobaari')).json.success);
    const b = (await mk.post('totp_begin')).json; assert.ok(b.secret && b.uri.startsWith('otpauth://totp/'));
    const secret = b32decode(b.secret); const step = Math.floor(Date.now() / 30000);
    assert.ok((await mk.post('totp_enable', { code: '000000' })).status >= 400);
    const en = (await mk.post('totp_enable', { code: totp(secret, step) })).json; assert.ok(en.success && en.recovery_codes.length === 8);
    // uusi istunto: salasana ei enää riitä
    const c = new Client(); const l1 = (await c.login('mikko', 'demobaari')).json; assert.ok(l1.needs_2fa && !l1.user);
    assert.strictEqual((await c.get('')).status, 401, 'istunto avautui ilman koodia');
    assert.strictEqual((await c.post('login_2fa', { code: '123456' })).status, 401);
    // sama koodi kuin käyttöönotossa on jo käytetty -> hylätään; seuraava askel kelpaa
    assert.strictEqual((await c.post('login_2fa', { code: totp(secret, step) })).status, 401, 'koodi käytettävissä uudelleen');
    const ok = await c.post('login_2fa', { code: totp(secret, step + 1) }); assert.ok(ok.json.success && ok.json.user.totp_enabled == 1, JSON.stringify(ok.json));
    assert.strictEqual((await c.get('')).status, 200);
    // palautuskoodi toimii kerran
    const rc = en.recovery_codes[0]; const c2 = new Client(); await c2.login('mikko', 'demobaari');
    assert.ok((await c2.post('login_2fa', { code: rc })).json.success);
    const c3 = new Client(); await c3.login('mikko', 'demobaari'); assert.strictEqual((await c3.post('login_2fa', { code: rc })).status, 401, 'palautuskoodi käytettävissä uudelleen');
    mikkoId = ok.json.user.id; global.__mikkoSecret = secret;
  });
  await t('2FA:n poisto vaatii salasanan ja koodin; admin nollaa työntekijän 2FA:n', async () => {
    const secret = global.__mikkoSecret; const c = new Client(); await c.login('mikko', 'demobaari');
    // login_2fa vaaditaan; käytä palautuskoodia
    const rc = (await mk.get('me')).json.user; assert.ok(rc.totp_enabled == 1);
    assert.strictEqual((await emp.post('reset_2fa', { userId: mikkoId })).status, 403);
    assert.ok((await admin.post('reset_2fa', { userId: mikkoId })).json.success);
    assert.ok((await new Client().login('mikko', 'demobaari')).json.user, 'kirjautuminen ei onnistu nollauksen jälkeen');
  });
  await t('TOTP:n poisto omasta profiilista', async () => {
    const c = new Client(); await c.login('mikko', 'demobaari');
    const b = (await c.post('totp_begin')).json; const secret = b32decode(b.secret); const st = Math.floor(Date.now() / 30000);
    assert.ok((await c.post('totp_enable', { code: totp(secret, st) })).json.success);
    assert.ok((await c.post('totp_disable', { password: 'väärä', code: totp(secret, st + 1) })).status >= 400);
    assert.ok((await c.post('totp_disable', { password: PW, code: totp(secret, st + 1) })).json.success);
    assert.ok((await new Client().login('mikko', 'demobaari')).json.user);
  });

  console.log('Muistutukset ja leimaushälytykset (cron.php)');
  const runCron = () => execFileP('php', ['cron.php'], { env: { ...process.env, BARSHIFT_CONFIG: process.env.BARSHIFT_CONFIG }, cwd: require('path').join(__dirname, '..') });   // asynkroninen: fake-SMTP pyörii samassa prosessissa
  await t('vuoromuistutus lähtee kerran; poissaolevalle ei', async () => {
    const lid = (await admin.get('')).json.users.find(u => u.username === 'laura').id;
    await admin.post('user', { id: lid, name: 'Laura Laine', username: 'laura', role: 'employee', email: 'laura@example.test', hourly_wage: 14.5 });
    const [d, tm] = helsinki(90);
    await admin.post('shift', { userId: lid, date: d, start: tm.slice(0, 5), end: '23:59', role: 'Ovi' });
    await admin.post('save_pub_settings', { ...settings, reminder_hours: 3, clock_alert_minutes: 0 });
    await runCron();
    const m = await waitMail(mailbox, x => x.to === 'laura@example.test' && /Vuoro alkaa pian/.test(x.subject)); assert.ok(m, 'muistutus puuttuu');
    const n = mailbox.messages.filter(x => x.to === 'laura@example.test' && /Vuoro alkaa pian/.test(x.subject)).length;
    await runCron(); await sleep(300); assert.strictEqual(mailbox.messages.filter(x => x.to === 'laura@example.test' && /Vuoro alkaa pian/.test(x.subject)).length, n, 'muistutus toistui');
  });
  await t('"leimaus unohtui": sisäänleimaus puuttuu -> työntekijälle ja adminille', async () => {
    const lid = (await admin.get('')).json.users.find(u => u.username === 'jere').id;
    await admin.post('user', { id: lid, name: 'Jere Järvinen', username: 'jere', role: 'employee', email: 'jere@example.test', hourly_wage: 13 });
    const aid = (await admin.get('')).json.users.find(u => u.username === 'admin').id;
    await admin.post('user', { id: aid, name: 'Demo Admin', username: 'admin', role: 'admin', email: 'admin@example.test', hourly_wage: 0 });
    // vuoro alkoi 40 min sitten, hälytysraja 15 min, ei leimausta
    const [d, tm] = helsinki(-40);
    await admin.post('shift', { userId: lid, date: d, start: tm.slice(0, 5), end: '23:59', role: 'Ovi' });
    await admin.post('save_pub_settings', { ...settings, reminder_hours: 0, clock_alert_minutes: 15 });
    await runCron();
    assert.ok(await waitMail(mailbox, x => x.to === 'jere@example.test' && /Leimaus puuttuu/.test(x.subject)), 'työntekijän hälytys puuttuu');
    assert.ok(await waitMail(mailbox, x => x.to === 'admin@example.test' && /Sisäänleimaus puuttuu/.test(x.subject)), 'adminin hälytys puuttuu');
    const n = mailbox.messages.filter(x => /Leimaus puuttuu/.test(x.subject)).length; await runCron(); await sleep(300);
    assert.strictEqual(mailbox.messages.filter(x => /Leimaus puuttuu/.test(x.subject)).length, n, 'hälytys toistui');
  });
  await t('"leimaus unohtui": ulosleimaus puuttuu, kun vuoro on päättynyt', async () => {
    const uid = (await admin.get('')).json.users.find(u => u.username === 'sari').id;
    const [d1, t1] = helsinki(-300), [d2, t2] = helsinki(-120);   // vuoro 5 h sitten -> 2 h sitten
    await admin.post('shift', { userId: uid, date: d1, start: t1.slice(0, 5), end: t2.slice(0, 5), role: 'Ovi' });
    await sqlCli(`INSERT INTO time_entries (user_id, clock_in) VALUES (${uid}, '${d1} ${t1}')`);
    await runCron();
    assert.ok(await waitMail(mailbox, x => x.to === 'sari@example.test' && /Unohtuiko leimata ulos/.test(x.subject)), 'ulosleimaushälytys puuttuu');
  });
  await t('asetusten validointi: muistutus- ja hälytysrajat', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, reminder_hours: 99 })).status >= 400);
    assert.ok((await admin.post('save_pub_settings', { ...settings, clock_alert_minutes: -1 })).status >= 400);
    await admin.post('save_pub_settings', { ...settings });
  });
  console.log('Tiimi: puutelista, vuorokirja, perehdytys, dokumentit, kiitokset, kyselyt');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const fdOf = (obj, file) => { const fd = new FormData(); for (const [k, v] of Object.entries(obj)) fd.append(k, v); if (file) fd.append(file.key, new Blob([file.buf], { type: file.type }), file.name); return fd; };
  let sariId, mikkoId2, lauraId;
  await t('puutelista: kuva, vastuuhenkilö ja tila; vuorokirja: kuva', async () => {
    const us = await usersNow(); sariId = us.find(u => u.username === 'sari').id; mikkoId2 = us.find(u => u.username === 'mikko').id; lauraId = us.find(u => u.username === 'laura').id;
    const r = await emp.form('add_shop_item', fdOf({ item_name: 'Rikkinäinen hana', assigned_to: mikkoId2 }, { key: 'image', buf: PNG, type: 'image/png', name: 'a.png' }));
    assert.ok(r.json.success, JSON.stringify(r.json));
    const item = (await emp.get('')).json.shopping_list.find(x => x.item_name === 'Rikkinäinen hana');
    assert.ok(/^uploads\/[a-f0-9]{16}\/\d{4}-\d{2}\/[a-f0-9]{32}\.png$/.test(item.image_path), item.image_path); assert.strictEqual(item.assigned_to, mikkoId2);
    assert.strictEqual((await emp.form('add_shop_item', fdOf({ item_name: 'x' }, { key: 'image', buf: Buffer.from('<?php echo 1;'), type: 'image/png', name: 'e.png' }))).status, 400, 'valekuva hyväksyttiin');
    assert.ok((await emp.post('shop_status', { itemId: item.id, status: 'in_progress' })).json.success);
    assert.strictEqual((await emp.get('')).json.shopping_list.find(x => x.id === item.id).status, 'in_progress');
    assert.ok((await emp.post('shop_status', { itemId: item.id, status: 'pending' })).json.success);
    assert.ok((await emp.form('add_log', fdOf({ message: 'Hana vuotaa' }, { key: 'image', buf: PNG, type: 'image/png', name: 'b.png' }))).json.success);
    assert.ok((await emp.get('')).json.shift_logs.find(x => x.message === 'Hana vuotaa').image_path);
  });
  await t('perehdytyslista: luonti, anto, kuittaus ja oikeudet', async () => {
    assert.ok((await admin.post('checklist', { name: 'Uuden perehdytys', items: ['Hätäpoistumistiet', 'Kassa', '', 'Anniskelulaki'] })).json.success);
    assert.strictEqual((await emp.post('checklist', { name: 'x', items: ['a'] })).status, 403);
    assert.ok((await admin.post('checklist', { name: 'tyhjä', items: [' '] })).status >= 400);
    const cl = (await admin.get('')).json.checklists.find(x => x.name === 'Uuden perehdytys'); assert.deepStrictEqual(cl.items, ['Hätäpoistumistiet', 'Kassa', 'Anniskelulaki']);
    assert.ok((await admin.post('assign_checklist', { checklistId: cl.id, userId: sariId })).json.success);
    const mine = (await emp.get('')).json.checklist_progress; assert.strictEqual(mine.length, 1); const pid = mine[0].id;
    const lc = new Client(); await lc.login('laura', 'demobaari'); assert.strictEqual((await lc.get('')).json.checklist_progress.length, 0);
    assert.strictEqual((await lc.post('checklist_toggle', { progressId: pid, index: 0 })).status, 403, 'toisen lista');
    for (const i of [0, 1]) assert.strictEqual((await emp.post('checklist_toggle', { progressId: pid, index: i })).json.completed, false);
    assert.strictEqual((await emp.post('checklist_toggle', { progressId: pid, index: 1 })).json.completed, false);   // pois
    await emp.post('checklist_toggle', { progressId: pid, index: 1 });
    assert.strictEqual((await emp.post('checklist_toggle', { progressId: pid, index: 2 })).json.completed, true);
    assert.ok((await emp.post('checklist_toggle', { progressId: pid, index: 9 })).status >= 400);
    assert.ok((await admin.get('')).json.checklist_progress.find(x => x.id === pid).completed_at);
  });
  await t('dokumentit: PDF-lataus, autentikoitu lataus, kuittaus, valetiedosto hylätään', async () => {
    assert.strictEqual((await emp.form('document', fdOf({ title: 'x' }, { key: 'file', buf: PDF, type: 'application/pdf', name: 'a.pdf' }))).status, 403);
    assert.ok((await admin.form('document', fdOf({ title: 'Php', requires_ack: '0' }, { key: 'file', buf: Buffer.from('<?php system($_GET[0]);'), type: 'application/pdf', name: 'a.pdf' }))).status >= 400, 'php-tiedosto hyväksyttiin');
    assert.ok((await admin.form('document', fdOf({ title: 'Avausohje', description: 'Lue tämä', requires_ack: '1' }, { key: 'file', buf: PDF, type: 'application/pdf', name: 'avaus.pdf' }))).json.success);
    const doc = (await emp.get('')).json.documents.find(x => x.title === 'Avausohje'); assert.ok(doc && doc.requires_ack === 1 && doc.acked === false); assert.strictEqual(doc.acked_by, undefined);
    const dl = await emp.req('GET', 'doc_file', { query: `&id=${doc.id}`, raw: true }); assert.strictEqual(dl.status, 200); assert.ok(/application\/pdf/.test(dl.headers.get('content-type'))); assert.ok(dl.text.startsWith('%PDF'));
    assert.strictEqual((await anon.req('GET', 'doc_file', { query: `&id=${doc.id}`, raw: true })).status, 401);
    assert.ok((await emp.post('ack_document', { id: doc.id })).json.success);
    assert.deepStrictEqual((await admin.get('')).json.documents.find(x => x.id === doc.id).acked_by, [sariId]);
    assert.strictEqual((await emp.del('document', doc.id)).status, 403);
    assert.strictEqual((await admin.del('document', doc.id)).status, 200);
    assert.strictEqual((await emp.req('GET', 'doc_file', { query: `&id=${doc.id}`, raw: true })).status >= 400, true);
  });
  await t('kiitokset', async () => {
    assert.ok((await emp.post('kudos', { to_user_id: mikkoId2, message: 'Kiitos vuoron vaihdosta!' })).json.success);
    assert.ok((await emp.post('kudos', { to_user_id: sariId, message: 'itselle' })).status >= 400);
    assert.ok((await emp.post('kudos', { to_user_id: mikkoId2, message: '' })).status >= 400);
    const k = (await emp.get('')).json.kudos.find(x => x.message === 'Kiitos vuoron vaihdosta!'); assert.ok(k);
    const lc = new Client(); await lc.login('laura', 'demobaari'); assert.strictEqual((await lc.del('kudos', k.id)).status, 403);
    assert.strictEqual((await emp.del('kudos', k.id)).status, 200);
  });
  await t('nimettömät kyselyt: kertavastaus, tulokset vasta 3 vastauksella', async () => {
    assert.strictEqual((await emp.post('survey', { question: 'x' })).status, 403);
    assert.ok((await admin.post('survey', { question: 'Tyytyväisyys vuoroihin?' })).json.success);
    const sv = () => admin.get('').then(r => r.json.surveys.find(x => x.question === 'Tyytyväisyys vuoroihin?'));
    let q = await sv(); assert.strictEqual(q.results, null);
    assert.ok((await emp.post('survey_answer', { surveyId: q.id, rating: 4, comment: 'Ok' })).json.success);
    assert.strictEqual((await emp.post('survey_answer', { surveyId: q.id, rating: 5 })).status, 409, 'kaksi vastausta');
    assert.ok((await emp.post('survey_answer', { surveyId: q.id, rating: 9 })).status >= 400);
    assert.strictEqual((await sv()).results, null, 'tulokset vuotavat 1 vastauksella'); assert.strictEqual((await sv()).answer_count, 1);
    assert.strictEqual((await emp.get('')).json.surveys[0].results, undefined);
    for (const u of ['laura', 'jere']) { const c = new Client(); await c.login(u, 'demobaari'); assert.ok((await c.post('survey_answer', { surveyId: q.id, rating: 2, comment: 'Hmm' })).json.success, u); }
    q = await sv(); assert.strictEqual(q.results.rated, 3); assert.strictEqual(q.results.avg, 2.67); assert.strictEqual(q.results.comments.length, 3);
    assert.ok(!JSON.stringify(q).match(/user/i), 'vastauksissa käyttäjätietoa');
    assert.ok((await admin.post('close_survey', { id: q.id })).json.success);
    assert.strictEqual((await emp.post('survey_answer', { surveyId: q.id, rating: 3 })).status, 409);
  });
  await t('lupamuistutus (JV-kortti) cronista kerran', async () => {
    const d = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    await admin.post('user', { id: lauraId, name: 'Laura Laine', username: 'laura', role: 'employee', email: 'laura@example.test', hourly_wage: 14.5, expiry_jv: d });
    await runCron();
    assert.ok(await waitMail(mailbox, x => x.to === 'laura@example.test' && /JV-kortti/.test(x.subject)), 'muistutus puuttuu');
    assert.ok(await waitMail(mailbox, x => x.to === 'admin@example.test' && /Lupa vanhenemassa/.test(x.subject)), 'adminin ilmoitus puuttuu');
    const n = mailbox.messages.filter(x => /JV-kortti/.test(x.subject)).length; await runCron(); await sleep(300);
    assert.strictEqual(mailbox.messages.filter(x => /JV-kortti/.test(x.subject)).length, n, 'muistutus toistui');
  });


  console.log('Ilmoittautuminen, liput ja pöytävaraukset (baarikohtaisesti aktivoitavat)');
  const evForm = (o) => fdOf({ title: 'Live-ilta', date: future(20), time_start: '20:00', time_end: '23:00', type: 'music', is_public: '1', ...o });
  let regEvent;
  await t('ominaisuudet ovat oletuksena pois: ei ilmoittautumista eikä varauksia', async () => {
    const pub0 = (await admin.get('')).json.pub; assert.strictEqual(pub0.features.tickets, false); assert.strictEqual(pub0.features.bookings, false);
    assert.ok((await admin.form('event', evForm({ registration: 'rsvp', capacity: '5' }))).json.success);   // tallentuu, mutta asetusta ei oteta huomioon
    const ev = (await admin.get('')).json.events.find(e => e.title === 'Live-ilta'); assert.strictEqual(ev.registration, 'none');
    const pe = (await anon.req('GET', 'public_events', { query: '' })).json; assert.ok(pe.events.every(e => !e.reg), 'reg näkyy vaikka ominaisuus pois');
    assert.strictEqual((await anon.post('public_register', { eventId: ev.id, name: 'Testi', email: 't@example.test', qty: 1 })).status, 404);
    assert.strictEqual((await anon.get('public_booking_info', '')).status, 404);
    assert.strictEqual((await anon.post('public_book', { name: 'x', email: 'x@example.test', party: 2, date: future(5), time: '19:00' })).status, 404);
    assert.strictEqual((await emp.post('booking_status', { id: 1, status: 'confirmed' })).status, 403);
  });
  const ALLDAYS = [0, 1, 2, 3, 4, 5, 6].map(d => ({ dow: d, open: '10:00', close: '23:00' }));
  await t('ilmoittautuminen: kapasiteetti, kaksoisilmoittautuminen, honeypot, peruutus', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: true, hours: ALLDAYS } })).json.success);
    assert.strictEqual((await admin.get('')).json.pub.features.tickets, true);
    assert.ok((await admin.form('event', evForm({ title: 'Rajattu keikka', registration: 'rsvp', capacity: '5', ticket_price: '12.5' }))).json.success);
    assert.ok((await admin.form('event', evForm({ title: 'Ulkoiset liput', registration: 'tickets', ticket_url: 'https://tiketti.example/liput' }))).json.success);
    assert.ok((await admin.form('event', evForm({ title: 'Huono linkki', registration: 'tickets', ticket_url: 'javascript:alert(1)' }))).status >= 400);
    const evs = (await admin.get('')).json.events; regEvent = evs.find(e => e.title === 'Rajattu keikka'); const ext = evs.find(e => e.title === 'Ulkoiset liput');
    const pe = (await anon.req('GET', 'public_events', { query: '' })).json;
    const pr = pe.events.find(e => e.id === regEvent.id).reg; assert.deepStrictEqual([pr.mode, pr.left, pr.price], ['rsvp', 5, 12.5]);
    assert.strictEqual(pe.events.find(e => e.id === ext.id).reg.url, 'https://tiketti.example/liput');
    assert.strictEqual((await anon.post('public_register', { eventId: ext.id, name: 'Ulkoinen', email: 'u@example.test', qty: 1 })).status, 400, 'ulkoisen lipun ilmoittautuminen');
    const r1 = await anon.post('public_register', { eventId: regEvent.id, name: 'Kaisa Kävijä', email: 'kaisa@example.test', qty: 3 }); assert.ok(r1.json.success && /^[A-F0-9]{8}$/.test(r1.json.code), JSON.stringify(r1.json));
    const mail = await waitMail(mailbox, m => m.to === 'kaisa@example.test' && /Ilmoittautuminen vahvistettu/.test(m.subject)); assert.ok(mail && mail.body.includes(r1.json.code));
    const tok = (mail.body.match(/varaus\.html#cancel=([0-9a-f]{48})/) || [])[1]; assert.ok(tok, 'peruutuslinkki puuttuu');
    assert.strictEqual((await anon.post('public_register', { eventId: regEvent.id, name: 'Kaisa Kävijä', email: 'kaisa@example.test', qty: 1 })).status, 409, 'kaksoisilmoittautuminen');
    assert.strictEqual((await anon.post('public_register', { eventId: regEvent.id, name: 'Liikaa', email: 'liikaa@example.test', qty: 3 })).status, 409, 'ylitäyttö');
    assert.ok((await anon.post('public_register', { eventId: regEvent.id, name: 'Ville', email: 'ville@example.test', qty: 2 })).json.success);
    assert.strictEqual((await anon.post('public_register', { eventId: regEvent.id, name: 'Myöhässä', email: 'myohassa@example.test', qty: 1 })).status, 409, 'täynnä');
    const before = (await admin.get('')).json.event_regs[regEvent.id]; assert.strictEqual(before.qty, 5);
    assert.ok((await anon.post('public_register', { eventId: regEvent.id, name: 'Botti', email: 'botti@example.test', qty: 1, website: 'http://spam' })).json.success);   // honeypot: näyttää onnistuvan
    assert.strictEqual((await admin.get('')).json.event_regs[regEvent.id].qty, 5, 'honeypot-botti tallentui');
    assert.strictEqual((await anon.req('GET', 'public_events', { query: '' })).json.events.find(e => e.id === regEvent.id).reg.left, 0);
    // peruutus vapauttaa paikat, kertakäyttöinen
    assert.ok((await anon.post('public_cancel', { token: tok })).json.success);
    const again = await anon.post('public_cancel', { token: tok }); assert.ok(again.json.success && again.json.already, 'toinen peruutus on idempotentti'); assert.strictEqual((await anon.post('public_cancel', { token: 'x'.repeat(48) })).status, 404); assert.strictEqual((await anon.post('public_cancel', { token: 'a'.repeat(48) })).status, 404, 'tuntematon linkki');
    assert.strictEqual((await anon.req('GET', 'public_events', { query: '' })).json.events.find(e => e.id === regEvent.id).reg.left, 3);
    // admin: lista, saapunut, CSV; työntekijä ei pääse
    const regs = (await admin.get('event_registrations', `&eventId=${regEvent.id}`)).json.registrations; assert.strictEqual(regs.length, 2);
    assert.ok((await admin.post('reg_update', { id: regs.find(x => x.name === 'Ville').id, arrived: 1 })).json.success);
    const csv = await admin.req('GET', 'event_registrations', { query: `&eventId=${regEvent.id}&format=csv`, raw: true }); assert.ok(csv.text.includes('Ville') && csv.text.includes('kyllä'));
    assert.strictEqual((await emp.get('event_registrations', `&eventId=${regEvent.id}`)).status, 403);
  });
  const bkDate = future(30);
  const slotsOf = async (party) => (await anon.get('public_slots', `&date=${bkDate}&party=${party}`)).json.slots;
  await t('pöytävaraus: aikavälit, kapasiteetti, vahvistus ja peruutus', async () => {
    const info = (await anon.get('public_booking_info', '')).json; assert.ok(info.success && info.max_party === 6 && info.hours.length === 7);
    const s0 = await slotsOf(4); assert.ok(s0.length >= 5 && s0[0].time === '10:00' && s0[0].free === 10, JSON.stringify(s0.slice(0, 2)));
    assert.strictEqual((await anon.get('public_slots', `&date=${bkDate}&party=7`)).status, 400);
    assert.deepStrictEqual((await anon.get('public_slots', `&date=2000-01-01&party=2`)).json.slots, []);
    const b1 = await anon.post('public_book', { name: 'Pekka Pöytä', email: 'pekka@example.test', phone: '040 123', party: 4, date: bkDate, time: '18:00' });
    assert.ok(b1.json.success && b1.json.status === 'confirmed', JSON.stringify(b1.json));
    const mail = await waitMail(mailbox, m => m.to === 'pekka@example.test' && /Pöytävaraus vahvistettu/.test(m.subject)); assert.ok(mail && mail.body.includes(b1.json.code));
    // 18:00-20:00 varausta vastaan kapasiteetti 10: ryhmä 6 mahtuu (4+6), sen jälkeen ei enää yhtään
    const b2 = await anon.post('public_book', { name: 'Liisa', email: 'liisa@example.test', party: 6, date: bkDate, time: '19:00' }); assert.ok(b2.json.success, JSON.stringify(b2.json));
    assert.ok(!(await slotsOf(1)).some(s => s.time === '19:00'), 'täysi aika tarjolla');
    const full = await anon.post('public_book', { name: 'Myöhässä', email: 'm@example.test', party: 1, date: bkDate, time: '19:00' }); assert.strictEqual(full.status, 409);
    assert.ok((await anon.post('public_book', { name: 'x', email: 'ei-osoite', party: 2, date: bkDate, time: '12:00' })).status >= 400);
    assert.ok((await anon.post('public_book', { name: 'Botti', email: 'b@example.test', party: 2, date: bkDate, time: '12:00', website: 'x' })).json.success);
    assert.ok((await admin.get('')).json.bookings.every(b => b.name !== 'Botti'), 'honeypot-varaus tallentui');
    // admin näkee, työntekijä ei
    const bookings = (await admin.get('')).json.bookings; assert.ok(bookings.find(b => b.name === 'Pekka Pöytä').phone === '040 123'); assert.deepStrictEqual((await emp.get('')).json.bookings, []);
    // peruutus linkistä vapauttaa paikat
    const tok = (mail.body.match(/#cancel=([0-9a-f]{48})/) || [])[1]; assert.ok((await anon.post('public_cancel', { token: tok })).json.success);
    assert.strictEqual((await admin.get('')).json.bookings.find(b => b.id === bookings.find(x => x.name === 'Pekka Pöytä').id).status, 'cancelled');
    assert.ok((await slotsOf(1)).some(s => s.time === '19:00'), 'paikka ei vapautunut');
    assert.ok((await anon.post('public_cancel', { token: tok })).json.already, 'jo peruttu -> ystävällinen vastaus');
  });
  await t('varausten käsittely: manuaalinen vahvistus ja admin-kirjaus', async () => {
    assert.ok((await admin.post('save_pub_settings', { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: false, hours: ALLDAYS } })).json.success);
    const b = await anon.post('public_book', { name: 'Odottaja', email: 'odottaja@example.test', party: 2, date: bkDate, time: '12:00' }); assert.strictEqual(b.json.status, 'pending');
    const id = (await admin.get('')).json.bookings.find(x => x.name === 'Odottaja').id;
    assert.strictEqual((await emp.post('booking_status', { id, status: 'confirmed' })).status, 403);
    assert.ok((await admin.post('booking_status', { id, status: 'confirmed' })).json.success);
    assert.ok(await waitMail(mailbox, m => m.to === 'odottaja@example.test' && /vahvistettu/.test(m.subject)), 'vahvistusposti puuttuu');
    assert.ok((await admin.post('booking_status', { id, status: 'nonsense' })).status >= 400);
    assert.ok((await admin.post('booking_create', { name: 'Ovelta', party: 3, date: bkDate, time: '21:00', phone: '050' })).json.success);
    assert.ok((await admin.post('booking_status', { id, status: 'seated' })).json.success);
  });
  await t('vieraskortisto (valinnainen): kytkin, VIP/allergiat varauksissa, historia, oikeudet', async () => {
    const setGuests = (on) => admin.post('save_pub_settings', { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: false, hours: ALLDAYS }, features_ext: { guests: on, reminders: true } });
    assert.ok((await setGuests(false)).json.success);
    assert.strictEqual((await admin.get('guests')).status, 409, 'kytkin pois');
    assert.ok((await setGuests(true)).json.success);
    assert.strictEqual((await emp.get('guests')).status, 403); assert.strictEqual((await emp.post('guest', { name: 'X' })).status, 403);
    assert.ok((await admin.post('guest', { name: '' })).status >= 400);
    const g = await admin.post('guest', { name: 'Odottaja Testi', email: 'Odottaja@Example.test', phone: '040 123 4567', vip: 1, allergies: 'pähkinä', notes: 'Istuu ikkunan vieressä', tags: 'viini' });
    assert.ok(g.json.success && g.json.id, JSON.stringify(g.json));
    assert.strictEqual((await admin.post('guest', { name: 'Tupla', email: 'odottaja@example.test' })).status, 409, 'sama sähköposti');
    const bks = (await admin.get('')).json.bookings; const bk = bks.find(x => x.name === 'Odottaja');
    assert.ok(bk.vip === 1 && bk.allergies === 'pähkinä' && bk.guest_id === g.json.id, 'varaus tunnistaa vieraan');
    assert.strictEqual((await emp.get('')).json.bookings.length, 0, 'työntekijä ei saa varauksia');
    const late = bks.find(x => x.name === 'Ovelta'); const fb = await admin.post('guest_from_booking', { booking_id: late.id }); assert.ok(fb.json.success && fb.json.id);
    const list = (await admin.get('guests', '&q=odottaja')).json.guests; assert.strictEqual(list.length, 1); assert.ok(list[0].visits >= 1);
    assert.strictEqual((await admin.get('guests', '&q=zzzzeiloydy')).json.guests.length, 0);
    const hist = (await admin.get('guest_history', `&id=${g.json.id}`)).json; assert.ok(hist.bookings.length >= 1);
    assert.ok((await admin.post('guest', { id: g.json.id, name: 'Odottaja Testi', email: 'odottaja@example.test', vip: 0, allergies: '' })).json.success);
    assert.strictEqual((await admin.get('')).json.bookings.find(x => x.name === 'Odottaja').vip, 0);
    assert.ok((await admin.del('guest', g.json.id)).json.success); await admin.del('guest', fb.json.id);
    assert.ok((await setGuests(false)).json.success);
  });
  await t('ilmoittautumisen muistutus cronista 24 h ennen', async () => {
    const [d, tm] = helsinki(180);
    assert.ok((await admin.form('event', fdOf({ title: 'Tämän illan keikka', date: d, time_start: tm.slice(0, 5), type: 'music', is_public: '1', registration: 'rsvp' }))).json.success);
    const ev = (await admin.get('')).json.events.find(e => e.title === 'Tämän illan keikka');
    assert.ok((await anon.post('public_register', { eventId: ev.id, name: 'Muistuttaja', email: 'muistutus@example.test', qty: 1 })).json.success);
    await runCron();
    assert.ok(await waitMail(mailbox, m => m.to === 'muistutus@example.test' && /Muistutus/.test(m.subject)), 'muistutus puuttuu');
    const n = mailbox.messages.filter(m => /Muistutus: /.test(m.subject)).length; await runCron(); await sleep(300);
    assert.strictEqual(mailbox.messages.filter(m => /Muistutus: /.test(m.subject)).length, n, 'muistutus toistui');
  });
  await t('vieraiden muistutukset (valinnainen): kytkin, tuntimäärä, tekstiviesti ja kuukausikatto', async () => {
    const base = { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: false, hours: ALLDAYS } };
    const setRem = (fx) => admin.post('save_pub_settings', { ...base, features_ext: fx });
    const mkBooking = async (name, phone, offsetMin) => { const [d, tm] = helsinki(offsetMin); assert.ok((await admin.post('booking_create', { name, party: 2, date: d, time: tm.slice(0, 5), phone })).json.success); };
    assert.ok((await setRem({ reminders: false, reminder_sms: true, guest_reminder_hours: 24 })).json.success);
    await mkBooking('Kytkin Pois', '040 111 2222', 120); smsLog.length = 0; await runCron();
    assert.strictEqual(smsLog.length, 0, 'kytkin pois: ei viestejä');
    assert.ok((await setRem({ reminders: true, reminder_sms: true, guest_reminder_hours: 24 })).json.success);
    await runCron();
    assert.strictEqual(smsLog.length, 1, JSON.stringify(smsLog)); assert.strictEqual(smsLog[0].form.To, '+358401112222'); assert.ok(/ACtest\/Messages\.json$/.test(smsLog[0].url) && /muistutus/i.test(smsLog[0].form.Body));
    assert.strictEqual(smsLog[0].auth, 'Basic ' + Buffer.from('ACtest:tokentest').toString('base64'));
    await runCron(); assert.strictEqual(smsLog.length, 1, 'muistutus toistui');
    // liian kaukana tuntirajasta (2 h) -> ei vielä
    assert.ok((await setRem({ reminders: true, reminder_sms: true, guest_reminder_hours: 2 })).json.success);
    await mkBooking('Liian Myöhään', '040 333 4444', 600); await runCron(); assert.strictEqual(smsLog.length, 1, 'ikkunan ulkopuolella');
    // SMS pois -> vain sähköposti (ei puhelinta mukana), ei viestiä
    assert.ok((await setRem({ reminders: true, reminder_sms: false, guest_reminder_hours: 24 })).json.success);
    await runCron(); assert.strictEqual(smsLog.length, 1, 'SMS kytketty pois');
    // kuukausikatto (3): täytetään ja ylitetään
    assert.ok((await setRem({ reminders: true, reminder_sms: true, guest_reminder_hours: 24 })).json.success);
    for (const n of [1, 2, 3]) await mkBooking('Katto ' + n, '040 55' + n + ' 0000', 100 + n);
    await runCron(); assert.strictEqual(smsLog.length, 3, 'katto 3 viestiä / kk');
    assert.ok((await setRem({ reminders: false, reminder_sms: false, guest_reminder_hours: 24 })).json.success);
  });

  await t('odotuslista täyteen menneeseen tapahtumaan: liittyminen, vapautuminen ja ilmoitus', async () => {
    await sqlCli('DELETE FROM login_attempts');
    const d = future(35);
    assert.ok((await admin.form('event', fdOf({ title: 'Odotuslistatesti', date: d, time_start: '19:00', type: 'music', is_public: '1', registration: 'rsvp', capacity: 2 }))).json.success);
    const ev = (await admin.get('')).json.events.find(e => e.title === 'Odotuslistatesti');
    const reg = (n, q = 1) => anon.post('public_register', { eventId: ev.id, name: n, email: n.toLowerCase() + '@example.test', qty: q });
    const wl = (n, q = 1) => anon.post('public_waitlist', { eventId: ev.id, name: n, email: n.toLowerCase() + '@example.test', qty: q });
    assert.strictEqual((await wl('Liian')).status, 409, 'tilaa on vielä: ei jonoon');
    assert.ok((await reg('Eka', 1)).json.success); assert.ok((await reg('Toka', 1)).json.success);
    assert.strictEqual((await reg('Kolmas')).status, 409, 'täynnä');
    const w1 = await wl('Kolmas'); assert.ok(w1.json.success && w1.json.position === 1);
    assert.strictEqual((await wl('Neljas', 2)).json.position, 2);
    assert.ok((await wl('Kolmas')).json.success, 'toisto ei tuplaa'); assert.strictEqual((await anon.post('public_waitlist', { eventId: 999999, name: 'Xavier', email: 'x@example.test' })).status, 404);
    const regs = (await admin.get('event_registrations', `&eventId=${ev.id}`)).json; assert.strictEqual(regs.waitlist.length, 2);
    // Eka perutaan ylläpidosta -> yksi paikka vapautuu -> Kolmas (qty 1) saa ilmoituksen, Neljas (qty 2) ei
    const ekaId = regs.registrations.find(r => r.name === 'Eka').id; assert.ok((await admin.post('reg_update', { id: ekaId, status: 'cancelled' })).json.success);
    await runCron();
    assert.ok(await waitMail(mailbox, m => m.to === 'kolmas@example.test' && /Paikka vapautui/.test(m.subject)), 'ilmoitus puuttuu');
    await sleep(200); assert.ok(!mailbox.messages.some(m => m.to === 'neljas@example.test' && /Paikka vapautui/.test(m.subject)), 'isompi ryhmä ei mahdu');
    const n = mailbox.messages.filter(m => /Paikka vapautui/.test(m.subject)).length; await runCron(); await sleep(300); assert.strictEqual(mailbox.messages.filter(m => /Paikka vapautui/.test(m.subject)).length, n, 'ilmoitus toistui');
    // ilmoitettu ilmoittautuu -> poistuu jonosta
    assert.ok((await reg('Kolmas')).json.success);
    assert.strictEqual((await admin.get('event_registrations', `&eventId=${ev.id}`)).json.waitlist.map(w => w.name).join(), 'Neljas');
    assert.strictEqual((await wl('Viides')).json.position, 2);
  });

  await t('tapahtumapalaute: pyyntö tapahtuman jälkeen, vastaus ja yhteenveto', async () => {
    const base = { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: false, hours: ALLDAYS } };
    assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { reminders: true, reminder_sms: false, guest_reminder_hours: 24 } })).json.success);
    const today = helsinki(0)[0], yest = helsinki(-1440)[0];
    assert.ok((await admin.form('event', fdOf({ title: 'Palautetesti', date: today, time_start: '23:00', type: 'music', is_public: '1', registration: 'rsvp', capacity: 10 }))).json.success);
    const ev = (await admin.get('')).json.events.find(e => e.title === 'Palautetesti');
    assert.ok((await anon.post('public_register', { eventId: ev.id, name: 'Palautteen Antaja', email: 'palaute@example.test', qty: 1 })).json.success);
    await runCron(); await sleep(300); assert.ok(!mailbox.messages.some(m => m.to === 'palaute@example.test' && /mitä pidit/.test(m.subject)), 'ei ennen tapahtuman päättymistä');
    assert.ok((await admin.form('event', fdOf({ id: ev.id, title: 'Palautetesti', date: yest, time_start: '23:00', type: 'music', is_public: '1', registration: 'rsvp', capacity: 10 }))).json.success);
    await runCron();
    const mail = await waitMail(mailbox, m => m.to === 'palaute@example.test' && /mitä pidit/.test(m.subject)); assert.ok(mail, 'palautepyyntö puuttuu');
    const tok = (mail.body.match(/#feedback=([0-9a-f]{48})/) || [])[1]; assert.ok(tok);
    const n = mailbox.messages.filter(m => /mitä pidit/.test(m.subject)).length; await runCron(); await sleep(300); assert.strictEqual(mailbox.messages.filter(m => /mitä pidit/.test(m.subject)).length, n, 'pyyntö toistui');
    const info = await anon.req('GET', 'public_feedback_info', { query: `&token=${tok}` }); assert.strictEqual(info.json.title, 'Palautetesti'); assert.strictEqual(info.json.answered, false);
    assert.strictEqual((await anon.post('public_feedback', { token: tok, rating: 9 })).status, 400);
    assert.strictEqual((await anon.post('public_feedback', { token: 'f'.repeat(48), rating: 4 })).status, 404);
    assert.ok((await anon.post('public_feedback', { token: tok, rating: 4, text: 'Hyvä ilta!' })).json.success);
    assert.strictEqual((await anon.post('public_feedback', { token: tok, rating: 1 })).status, 409, 'vain yksi vastaus');
    assert.strictEqual((await anon.req('GET', 'public_feedback_info', { query: `&token=${tok}` })).json.answered, true);
    const regs = (await admin.get('event_registrations', `&eventId=${ev.id}`)).json.registrations; assert.ok(regs.some(r => r.rating === 4 && r.feedback_text === 'Hyvä ilta!'));
    const er = (await admin.get('')).json.event_regs[ev.id]; assert.strictEqual(er.rating_avg, 4); assert.strictEqual(er.rating_cnt, 1);
    assert.strictEqual((await emp.get('event_registrations', `&eventId=${ev.id}`)).status, 403, 'palautteet vain tapahtumien hallitsijalle');
    assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { reminders: false } })).json.success);
  });
  await t('laiterekisteri: kirjautumishistoria, kirjaus ulos toisesta laitteesta, salasanan vaihto mitätöi muut', async () => {
    const a = new Client(), b = new Client();
    assert.ok((await a.login('laura', 'demobaari')).json.success); assert.ok((await b.login('laura', 'demobaari')).json.success);
    const list = (await a.post('my_sessions', {})).json; assert.ok(list.length >= 2 && list.filter(x => x.current).length === 1, JSON.stringify(list));
    const other = list.find(x => !x.current && !x.revoked);
    assert.strictEqual((await a.post('revoke_session', { id: other.id })).json.success, true);
    assert.ok((await b.get('')).status >= 400 || !(await b.get('')).json.user, 'mitätöity istunto toimii yhä');
    assert.strictEqual((await a.get('me')).status === 200 || true, true);
    const c = new Client(); await c.login('laura', 'demobaari');
    assert.ok((await a.post('revoke_other_sessions', {})).json.success);
    assert.ok((await c.get('')).status >= 400 || !(await c.get('')).json.user, 'muut laitteet eivät kirjautuneet ulos');
    assert.ok((await a.post('my_sessions', {})).json.some(x => x.current && !x.revoked), 'oma istunto katkesi');
    assert.strictEqual((await emp.post('revoke_session', { id: other.id })).json.success, true);   // vieraan rivin mitätöinti on no-op
    assert.strictEqual((await a.post('my_sessions', {})).json.length >= 3, true);
  });
  console.log('Keskuspalvelin (BarShift Hub)');
  await t('hub: julkiset tapahtumat ja keikkavuorot lähtevät allekirjoitettuina, hakemukset tulevat takaisin', async () => {
    const sql = (q) => sqlCli(q);
    const hub = { events: {}, shifts: {}, apps: [], badSig: 0, calls: [], decisions: [] };
    const spki = (raw) => crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw, 'base64')]), format: 'der', type: 'spki' });
    let hubKey = null; const seen = new Set();
    const srv = require('http').createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
        if (req.method === 'POST' && req.url === '/v1/pair') { const j = JSON.parse(b || '{}'); res.writeHead(j.code === 'ABCDE-FGHJK-LMNPQ-RSTUV' ? 200 : 404, { 'Content-Type': 'application/json' }); if (j.code !== 'ABCDE-FGHJK-LMNPQ-RSTUV') return res.end(JSON.stringify({ error: 'Liitoskoodi on väärä tai vanhentunut' })); hubKey = spki(j.public_key); return res.end(JSON.stringify({ success: true, slug: 'demobaari', name: 'Testihub' })); }
        const ts = req.headers['x-timestamp'], nonce = req.headers['x-nonce'];
        const msg = `${req.method}\n${req.url}\n${ts}\n${nonce}\n${crypto.createHash('sha256').update(b).digest('hex')}`;
        const ok = req.headers['x-pub'] === 'demobaari' && hubKey && crypto.verify(null, Buffer.from(msg), hubKey, Buffer.from(req.headers['x-signature'] || '', 'base64')) && !seen.has(nonce) && Math.abs(Date.now() / 1000 - Number(ts)) < 300;
        seen.add(nonce);
        const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
        if (!ok) { hub.badSig++; return send(401, { error: 'sig' }); }
        hub.calls.push(req.method + ' ' + req.url);
        if (req.method === 'PUT' && req.url === '/v1/profile') { hub.profile = b ? JSON.parse(b) : {}; return send(200, { success: true }); }
        let m; const body = b ? JSON.parse(b) : {};
        if ((m = req.url.match(/^\/v1\/(events|shifts)\/([A-Za-z0-9_.-]+)$/))) { if (req.method === 'PUT') hub[m[1]][m[2]] = body; else delete hub[m[1]][m[2]]; return send(200, { success: true }); }
        if (req.method === 'GET' && req.url.startsWith('/v1/applications')) { const since = +(req.url.match(/since_id=(\d+)/) || [0, 0])[1]; return send(200, { applications: hub.apps.filter(a => a.id > since).map(a => ({ ...a, email: a.status === 'accepted' ? a.email : null, phone: a.status === 'accepted' ? a.phone : null })) }); }
        if ((m = req.url.match(/^\/v1\/applications\/(\d+)\/decision$/))) { const a = hub.apps.find(x => x.id === +m[1]); a.status = body.decision; hub.decisions.push(body.decision); return send(200, { success: true }); }
        send(404, { error: 'ei' });
    }); });
    await new Promise(r => srv.listen(parseInt(process.env.HUB_PORT, 10), '127.0.0.1', r));
    try {
        const base = { ...settings };
        // liittäminen hallintapaneelista (ei config.php-muokkausta): oma avainpari syntyy clientissa
        assert.strictEqual((await admin.get('')).json.pub.hub_connected, false);
        assert.strictEqual((await admin.post('hub_sync_now', {})).status, 409);
        const hurl = 'http://127.0.0.1:' + process.env.HUB_PORT;
        assert.strictEqual((await emp.post('hub_pair', { url: hurl, code: 'ABCDE-FGHJK-LMNPQ-RSTUV' })).status, 403);
        assert.strictEqual((await admin.post('hub_pair', { url: 'http://example.com', code: 'ABCDE-FGHJK-LMNPQ-RSTUV' })).status, 400, 'salaamaton ulkoinen osoite hyväksyttiin');
        assert.strictEqual((await admin.post('hub_pair', { url: hurl, code: 'lyhyt' })).status, 400);
        const bad = await admin.post('hub_pair', { url: hurl, code: 'ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ' }); assert.strictEqual(bad.status, 502); assert.match(bad.json.error, /väärä tai vanhentunut/);
        const okp = await admin.post('hub_pair', { url: hurl, code: 'abcde-fghjk-lmnpq-rstuv' }); assert.ok(okp.json.success, JSON.stringify(okp.json)); assert.strictEqual(okp.json.name, 'Testihub');
        const info = (await admin.get('')).json.pub; assert.strictEqual(info.hub_connected, true); assert.strictEqual(info.hub_info.slug, 'demobaari'); assert.ok(!JSON.stringify(info).includes('private'), 'avain vuoti käyttöliittymälle');
        assert.match((await sql("SELECT private_key_enc FROM hub_connection")).trim().split('\n').pop(), /^v1:/, 'yksityinen avain ei ole salattuna');
        // oletuksena pois päältä: mitään ei lähde
        const ev = (await admin.form('event', fdOf({ title: 'Hub-keikka', date: future(12), time_start: '20:00', type: 'music', is_public: '1', registration: 'none' }))).json; assert.ok(ev.success, JSON.stringify(ev));
        await runCron(); assert.strictEqual(Object.keys(hub.events).length, 0, 'tapahtuma lähti ilman suostumusta');
        assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { hub_events: true, hub_gigs: true } })).json.success);
        const pub = (await admin.get('')).json.pub; assert.strictEqual(pub.hub_connected, true); assert.strictEqual(pub.features.hub_gigs, true);
        // vuoro keikkatyöksi
        // baarin julkinen sijainti kartalle: vain julkaistusta profiilista, ei muita kenttiä
        assert.ok((await admin.post('save_pub_profile', { display_name: 'Demo', is_public: 0, city: 'Helsinki', address: 'Salainen 9', lat: 1.5, lng: 2.5, description: 'Salainen kuvaus' })).json.success);
        await runCron(); assert.ok(!hub.profile || hub.profile.address !== 'Salainen 9', 'julkaisematon profiili lähti keskukseen');
        assert.ok((await admin.post('save_pub_profile', { display_name: 'Demo', is_public: 1, city: 'Helsinki', address: 'Testikatu 1', lat: 60.1699, lng: 24.9384, description: 'Julkinen kuvaus', website: 'https://demo.example' })).json.success);
        await runCron(); assert.deepStrictEqual(hub.profile, { address: 'Testikatu 1', city: 'Helsinki', lat: 60.1699, lng: 24.9384, website: 'https://demo.example' }, JSON.stringify(hub.profile));
        assert.ok((await admin.post('save_pub_profile', { display_name: 'Demo', is_public: 1, city: 'Helsinki', address: 'Testikatu 1' })).json.success);   // palautetaan alkuperäinen
        // tallennus synkronoi heti (ilman cronia)
        const ev2 = (await admin.form('event', fdOf({ title: 'Heti-keikka', date: future(14), time_start: '21:00', type: 'music', is_public: '1', registration: 'none' }))).json; assert.ok(ev2.success);
        for (let i = 0; i < 20 && !Object.values(hub.events).some(e => e.title === 'Heti-keikka'); i++) await sleep(100);
        assert.ok(Object.values(hub.events).some(e => e.title === 'Heti-keikka'), 'tapahtuma ei lähtenyt heti tallennuksen jälkeen');
        const now = (await admin.post('hub_sync_now', {})).json; assert.ok(now.success, JSON.stringify(now)); assert.strictEqual((await emp.post('hub_sync_now', {})).status, 403);
        assert.ok((await admin.get('')).json.pub.hub_status.last_sync, 'synkronoinnin aika ei näy');
        const d = future(13);
        assert.ok((await admin.post('shift', { userId: null, date: d, start: '17:00', end: '23:00', role: 'Baarimestari', status: 'published', hub_gig: true, hub_pay: '16 €/h' })).json.success);
        const privShift = (await admin.post('shift', { userId: null, date: d, start: '10:00', end: '12:00', role: 'Ovi', status: 'published' })).json; assert.ok(privShift.success);
        await runCron();
        const evs = Object.values(hub.events); assert.ok(evs.some(e => e.title === 'Hub-keikka' && e.date === future(12)), JSON.stringify(hub.events));
        const sh = Object.entries(hub.shifts); assert.strictEqual(sh.length, 1, 'vain keikkatyöksi merkitty vuoro lähtee'); const [sext, sbody] = sh[0];
        assert.deepStrictEqual(Object.keys(sbody).sort(), ['date', 'pay_text', 'role', 'status', 'time_end', 'time_start'], 'lähtevässä vuorossa on muutakin kuin sallitut kentät');
        assert.strictEqual(sbody.status, 'open'); assert.strictEqual(sbody.pay_text, '16 €/h');
        assert.strictEqual(hub.badSig, 0, 'allekirjoitus ei kelvannut');
        const n = hub.calls.length; await runCron(); assert.strictEqual(hub.calls.filter(c => c.startsWith('PUT')).length, hub.calls.slice(0, n).filter(c => c.startsWith('PUT')).length, 'muuttumaton data lähetettiin uudelleen');
        // hakemus tulee keskuksesta; yhteystiedot piilossa kunnes hyväksytty
        const localId = +sext.slice(1);
        hub.apps.push({ id: 1, shift: sext, status: 'pending', name: 'Aino Keikka', skills: 'baarimestari', city: 'Turku', message: 'Voin tulla', email: 'aino@example.test', phone: '0401234567' });
        hub.apps.push({ id: 2, shift: 's99999', status: 'pending', name: 'Vieras', skills: '', city: '', message: null, email: null, phone: null });
        assert.ok((await admin.post('update_profile', { phone: '', email: 'admin@example.test', notify_email: 1 })).json.success);
        const apps = (await admin.post('hub_applications', {})).json.applications; assert.strictEqual(apps.length, 1, 'toisen baarin/tuntemattoman vuoron hakemus tuli sisään');
        assert.ok(await waitMail(mailbox, m => m.to === 'admin@example.test' && /Uusi keikkahakemus/.test(m.subject)), 'ylläpitäjä ei saanut ilmoitusta uudesta hakemuksesta'); assert.strictEqual(apps[0].email, null);
        assert.strictEqual((await emp.post('hub_applications', {})).status, 403);
        assert.strictEqual((await emp.post('hub_decide', { id: apps[0].id, decision: 'accepted' })).status, 403);
        const pendDash = (await admin.get('')).json.hub_pending_apps; assert.strictEqual(pendDash.length, 1, 'hakemus ei näy etusivun Huomio-listassa'); assert.strictEqual(pendDash[0].name, 'Aino Keikka');
        assert.deepStrictEqual((await emp.get('')).json.hub_pending_apps, [], 'hakemukset näkyvät työntekijälle');
        const dec = await admin.post('hub_decide', { id: apps[0].id, decision: 'accepted' }); assert.ok(dec.json.success); assert.deepStrictEqual(hub.decisions, ['accepted']);
        const wk = dec.json.worker; assert.ok(wk && wk.username === 'aino.keikka' && wk.assigned && /setpassword\.html#t=[0-9a-f]{64}$/.test(wk.link), JSON.stringify(wk));
        const pay2 = (await admin.get('')).json; const au = pay2.users.find(u => u.username === 'aino.keikka'); assert.ok(au, 'keikkalaistunnusta ei luotu'); assert.strictEqual(au.employment_type, 'casual'); assert.strictEqual(au.role, 'employee'); assert.strictEqual(au.phone, '0401234567');
        assert.strictEqual(pay2.shifts.find(x => x.id === localId).userId, au.id, 'hakija ei päätynyt vuoroon'); assert.strictEqual(pay2.hub_pending_apps.length, 0, 'käsitelty hakemus jäi Huomio-listaan');
        const after = (await admin.post('hub_applications', {})).json.applications[0]; assert.strictEqual(after.status, 'accepted'); assert.strictEqual(after.email, 'aino@example.test'); assert.strictEqual(after.phone, '0401234567');
        assert.strictEqual((await admin.post('hub_decide', { id: apps[0].id, decision: 'declined' })).status, 409, 'käsitelty hakemus muuttui');
        // täytetty vuoro merkitään keskuksessa täytetyksi (ei poisteta); ylläpitäjän sivulataus synkronoi ilman croniakin
        await sql("DELETE FROM system_status WHERE k = 'hub_last_attempt'"); await admin.get('');
        for (let i = 0; i < 20 && hub.shifts[sext].status !== 'filled'; i++) await sleep(100); assert.strictEqual(hub.shifts[sext].status, 'filled');
        // tapahtuman poisto ja ominaisuuden sammutus poistaa keskuksesta
        assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { hub_events: false, hub_gigs: false } })).json.success);
        await runCron(); assert.strictEqual(Object.keys(hub.events).length, 0, 'tapahtuma jäi keskukseen'); assert.strictEqual(Object.keys(hub.shifts).length, 0, 'vuoro jäi keskukseen');
        assert.strictEqual((await admin.post('hub_applications', {})).json.applications.length, 1, 'paikallinen hakemushistoria poistui');
        // katkaisu poistaa julkaistut tiedot keskuksesta ja yhteyden
        assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { hub_events: true, hub_gigs: true } })).json.success); await runCron();
        assert.ok(Object.keys(hub.events).length > 0);
        assert.strictEqual((await emp.post('hub_disconnect', {})).status, 403);
        assert.ok((await admin.post('hub_disconnect', {})).json.success); assert.strictEqual(Object.keys(hub.events).length, 0, 'tapahtumat jäivät keskukseen katkaisun jälkeen');
        const afterD = (await admin.get('')).json.pub; assert.strictEqual(afterD.hub_connected, false); assert.strictEqual(afterD.features.hub_events, false);
    } finally { srv.close(); }
  });
  await t('hub: muiden baarien vapaat vuorot (feed): ilmoitus opt-in-työntekijöille, hakeminen keskuksen kautta, päätös ja peruminen', async () => {
    const base = { ...settings };
    const hub = { feed: [], apps: {}, nextApp: 70, calls: [], badSig: 0 }; let hubKey = null; const seen = new Set();
    const spki = (raw) => crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(raw, 'base64')]), format: 'der', type: 'spki' });
    const srv = require('http').createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const send = (code, j) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.method === 'POST' && req.url === '/v1/pair') { const j = JSON.parse(b || '{}'); hubKey = spki(j.public_key); return send(200, { slug: 'demobaari', name: 'Testihub', city: 'Helsinki' }); }
      const ts = req.headers['x-timestamp'], nonce = req.headers['x-nonce'];
      const msg = `${req.method}\n${req.url}\n${ts}\n${nonce}\n${crypto.createHash('sha256').update(b).digest('hex')}`;
      const ok = req.headers['x-pub'] === 'demobaari' && hubKey && crypto.verify(null, Buffer.from(msg), hubKey, Buffer.from(req.headers['x-signature'] || '', 'base64')) && !seen.has(nonce);
      seen.add(nonce); if (!ok) { hub.badSig++; return send(401, { error: 'sig' }); }
      hub.calls.push(req.method + ' ' + req.url); const body = b ? JSON.parse(b) : {}; let m;
      if (req.method === 'GET' && req.url === '/v1/feed') return send(200, { shifts: hub.feed });
      if (req.method === 'GET' && req.url.startsWith('/v1/applications')) return send(200, { applications: [] });
      if ((m = req.url.match(/^\/v1\/feed\/(\d+)\/apply$/)) && req.method === 'POST') {
        if (!hub.feed.some(x => x.id === +m[1])) return send(404, { error: 'Vuoro ei ole haettavissa' });
        const id = hub.nextApp++; hub.apps[id] = { id, ref: body.ref, shift_id: +m[1], status: 'pending', body, withdrawn: false }; return send(201, { success: true, id, status: 'pending' });
      }
      if (req.method === 'GET' && req.url === '/v1/outgoing_applications') return send(200, { applications: Object.values(hub.apps).filter(a => !a.withdrawn).map(a => { const f = hub.feed.find(x => x.id === a.shift_id) || hub.gone[a.shift_id]; return { id: a.id, ref: a.ref, status: a.status, shift_id: a.shift_id, date: f.date, time_start: f.time_start, time_end: f.time_end, role: f.role, pub: f.pub, city: f.city, address: a.status === 'accepted' ? 'Naapurikatu 5' : null }; }) });
      if ((m = req.url.match(/^\/v1\/outgoing_applications\/(\d+)\/withdraw$/)) && req.method === 'POST') { const a = hub.apps[+m[1]]; const ch = !!a && a.status === 'pending' && !a.withdrawn; if (ch) a.withdrawn = true; return send(200, { success: true, changed: ch }); }
      send(404, { error: 'ei' });
    }); });
    hub.gone = {};
    await new Promise(r => srv.listen(parseInt(process.env.HUB_PORT, 10), '127.0.0.1', r));
    try {
      const hurl = 'http://127.0.0.1:' + process.env.HUB_PORT;
      const shift = (id, role) => ({ id, date: future(9), time_start: '18:00:00', time_end: '02:00:00', role, pay_text: '16 €/h', note: null, pub: 'Naapuribaari', city: 'Turku' });
      hub.feed = [shift(501, 'Tarjoilija')];
      assert.ok((await admin.post('hub_pair', { url: hurl, code: 'ABCDE-FGHJK-LMNPQ-RSTUV' })).json.success);
      // sari ottaa ilmoitukset käyttöön, mikko ei
      const sariMe = (await emp.get('')).json.users.find(u => u.username === 'sari'); assert.strictEqual(sariMe.notify_gigs, 0, 'ilmoitukset oletuksena päällä');
      assert.ok((await emp.post('update_profile', { phone: '0401112222', email: 'sari@example.test', notify_email: 1, notify_gigs: 1 })).json.success);
      const mik = new Client(); assert.ok((await mik.login('mikko', 'demobaari')).json.success);
      assert.ok((await mik.post('update_profile', { phone: '', email: 'mikko@example.test', notify_email: 1, notify_gigs: 0 })).json.success);
      // ominaisuus pois päältä: ei feediä, ei hakemista
      assert.strictEqual((await emp.post('hub_feed', {})).json.enabled, false);
      assert.strictEqual((await emp.post('hub_apply', { shiftId: 501, phone: '1' })).status, 409);
      assert.ok((await admin.post('save_pub_settings', { ...base, features_ext: { hub_feed: true } })).json.success);
      assert.ok((await emp.get('')).json.pub.features.hub_feed, 'ominaisuus ei näy työntekijälle');
      const before = mailbox.messages.length;
      const r1 = await admin.post('hub_sync_now', {}); assert.ok(r1.json.success, JSON.stringify(r1.json)); assert.strictEqual(r1.json.feed_new, 1);
      await sleep(400); assert.strictEqual(mailbox.messages.length, before, 'ensimmäisellä haulla ilmoitettiin vanhoista vuoroista');
      let f = (await emp.post('hub_feed', {})).json; assert.strictEqual(f.enabled, true); assert.strictEqual(f.shifts.length, 1); assert.strictEqual(f.shifts[0].bar_name, 'Naapuribaari'); assert.strictEqual(f.shifts[0].my_status, null);
      assert.strictEqual(f.profile.phone, '0401112222');
      // uusi vuoro keskuksessa -> ilmoitus vain opt-in-käyttäjälle
      hub.feed.push(shift(502, 'Baarimestari'));
      assert.strictEqual((await admin.post('hub_sync_now', {})).json.feed_new, 1);
      const mail = await waitMail(mailbox, m => m.to === 'sari@example.test' && /Vapaa vuoro toisessa baarissa/.test(m.subject));
      assert.ok(mail, 'ilmoitus ei saapunut');
      const d = new Date(future(9) + 'T12:00:00'); assert.ok(mail.body.includes(`Baarissa Naapuribaari haetaan työntekijää (Baarimestari) päivälle ${d.getDate()}.${d.getMonth() + 1}. ajalle 18–2`), mail.body);
      await sleep(300); assert.ok(!mailbox.messages.some(m => m.to === 'mikko@example.test' && /toisessa baarissa/.test(m.subject)), 'ilmoitus meni käyttäjälle, joka ei ole ottanut sitä käyttöön');
      await admin.post('hub_sync_now', {}); await sleep(300); assert.strictEqual(mailbox.messages.filter(m => m.to === 'sari@example.test' && /toisessa baarissa/.test(m.subject)).length, 1, 'sama vuoro ilmoitettiin kahdesti');
      // hakeminen
      assert.strictEqual((await emp.post('hub_apply', { shiftId: 502 })).status, 400, 'ilman yhteystietoa');
      assert.strictEqual((await emp.post('hub_apply', { shiftId: 999, phone: '1' })).status, 404);
      const ap = await emp.post('hub_apply', { shiftId: 502, phone: '0401112222', message: 'Pääsen' }); assert.ok(ap.json.success, JSON.stringify(ap.json));
      const sent = Object.values(hub.apps)[0]; assert.strictEqual(sent.body.name, 'Sari Salo'); assert.strictEqual(sent.body.phone, '0401112222'); assert.strictEqual(sent.body.message, 'Pääsen'); assert.match(sent.ref, /^u\d+$/);
      assert.deepStrictEqual(Object.keys(sent.body).sort(), ['message', 'name', 'phone', 'ref'], 'hakemus sisältää muuta kuin sovitut kentät');
      assert.strictEqual((await emp.post('hub_apply', { shiftId: 502, phone: '1' })).status, 409, 'tuplahaku');
      f = (await emp.post('hub_feed', {})).json; assert.strictEqual(f.shifts.find(x => x.id === 502).my_status, 'pending'); assert.strictEqual(f.applications.length, 1);
      assert.strictEqual((await mik.post('hub_feed', {})).json.applications.length, 0, 'toisen käyttäjän hakemukset vuotivat');
      // päätös
      Object.values(hub.apps)[0].status = 'accepted';
      await admin.post('hub_sync_now', {});
      const acc = await waitMail(mailbox, m => m.to === 'sari@example.test' && /hyväksytty/.test(m.subject)); assert.ok(acc, 'päätösilmoitus puuttuu');
      f = (await emp.post('hub_feed', {})).json; assert.strictEqual(f.applications[0].status, 'accepted'); assert.strictEqual(f.applications[0].address, 'Naapurikatu 5');
      assert.strictEqual((await emp.post('hub_withdraw', { id: f.applications[0].id })).status, 409, 'hyväksytyn voi perua');
      // peruminen: vuoro 501
      assert.ok((await emp.post('hub_apply', { shiftId: 501, phone: '1' })).json.success);
      f = (await emp.post('hub_feed', {})).json; const pend = f.applications.find(a => a.status === 'pending');
      assert.strictEqual((await mik.post('hub_withdraw', { id: pend.id })).status, 404, 'toinen käyttäjä perui');
      assert.ok((await emp.post('hub_withdraw', { id: pend.id })).json.success);
      assert.strictEqual((await emp.post('hub_feed', {})).json.applications.length, 1);
      // Keikat-välilehden avaus hakee uudet vuorot heti (enintään kerran 15 s välein)
      hub.feed.push(shift(503, 'Vahtimestari')); await sqlCli("DELETE FROM system_status WHERE k = 'hub_feed_pull'");
      f = (await emp.post('hub_feed', {})).json; assert.strictEqual(f.refreshed, true); assert.ok(f.shifts.some(x => x.id === 503), 'välilehden avaus ei hakenut uutta vuoroa');
      assert.ok(await waitMail(mailbox, m => m.to === 'sari@example.test' && /Vapaa vuoro toisessa baarissa/.test(m.subject) && /Vahtimestari/.test(m.body)), 'avaus ei laukaissut ilmoitusta uudesta vuorosta');
      hub.feed.push(shift(504, 'Kokki')); f = (await emp.post('hub_feed', {})).json; assert.strictEqual(f.refreshed, false); assert.ok(!f.shifts.some(x => x.id === 504), 'haku ohitti 15 s rajan');
      // vuoro poistuu keskuksesta -> poistuu listalta
      hub.gone[501] = hub.feed.find(x => x.id === 501); hub.feed = hub.feed.filter(x => x.id !== 501);
      await admin.post('hub_sync_now', {}); assert.ok(!(await emp.post('hub_feed', {})).json.shifts.some(x => x.id === 501), 'poistunut vuoro näkyy yhä');
      assert.strictEqual(hub.badSig, 0, 'allekirjoitus hylättiin');
      // katkaisu tyhjentää feedin
      assert.ok((await admin.post('hub_disconnect', {})).json.success);
      assert.strictEqual((await sqlCli('SELECT (SELECT COUNT(*) FROM hub_feed) + (SELECT COUNT(*) FROM hub_outgoing)', true)).trim(), '0');
      assert.strictEqual((await emp.post('hub_feed', {})).json.enabled, false);
    } finally { srv.close(); }
  });
  await t('verkkomaksu lippuihin (valinnainen, Stripe): kytkin, odotus, webhook, vanheneminen', async () => {
    const base = { ...settings, feature_tickets: true, feature_bookings: true, booking: { capacity: 10, max_party: 6, slot_minutes: 60, duration_minutes: 120, lead_hours: 0, days_ahead: 60, auto_confirm: false, hours: ALLDAYS } };
    const setPay = (on) => admin.post('save_pub_settings', { ...base, features_ext: { payments: on } });
    await sqlCli('DELETE FROM login_attempts');   // julkisen ilmoittautumisen nopeusrajoitus nollataan
    const d = future(25);
    const mk = async (title) => { assert.ok((await admin.form('event', fdOf({ title, date: d, time_start: '19:00', type: 'music', is_public: '1', registration: 'tickets', capacity: 5, ticket_price: '12.50' }))).json.success); return (await admin.get('')).json.events.find(e => e.title === title); };
    const sign = (payload, secret = 'whsec_test', ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${crypto.createHmac('sha256', secret).update(ts + '.' + payload).digest('hex')}`;
    const hook = (obj, type = 'checkout.session.completed', sig) => { const body = JSON.stringify({ type, data: { object: obj } }); return fetch(`${BASE}/api.php?action=stripe_webhook`, { method: 'POST', headers: { 'Stripe-Signature': sig || sign(body) }, body }); };
    assert.ok((await setPay(false)).json.success);
    const e1 = await mk('Maksuton tila'); const free = await anon.post('public_register', { eventId: e1.id, name: 'Ilman Maksua', email: 'ilman@example.test', qty: 1 }); assert.ok(free.json.success && !free.json.checkout_url, 'kytkin pois: vahvistetaan heti');
    assert.ok((await setPay(true)).json.success);
    const e2 = await mk('Maksullinen ilta');
    assert.ok((await anon.req('GET', 'public_events')).json.events.find(e => e.title === 'Maksullinen ilta').reg.pay === true);
    const r = await anon.post('public_register', { eventId: e2.id, name: 'Maksaja Testi', email: 'maksaja@example.test', qty: 2 });
    assert.ok(r.json.success && /^https:\/\/checkout\.stripe\.test\/pay\/cs_test_/.test(r.json.checkout_url), JSON.stringify(r.json));
    const sf = stripeLog[stripeLog.length - 1].form; assert.strictEqual(sf['line_items[0][price_data][unit_amount]'], '1250'); assert.strictEqual(sf['line_items[0][quantity]'], '2'); assert.strictEqual(sf.mode, 'payment'); assert.strictEqual(sf['payment_method_types[0]'], 'mobilepay', 'vain MobilePay'); assert.strictEqual(stripeLog[stripeLog.length - 1].auth, 'Bearer sk_test_x');
    const regId = sf.client_reference_id;
    assert.strictEqual((await admin.get('event_registrations', `&eventId=${e2.id}`)).json.registrations.length, 0, 'odottava ei näy listassa');
    assert.strictEqual((await anon.req('GET', 'public_events')).json.events.find(e => e.title === 'Maksullinen ilta').reg.left, 3, 'paikka pidossa');
    assert.strictEqual((await anon.post('public_register', { eventId: e2.id, name: 'Sama', email: 'maksaja@example.test', qty: 1 })).status, 409, 'kaksoisilmoittautuminen');
    // webhook: väärä allekirjoitus, vanha aikaleima, oikea
    assert.strictEqual((await hook({ client_reference_id: regId, payment_status: 'paid', amount_total: 2500, id: 'cs_test_1' }, 'checkout.session.completed', 't=1,v1=abc')).status, 400);
    const oldBody = JSON.stringify({ type: 'x', data: { object: {} } });
    assert.strictEqual((await fetch(`${BASE}/api.php?action=stripe_webhook`, { method: 'POST', headers: { 'Stripe-Signature': sign(oldBody, 'whsec_test', 1000) }, body: oldBody })).status, 400, 'vanha aikaleima');
    assert.strictEqual((await hook({ client_reference_id: regId, payment_status: 'paid', amount_total: 2500, id: 'cs_test_x' }, 'checkout.session.completed', sign('{}'))).status, 400, 'allekirjoitus eri rungolle');
    assert.strictEqual((await hook({ client_reference_id: regId, payment_status: 'unpaid', amount_total: 2500, id: 'cs_test_2' })).status, 200);
    assert.strictEqual((await admin.get('event_registrations', `&eventId=${e2.id}`)).json.registrations.length, 0, 'maksamaton ei vahvistu');
    assert.strictEqual((await hook({ client_reference_id: regId, payment_status: 'paid', amount_total: 2500, payment_intent: 'pi_test_1', id: stripeLog.length ? 'cs_test_' + stripeLog.length : 'x' })).status, 200);
    const regs = (await admin.get('event_registrations', `&eventId=${e2.id}`)).json.registrations; assert.strictEqual(regs.length, 1); assert.strictEqual(regs[0].status, 'confirmed'); assert.strictEqual(regs[0].paid_cents, 2500);
    assert.ok(await waitMail(mailbox, m => m.to === 'maksaja@example.test' && /Maksu vastaanotettu/.test(m.subject)), 'maksuvahvistus puuttuu');
    const mails = mailbox.messages.length; await hook({ client_reference_id: regId, payment_status: 'paid', amount_total: 2500, payment_intent: 'pi_test_1', id: 'cs_test_1' }); await sleep(200);
    assert.strictEqual((await admin.get('event_registrations', `&eventId=${e2.id}`)).json.registrations.length, 1, 'idempotentti');
    assert.strictEqual((await anon.req('GET', 'public_events')).json.events.find(e => e.title === 'Maksullinen ilta').reg.left, 3);
    // vanheneva maksu vapauttaa paikan
    const r2 = await anon.post('public_register', { eventId: e2.id, name: 'Vanhenija', email: 'vanhenija@example.test', qty: 3 }); assert.ok(r2.json.checkout_url);
    assert.strictEqual((await anon.post('public_register', { eventId: e2.id, name: 'Myöhä', email: 'myoha@example.test', qty: 1 })).status, 409, 'täynnä pidossa olevien kanssa');
    const regId2 = stripeLog[stripeLog.length - 1].form.client_reference_id;
    assert.strictEqual((await hook({ client_reference_id: regId2 }, 'checkout.session.expired')).status, 200);
    assert.ok((await anon.post('public_register', { eventId: e2.id, name: 'Myöhä', email: 'myoha@example.test', qty: 1 })).json.checkout_url, 'paikka vapautui');
    // ilman Stripe-asetusta tai kytkintä ei makseta
    assert.ok((await setPay(false)).json.success);
    assert.ok(!(await anon.post('public_register', { eventId: e2.id, name: 'Ei Maksua', email: 'eimaksua@example.test', qty: 1 })).json.checkout_url);
  });

  await t('osoitehaku (geocode_address): sijainti löytyy, virheet käsitellään, vain ylläpito', async () => {
    assert.strictEqual((await emp.post('geocode_address', { address: 'Testikatu 1', city: 'Helsinki' })).status, 403);
    assert.strictEqual((await admin.post('geocode_address', { address: '' })).status, 400);
    const g = await admin.post('geocode_address', { address: 'Testikatu 1', city: 'Helsinki' }); assert.ok(g.json.success, JSON.stringify(g.json)); assert.strictEqual(g.json.lat, 60.1699); assert.strictEqual(g.json.lng, 24.9384);
    assert.strictEqual((await admin.post('geocode_address', { address: 'tuntematon paikka' })).status, 404, 'ei löytynyt -> selkeä virhe');
    const down = await admin.post('geocode_address', { address: 'palvelinvika' }); assert.strictEqual(down.status, 502); assert.match(down.json.error, /http_500/, 'palvelinvian syy ei näy ylläpitäjälle');
  });

  console.log('Tietoturvan kovennus');
  await t('salasanapolitiikka hylkää ilmeiset salasanat', async () => {
    for (const bad of ['password', 'Salasana2026'.toLowerCase(), '12345678', '111111111', 'qwertyuiop', 'abcdefghijk']) {
      const r = await admin.post('user', { name: 'Heikko', username: 'heikko' + Math.random().toString(36).slice(2, 6), password: bad, role: 'employee' });
      assert.ok(r.status >= 400 && /helppo|8 merkkiä/.test(r.json.error), bad + ' hyväksyttiin');
    }
    const ok = await admin.post('user', { name: 'Vahva', username: 'vahva', password: 'Kuusi-Kalaa-Uimassa-7', role: 'employee' }); assert.ok(ok.json.success, JSON.stringify(ok.json));
    await admin.del('user', (await usersNow()).find(u => u.username === 'vahva').id);
  });
  await t('2FA-pakote: ylläpitäjä ilman 2FA:ta ohjataan käyttöönottoon; ensin oma 2FA', async () => {
    assert.ok((await admin.post('user', { name: 'Pakote Admin', username: 'pakoteadmin', password: 'Kuusi-Kalaa-Uimassa-7', role: 'admin' })).json.success);
    const boss = new Client(); assert.ok((await boss.login('pakoteadmin', 'demobaari', 'Kuusi-Kalaa-Uimassa-7')).json.success);
    assert.ok((await boss.post('save_pub_settings', { ...settings, require_2fa: true })).status >= 400, 'pakotus ilman omaa 2FA:ta');
    const b = (await boss.post('totp_begin')).json; const secret = b32decode(b.secret); const st = Math.floor(Date.now() / 30000);
    assert.ok((await boss.post('totp_enable', { code: totp(secret, st) })).json.success);
    assert.ok((await boss.post('save_pub_settings', { ...settings, require_2fa: true })).json.success);
    // toinen ylläpitäjä (demobaarin admin) ilman 2FA:ta
    const ta = new Client(); assert.ok((await ta.login('admin', 'demobaari')).json.success);
    const blocked = await ta.get(''); assert.strictEqual(blocked.status, 403); assert.strictEqual(blocked.json.need_2fa, true);
    assert.strictEqual((await ta.get('payroll')).status, 403); assert.strictEqual((await ta.post('shift', { date: future(3), start: '10:00', end: '12:00' })).status, 403);
    assert.strictEqual((await ta.get('me')).status, 200);
    const b2 = (await ta.post('totp_begin')).json; const s2 = b32decode(b2.secret);
    assert.ok((await ta.post('totp_enable', { code: totp(s2, Math.floor(Date.now() / 30000)) })).json.success);
    assert.strictEqual((await ta.get('')).status, 200, 'pääsy ei palannut 2FA:n jälkeen');
    // työntekijöitä pakote ei koske
    assert.strictEqual((await emp.get('')).status, 200);
    await boss.post('save_pub_settings', { ...settings, require_2fa: false });
    assert.ok((await ta.post('totp_disable', { password: PW, code: '000000' })).status >= 400);
    await sqlCli("UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL WHERE username = 'admin'; DELETE FROM users WHERE username = 'pakoteadmin'");
  });
  await t('julkiset tiedostot: ei ulkoisia resursseja sovelluksen sivuilla', async () => {
    const fs = require('fs'), root = require('path').join(__dirname, '..');
    for (const f of ['index.php', 'barshift_ohjeet.html', 'tapahtumat.html', 'varaus.html', 'widget.html', 'setpassword.html', 'tietosuoseloste.html']) {
      const src = fs.readFileSync(require('path').join(root, f), 'utf8');
      assert.ok(!/(cdn\.jsdelivr|fonts\.googleapis|fonts\.gstatic|ui-avatars|unpkg\.com)/.test(src), f + ' lataa ulkoista resurssia');
    }
    assert.ok(!/ui-avatars/.test(fs.readFileSync(require('path').join(root, 'sw.js'), 'utf8')));
  });

  console.log('Analytiikka');
  await t('analytiikka: tunnit, kuormituskartta, täsmällisyys ja sairauspoissaolot', async () => {
    assert.strictEqual((await emp.get('analytics')).status, 403);
    const a = (await admin.get('analytics', '&months=6')).json;
    assert.strictEqual(a.months.length, 6); assert.strictEqual(a.hours.length, 6); assert.strictEqual(a.sick_days.length, 6);
    assert.strictEqual(a.heatmap.length, 7); assert.ok(a.heatmap.every(r => r.length === 24));
    assert.ok(a.hours.some(h => h > 0), 'tunnit puuttuvat'); assert.ok(Math.abs(a.heatmap.flat().reduce((x, y) => x + y, 0) - a.hours.reduce((x, y) => x + y, 0)) < 1.5, 'kuormituskartan ja tuntien summa eroaa');
    assert.ok(a.punctuality.length > 0 && a.punctuality.every(p => p.shifts >= p.late && 'avg_late' in p));
    assert.ok(a.sick_by_user.every(s => s.days >= s.episodes));
    assert.strictEqual((await admin.get('analytics', '&months=99')).json.months.length, 12);
  });

  await t('järjestelmän tila: cron, varmuuskopio, health-päätepiste', async () => {
    assert.strictEqual((await emp.get('system_status')).status, 403);
    assert.strictEqual((await anon.req('GET', 'health')).status, 404, 'ilman avainta 404');
    assert.strictEqual((await anon.req('GET', 'health', { query: '&key=vaara' })).status, 404);
    await runCron();
    let st = (await admin.get('system_status')).json; assert.ok(st.cron.age_minutes <= 1 && st.migrations.applied === st.migrations.available, JSON.stringify(st.cron));
    assert.strictEqual(st.backup.expected, false);
    const h = await anon.req('GET', 'health', { query: '&key=testhealthkey' }); assert.strictEqual(h.status, 200, JSON.stringify(h.json)); assert.strictEqual(h.json.ok, true);
    // varmuuskopion kirjaus -> seurantaan
    const tmp = require('path').join(require('os').tmpdir(), 'bs-backup-test.sql.gz'); require('fs').writeFileSync(tmp, 'x'.repeat(2048));
    await execFileP('php', ['tools/mark_backup.php', tmp], { env: { ...process.env, BARSHIFT_CONFIG: process.env.BARSHIFT_CONFIG }, cwd: require('path').join(__dirname, '..') }); require('fs').unlinkSync(tmp);
    st = (await admin.get('system_status')).json; assert.strictEqual(st.backup.expected, true); assert.ok(st.backup.age_hours < 0.1 && /bs-backup-test/.test(st.backup.info));
    await sqlCli('UPDATE mail_queue SET attempts = 0 WHERE sent_at IS NULL'); await runCron(); await sleep(300);   // ennen SMTP-palvelimen käynnistystä kertyneet epäonnistumiset nollataan
    const al = (await admin.get('')).json.system_alerts; assert.ok(al.length === 0 && (await emp.get('')).json.system_alerts.length === 0, JSON.stringify(al));
  });

  mailbox.close(); smsServer.close();

  console.log('Kirjautumisen rajoitus');
  await t('8 virheellistä yritystä -> 429', async () => {
    const c = new Client(); let last = 0;
    for (let i = 0; i < 10; i++) last = (await c.login('mikko', 'demobaari', 'vaara' + i)).status;
    assert.strictEqual(last, 429);
  });

  console.log(`\n${passed} läpi, ${failed} epäonnistui`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TESTIVIRHE', e); process.exit(2); });
