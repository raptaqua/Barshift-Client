/*
 * Vuosiloman kertymän laskenta Suomen vuosilomalain (162/2005) mukaan.
 *
 * Perusteet:
 *  - Lomanmääräytymisvuosi 1.4.–31.3.; lomavuosi 2.5.–30.4. Lomanmääräytymisvuonna kertynyt loma pidetään seuraavana lomavuonna.
 *  - Kertyminen täydeltä lomanmääräytymiskuukaudelta: 2 arkipäivää, jos työsuhde on lomanmääräytymisvuoden
 *    loppuun (31.3.) mennessä kestänyt alle vuoden; 2,5 arkipäivää, jos vähintään vuoden. Murtoluku pyöristetään ylöspäin.
 *  - Täysi lomanmääräytymiskuukausi: kalenterikuukausi, jona työsuhdetta on vähintään 14 päivää (kuukausipalkkainen/vakituinen)
 *    tai työtunteja vähintään 35 (tuntiperusteinen, esim. keikkalainen).
 *  - Lomapäivät ovat arkipäiviä ma–la; sunnuntait, kirkolliset juhlapäivät, itsenäisyyspäivä, vappu sekä
 *    joulu-, juhannus- ja pääsiäisaatto eivät ole loma-arkipäiviä.
 *  - Keikkalaiselle (tuntiperusteinen) loma voidaan korvata rahana: lomakorvaus 9 % (työsuhde alle 1 v) tai 11,5 % (vähintään 1 v).
 *
 * Laskuri on apuväline, ei oikeudellinen neuvo: työehtosopimus voi antaa enemmän. Sairauspoissaolojen
 * "työssäolon veroista aikaa" ei huomioida tuntiperusteisessa laskennassa.
 */
(function (root) {
    'use strict';
    var MS = 86400000;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    function parse(s) { var p = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
    function fmt(t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function addDays(s, n) { return fmt(parse(s) + n * MS); }
    function weekday(s) { return new Date(parse(s)).getUTCDay(); }   // 0 = sunnuntai
    function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }   // m = 1..12

    function easter(y) {   // Anonyymi gregoriaaninen algoritmi
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
            f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
            i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
            month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return y + '-' + pad(month) + '-' + pad(day);
    }

    var hCache = {};
    function holidays(y) {
        if (hCache[y]) return hCache[y];
        var e = easter(y), set = {};
        var add = function (s) { set[s] = true; };
        add(y + '-01-01'); add(y + '-01-06'); add(y + '-05-01'); add(y + '-12-06'); add(y + '-12-24'); add(y + '-12-25'); add(y + '-12-26');
        add(addDays(e, -2)); add(addDays(e, -1)); add(e); add(addDays(e, 1)); add(addDays(e, 39)); add(addDays(e, 49));
        for (var d = 19; d <= 26; d++) {                       // juhannusaatto (pe 19.–25.) ja juhannuspäivä (la 20.–26.)
            var s = y + '-06-' + pad(d), wd = weekday(s);
            if (wd === 5 && d <= 25) add(s);
            if (wd === 6 && d >= 20) add(s);
        }
        for (var n = 0; n < 7; n++) {                          // pyhäinpäivä: la 31.10.–6.11.
            var t = addDays(y + '-10-31', n);
            if (weekday(t) === 6) { add(t); break; }
        }
        hCache[y] = set;
        return set;
    }

    function isLeaveDay(s) {
        return weekday(s) !== 0 && !holidays(Number(String(s).slice(0, 4)))[String(s).slice(0, 10)];
    }
    /** Loma-arkipäivien määrä välillä (molemmat päivät mukaan). */
    function leaveDays(start, end) {
        var n = 0;
        for (var t = parse(start); t <= parse(end); t += MS) if (isLeaveDay(fmt(t))) n++;
        return n;
    }

    /** Lomavuoden alkuvuosi päivälle: lomavuosi Y = 2.5.Y – 30.4.(Y+1). */
    function leaveYearOf(dateStr) {
        var y = Number(String(dateStr).slice(0, 4));
        return String(dateStr).slice(0, 10) >= y + '-05-01' ? y : y - 1;
    }
    function leaveYearRange(Y) { return { start: Y + '-05-02', end: (Y + 1) + '-04-30' }; }

    var fmtNum = function (n) { return String(Math.round(n * 10) / 10).replace('.', ','); };

    /**
     * Lomanmääräytymisvuoden 1.4.(Y-1)–31.3.Y kertymä.
     * user: { start_date, employment_type }; opts: { today, hoursInMonth(ym)->tunnit }
     */
    function accrual(user, Y, opts) {
        opts = opts || {};
        var S = user && user.start_date ? String(user.start_date).slice(0, 10) : null;
        var res = { year: Y, rate: 2, months: 0, monthsDone: 0, earned: 0, projected: 0, complete: false, hasStart: !!S, casual: !!user && user.employment_type === 'casual' };
        if (!S) return res;
        var today = opts.today || fmt(Date.now());
        res.complete = today > Y + '-03-31';
        res.rate = S <= (Y - 1) + '-04-01' ? 2.5 : 2;   // työsuhde kestänyt vähintään vuoden 31.3. mennessä
        res.longService = res.rate === 2.5;
        for (var i = 0; i < 12; i++) {
            var mIdx = 3 + i, y = Y - 1 + Math.floor(mIdx / 12), m = (mIdx % 12) + 1;   // huhti..maalis
            var ym = y + '-' + pad(m), first = ym + '-01', dim = daysInMonth(y, m), last = ym + '-' + pad(dim);
            if (S > last) continue;
            var hours = opts.hoursInMonth ? opts.hoursInMonth(ym) : 0;
            var full;
            if (res.casual) full = hours >= 35;
            else {
                var employed = S <= first ? dim : dim - Number(S.slice(8, 10)) + 1;
                full = employed >= 14 || hours >= 35;
            }
            if (!full) continue;
            res.months++;
            if (last < today) res.monthsDone++;
        }
        var calc = function (n) { return Math.min(30, Math.ceil(n * res.rate - 1e-9)); };
        res.projected = calc(res.months);
        res.earned = res.complete ? res.projected : calc(res.monthsDone);
        return res;
    }

    /**
     * Yhteenveto lomavuodelle (viitepäivän mukaan).
     * absences: koko lista; excludeId: ohitetaan (arvioitaessa juuri tätä hakemusta).
     */
    function summary(user, absences, opts) {
        opts = opts || {};
        var today = opts.today || fmt(Date.now());
        var ref = opts.refDate || today;
        var Y = leaveYearOf(ref), range = leaveYearRange(Y);
        var acc = accrual(user, Y, { today: today, hoursInMonth: opts.hoursInMonth });      // tälle lomavuodelle kertynyt (kertymisjakso päättyi 31.3.Y)
        var next = accrual(user, Y + 1, { today: today, hoursInMonth: opts.hoursInMonth }); // seuraavaan lomavuoteen kertyvä
        var used = 0, pending = 0;
        (absences || []).forEach(function (a) {
            if (!a || a.user_id != user.id || a.type !== 'vacation' || a.id == opts.excludeId) return;
            if (a.status !== 'approved' && a.status !== 'pending') return;
            var s = a.start_date > range.start ? a.start_date : range.start, e = a.end_date < range.end ? a.end_date : range.end;
            if (s > e) return;
            var d = leaveDays(s, e);
            if (a.status === 'approved') used += d; else pending += d;
        });
        var entitled = acc.complete ? acc.earned : acc.projected;   // tulevaa lomavuotta arvioitaessa käytetään ennustetta
        return {
            leaveYear: Y, range: range, accrual: acc, next: next,
            entitled: entitled, used: used, pending: pending, remaining: entitled - used,
            remainingAfterPending: entitled - used - pending,
            casual: acc.casual, hasStart: acc.hasStart, rate: acc.rate,
            compensationPct: acc.longService ? 11.5 : 9
        };
    }

    var api = { easter: easter, holidays: holidays, isLeaveDay: isLeaveDay, leaveDays: leaveDays, leaveYearOf: leaveYearOf,
                leaveYearRange: leaveYearRange, accrual: accrual, summary: summary, fmtNum: fmtNum, addDays: addDays };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSLeave = api;
})(typeof window !== 'undefined' ? window : globalThis);
