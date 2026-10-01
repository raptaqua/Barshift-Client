#!/usr/bin/env node
// Kielitiedostojen tarkistus: JSON on kelvollinen, säännölliset lausekkeet toimivat, ja listaa suomenkieliset käyttöliittymätekstit,
// joille puuttuu käännös. Käyttö:  node tools/i18n_check.js [--missing] [kieli]     (--missing tulostaa puuttuvat; ilman sitä vain yhteenveto)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), langs = process.argv.slice(2).filter(a => !a.startsWith('--')), showMissing = process.argv.includes('--missing');
const files = fs.readdirSync(path.join(root, 'assets/js')).filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => path.join(root, 'assets/js', f)).concat([path.join(root, 'index.php'), path.join(root, 'leave.js')]);
const found = new Map();
const add = t => { t = t.replace(/\s+/g, ' ').trim(); if (t.length < 2 || t.length > 160 || /[<>{}$]|&&|\|\||=>|\.join|\) \{| = |==|\\n|&nbsp;/.test(t) || !/[A-Za-zÅÄÖåäö]/.test(t) || /^https?:/.test(t)) return; found.set(t, (found.get(t) || 0) + 1); };
for (const f of files) {
    const s = fs.readFileSync(f, 'utf8'); let m;
    for (const re of [/>([^<>{}`$]+)</g, /(?:placeholder|title|aria-label)="([^"$<>{}]+)"/g, /showToast\(\s*['"]([^'"$]+)['"]/g, /(?:confirm|prompt)\(\s*['"`]([^'"`$]+)['"`]/g]) while ((m = re.exec(s))) add(m[1]);
}
let bad = 0;
for (const l of (langs.length ? langs : ['en', 'sv'])) {
    const p = path.join(root, 'assets/lang', l + '.json'); let j;
    try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error(l + ': virheellinen JSON – ' + e.message); bad++; continue; }
    if (!j.strings || typeof j.strings !== 'object') { console.error(l + ': "strings" puuttuu'); bad++; }
    if (j.months && j.months.length !== 12) { console.error(l + ': "months" vaatii 12 nimeä'); bad++; }
    for (const [re] of j.patterns || []) { try { new RegExp(re); } catch (e) { console.error(l + ': virheellinen lauseke ' + re); bad++; } }
    for (const [k, v] of Object.entries(j.strings)) if (typeof v !== 'string' || !v.trim()) { console.error(l + ': tyhjä käännös: ' + k); bad++; }
    const missing = [...found.keys()].filter(k => !(k in j.strings));
    console.log(`${l}: ${Object.keys(j.strings).length} käännöstä, ${found.size - missing.length}/${found.size} koodista löytyvää tekstiä katettu`);
    if (showMissing) console.log(missing.join('\n'));
}
process.exit(bad ? 1 : 0);
