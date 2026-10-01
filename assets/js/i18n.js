// ===================== KIELITUKI (suomi / English / Svenska) =====================
// Käyttöliittymän tekstit kirjoitetaan suomeksi. Valittaessa toinen kieli ladataan sanakirja assets/lang/<kieli>.json ja tekstit vaihdetaan
// DOM:iin (tekstisolmut sekä title/placeholder/aria-label/alt) sekä toasteihin ja vahvistusikkunoihin. Puuttuva käännös näkyy suomeksi.
// Uusien tekstien lisäys: lisää avain (suomenkielinen teksti täsmälleen) ja käännös tiedostoihin assets/lang/*.json; `node tools/i18n_check.js` listaa puuttuvat.
(function () {
    var LANGS = { fi: 'Suomi', en: 'English', sv: 'Svenska' };
    var FI_MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
    var lang = 'fi';
    try { var saved = localStorage.getItem('barshift_lang'); if (saved && LANGS[saved]) lang = saved; } catch (e) {}
    var dict = {}, patterns = [], months = null, cache = {};

    function translate(s) {
        if (lang === 'fi' || typeof s !== 'string') return s;
        var m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); var core = m[2];
        if (core.length < 2) return s;
        var hit = cache[core];
        if (hit === undefined) {
            hit = dict[core];
            if (hit === undefined) {
                for (var i = 0; i < patterns.length; i++) { var p = patterns[i]; if (p.re.test(core)) { hit = core.replace(p.re, p.to); break; } }
                if (hit === undefined && months) { var mm = core.match(/^(tammikuu|helmikuu|maaliskuu|huhtikuu|toukokuu|kesäkuu|heinäkuu|elokuu|syyskuu|lokakuu|marraskuu|joulukuu)( \d{4})?$/i); if (mm) hit = months[FI_MONTHS.indexOf(mm[1].toLowerCase())] + (mm[2] || ''); }
                if (hit === undefined) hit = null;
            }
            cache[core] = hit;
        }
        return hit === null ? s : m[1] + hit + m[3];
    }
    window.bsT = translate;
    window.bsLang = function () { return lang; };
    window.bsLangs = LANGS;
    window.bsSetLang = function (l) { if (!LANGS[l]) return; try { localStorage.setItem('barshift_lang', l); } catch (e) {} location.reload(); };

    var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
    function skip(el) { return !el || /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(el.nodeName) || (el.closest && el.closest('[data-no-i18n]')); }
    function walk(root) {
        if (lang === 'fi' || !root) return;
        if (root.nodeType === 3) { if (!skip(root.parentElement)) { var v = translate(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
        if (root.nodeType !== 1 || skip(root)) return;
        var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), n;
        (function attrs(el) { ATTRS.forEach(function (a) { var v = el.getAttribute && el.getAttribute(a); if (v) { var tv = translate(v); if (tv !== v) el.setAttribute(a, tv); } }); })(root);
        while ((n = tw.nextNode())) {
            if (n.nodeType === 3) { if (!skip(n.parentElement)) { var nv = translate(n.nodeValue); if (nv !== n.nodeValue) n.nodeValue = nv; } }
            else if (!skip(n)) ATTRS.forEach(function (a) { var v = n.getAttribute(a); if (v) { var tv = translate(v); if (tv !== v) n.setAttribute(a, tv); } });
        }
    }
    window.bsTranslateDom = walk;

    var scheduled = false, pending = [];
    function flush() { scheduled = false; var list = pending; pending = []; list.forEach(walk); }
    function start() {
        document.documentElement.lang = lang;
        walk(document.body);
        new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (m.type === 'characterData') pending.push(m.target);
                else if (m.type === 'attributes') pending.push(m.target);
                else m.addedNodes.forEach(function (nd) { pending.push(nd); });
            });
            if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }

    // confirm / prompt / alert: käännetään viesti ennen näyttöä
    ['confirm', 'alert'].forEach(function (k) { var o = window[k].bind(window); window[k] = function (msg) { return o(translate(String(msg))); }; });
    var op = window.prompt.bind(window); window.prompt = function (msg, def) { return op(translate(String(msg)), def); };

    if (lang === 'fi') return;
    fetch('assets/lang/' + lang + '.json', { cache: 'default' }).then(function (r) { return r.json(); }).then(function (j) {
        dict = j.strings || {}; months = j.months || null;
        (j.patterns || []).forEach(function (p) { try { patterns.push({ re: new RegExp(p[0]), to: p[1] }); } catch (e) {} });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    }).catch(function () {});
})();
