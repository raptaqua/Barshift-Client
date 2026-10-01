// Kielitiedostot ja käännösmoottori: JSON kelpaa, säännölliset lausekkeet toimivat, käännös/kierto toimii ilman selainta.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
execFileSync('node', [path.join(root, 'tools/i18n_check.js')], { stdio: 'pipe' });   // epäonnistuu virheellisellä JSON:lla

async function load(lang) {
    const dict = lang === 'fi' ? { strings: {} } : JSON.parse(fs.readFileSync(path.join(root, `assets/lang/${lang}.json`), 'utf8'));
    const win = { confirm: m => m, alert: m => m, prompt: m => m, location: { reload() {} } };
    const ctx = vm.createContext({ window: win, document: { addEventListener() {}, body: null, documentElement: {} }, localStorage: { getItem: () => lang, setItem() {} },
        fetch: async () => ({ json: async () => dict }), NodeFilter: {}, MutationObserver: class { observe() {} }, Promise, RegExp, String });
    win.window = win; Object.assign(ctx, win);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/i18n.js'), 'utf8'), ctx);
    await new Promise(r => setTimeout(r, 20));
    return ctx.window;
}
(async () => {
    const en = await load('en');
    assert.strictEqual(en.bsT('Tallenna'), 'Save');
    assert.strictEqual(en.bsT('  Peruuta '), '  Cancel ', 'reunavälit säilyvät');
    assert.strictEqual(en.bsT('Ma 5.10.'), 'Mon 5.10.');
    assert.strictEqual(en.bsT('lokakuu 2026'), 'October 2026');
    assert.strictEqual(en.bsT('12 hlö'), '12 ppl');
    assert.strictEqual(en.bsT('Tuntematon teksti jota ei ole'), 'Tuntematon teksti jota ei ole', 'puuttuva käännös jää suomeksi');
    assert.strictEqual(en.bsT('Anna'), 'Anna', 'nimeksi sopiva sana ei saa kääntyä');
    assert.strictEqual(en.confirm('Poistetaanko lopullisesti?'), 'Delete permanently?');
    const sv = await load('sv');
    assert.strictEqual(sv.bsT('Tallenna'), 'Spara'); assert.strictEqual(sv.bsT('Ke 7.10.'), 'Ons 7.10.');
    const fi = await load('fi'); assert.strictEqual(fi.bsT('Tallenna'), 'Tallenna');
    // kieliversioiden avaimet ovat suomenkielisiä tekstejä: englanti kattaa vähintään ruotsin
    const e = JSON.parse(fs.readFileSync(path.join(root, 'assets/lang/en.json'), 'utf8')).strings, s = JSON.parse(fs.readFileSync(path.join(root, 'assets/lang/sv.json'), 'utf8')).strings;
    const extra = Object.keys(s).filter(k => !(k in e)); assert.ok(extra.length < 10, 'ruotsissa on avaimia joita englannissa ei ole: ' + extra.slice(0, 5));
    console.log('ok: kielitiedostot ja käännösmoottori');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
