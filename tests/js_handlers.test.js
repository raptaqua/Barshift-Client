// Staattinen tarkistus: jokainen HTML-attribuuteissa (onclick="…") kutsuttu funktio on määritelty jossakin skriptitiedostossa.
// Kun tiedostoja jaetaan tai muokataan, hukkuneet funktiot paljastuvat tässä (ei vasta käyttäjän klikatessa).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const jsFiles = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'assets/js', f)).concat(path.join(root, 'leave.js'));
const htmlFiles = ['index.php'].map(f => path.join(root, f));
const src = jsFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const defined = new Set();
for (const m of src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
for (const m of src.matchAll(/(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);

const builtins = new Set(['if', 'for', 'while', 'return', 'function', 'alert', 'confirm', 'prompt', 'parseInt', 'parseFloat', 'isNaN', 'String', 'Number', 'Boolean', 'JSON', 'Math', 'Date',
  'Array', 'Object', 'Set', 'Map', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout', 'fetch', 'Promise', 'stopPropagation', 'preventDefault', 'select', 'click',
  'catch', 'typeof', 'new', 'else', 'switch', 'event', 'this', 'value', 'checked', 'toString']);

const handlerRe = /\son(?:click|change|input|keydown|keyup|submit|focus|blur|mouseover|mouseout|load|error)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const missing = new Map();
const scan = (text, where) => {
  for (const h of text.matchAll(handlerRe)) {
    const code = (h[1] ?? h[2]).replace(/\$\{[^}]*\}/g, '0');   // mallipohjan lausekkeet pois
    for (const c of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = c[1];
      if (!builtins.has(name) && !defined.has(name)) missing.set(name, (missing.get(name) || []).concat(where));
    }
  }
};
scan(src, 'assets/js');
for (const f of htmlFiles) scan(fs.readFileSync(f, 'utf8'), path.basename(f));

// Lisäksi: kaikki sisäiset kutsut "state.x" -tyyppisiin funktioihin eivät kuulu tähän; tarkistetaan vain käsittelijät.
if (missing.size) {
  console.log('FAIL: määrittelemättömät käsittelijäfunktiot:');
  for (const [n, w] of missing) console.log('  - ' + n + '  (' + [...new Set(w)].join(', ') + ')');
  process.exit(1);
}
console.log(`ok: ${defined.size} funktiota/muuttujaa määritelty, kaikki HTML-käsittelijät löytyvät`);

// Sivujen viittaamien paikallisten tiedostojen on oltava versionhallinnassa (esim. .gitignore ei saa ohittaa niitä)
try {
  const { execSync } = require('child_process');
  const tracked = new Set(execSync('git ls-files', { cwd: root }).toString().split('\n'));
  const bad = [];
  for (const f of ['index.php', 'barshift_ohjeet.html', 'tapahtumat.html', 'varaus.html', 'widget.html', 'setpassword.html', 'tietosuoseloste.html', 'manifest.json']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/(?:href|src)="(?!https?:|data:|#|mailto:|<\?|\$)([^"?#]+)/g)) if (fs.existsSync(path.join(root, m[1])) && !tracked.has(m[1])) bad.push(f + ' -> ' + m[1]);
  }
  for (const f of fs.readdirSync(path.join(root, 'assets/lang'))) if (!tracked.has('assets/lang/' + f)) bad.push('assets/lang/' + f + ' (kielitiedosto)');
  if (bad.length) { console.log('FAIL: tiedostoja ei ole versionhallinnassa:\n  ' + bad.join('\n  ')); process.exit(1); }
  console.log('ok: kaikki sivujen viittaamat tiedostot ovat versionhallinnassa');
} catch (e) { console.log('(git-tarkistus ohitettu: ' + e.message.split('\n')[0] + ')'); }

// Sivuston CSP (script-src 'self') estää inline-<script>-lohkot: staattisissa sivuissa ei saa olla niitä (tapahtumat.html:llä on oma, väljempi CSP)
{
  const bad = [];
  for (const f of ['barshift_ohjeet.html', 'varaus.html', 'widget.html', 'setpassword.html', 'tietosuoseloste.html', 'index.php']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(src)) bad.push(f);
  }
  if (bad.length) { console.log('FAIL: inline-skriptilohko (CSP estää sen) tiedostoissa: ' + bad.join(', ')); process.exit(1); }
  console.log('ok: staattisissa sivuissa ei inline-skriptejä');
}

// Sovelluksen tila rakennetaan API-vastauksesta kenttäluettelolla (load ja loadSilent): jokainen etusivun käyttämä kenttä on oltava mukana molemmissa,
// muuten tieto näkyy API:ssa mutta ei käyttöliittymässä (esim. Huomio-lista).
{
  const core = require('fs').readFileSync(require('path').join(__dirname, '..', 'assets/js/core.js'), 'utf8');
  const builders = core.split('private_messages: data.private_messages || []').length - 1;
  for (const k of ['hub_pending_apps', 'my_outside_gigs']) {
    const n = core.split(k + ': data.' + k).length - 1;
    if (n !== builders) { console.log(`FAIL: ${k} puuttuu load()- tai loadSilent()-funktion tilasta (${n}/${builders})`); process.exit(1); }
  }
  console.log('ok: tilan kenttäluettelot ovat yhtenevät');
}

// deleteItem() kutsutaan myös muokkausikkunoista (esim. vuoron Poista-painike): onnistunut poisto sulkee ikkunan, virhe näytetään eikä ikkunaa sulleta
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'assets/js/admin.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function deleteItem'), src.indexOf('function changeDate'));
  const run = async (resp) => {
    const log = []; const ctx = { confirm: () => true, fetch: async () => resp, showToast: (m, t) => log.push(['toast', m, t || 'success']), closeModal: () => log.push(['close']), load: () => log.push(['load']), console };
    require('vm').createContext(ctx); require('vm').runInContext(fn, ctx); await ctx.deleteItem(1, 'shift'); return log.map(l => l[0] + (l[2] === 'error' ? ':error' : '')).join(',');
  };
  (async () => {
    const okLog = await run({ ok: true, json: async () => ({ success: true }) });
    const errLog = await run({ ok: false, json: async () => ({ error: 'Ei oikeuksia' }) });
    if (okLog !== 'close,toast,load') { console.log('FAIL: onnistunut poisto ei sulje ikkunaa: ' + okLog); process.exit(1); }
    if (errLog !== 'toast:error') { console.log('FAIL: virheellinen poisto: ' + errLog); process.exit(1); }
    console.log('ok: poisto sulkee muokkausikkunan');
  })();
}
