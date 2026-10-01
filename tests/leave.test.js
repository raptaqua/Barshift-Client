// Ajo: node tests/leave.test.js
const assert = require('assert');
const L = require('../leave.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('pääsiäinen', () => { assert.strictEqual(L.easter(2024), '2024-03-31'); assert.strictEqual(L.easter(2025), '2025-04-20'); assert.strictEqual(L.easter(2026), '2026-04-05'); });
t('pyhät 2026', () => {
    const h = L.holidays(2026);
    ['2026-01-01','2026-01-06','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-05-01','2026-05-14','2026-05-24','2026-06-19','2026-06-20','2026-10-31','2026-12-06','2026-12-24','2026-12-25','2026-12-26']
        .forEach(d => assert.ok(h[d], d));
    assert.ok(!h['2026-06-18'] && !h['2026-12-31'] && !h['2026-11-01']);
});
t('juhannus ja pyhäinpäivä eri vuosina', () => {
    assert.ok(L.holidays(2025)['2025-06-20'] && L.holidays(2025)['2025-06-21'] && L.holidays(2025)['2025-11-01']);
    assert.ok(L.holidays(2027)['2027-06-25'] && L.holidays(2027)['2027-06-26'] && L.holidays(2027)['2027-11-06']);
    assert.ok(L.holidays(2024)['2024-06-21'] && L.holidays(2024)['2024-06-22'] && L.holidays(2024)['2024-11-02']);
});
t('loma-arkipäivät: ma–la, ei pyhiä', () => {
    assert.strictEqual(L.leaveDays('2026-06-15', '2026-06-21'), 4);   // ma–su, juhannus
    assert.strictEqual(L.leaveDays('2026-06-01', '2026-06-06'), 6);   // ma–la
    assert.strictEqual(L.leaveDays('2026-12-21', '2026-12-27'), 3);   // joulu
    assert.strictEqual(L.leaveDays('2026-10-07', '2026-10-07'), 1);
    assert.strictEqual(L.leaveDays('2026-10-04', '2026-10-04'), 0);   // sunnuntai
});
t('lomavuosi', () => {
    assert.strictEqual(L.leaveYearOf('2026-09-30'), 2026); assert.strictEqual(L.leaveYearOf('2026-04-30'), 2025);
    assert.strictEqual(L.leaveYearOf('2026-05-02'), 2026); assert.strictEqual(L.leaveYearOf('2027-01-10'), 2026);
});
const reg = s => ({ id: 1, start_date: s, employment_type: 'regular' });
const acc = (u, Y, today = '2026-09-30', h) => L.accrual(u, Y, { today, hoursInMonth: h });
t('vähintään vuoden työsuhde: 30 pv', () => { const a = acc(reg('2025-04-01'), 2026); assert.strictEqual(a.rate, 2.5); assert.strictEqual(a.earned, 30); });
t('alle vuoden (1 pv vajaa): 2 pv/kk = 24', () => { const a = acc(reg('2025-04-02'), 2026); assert.strictEqual(a.rate, 2); assert.strictEqual(a.earned, 24); });
t('aloitus kesken kuukauden: 17. mennessä täysi kuukausi', () => {
    assert.strictEqual(acc(reg('2025-10-15'), 2026).earned, 12);   // loka..maalis = 6 kk × 2
    assert.strictEqual(acc(reg('2025-10-20'), 2026).earned, 10);   // loka jää pois → 5 kk × 2
    assert.strictEqual(acc(reg('2025-10-18'), 2026).projected, 12);// 18.–31. = 14 pv -> kuu on täysi
    assert.strictEqual(acc(reg('2025-10-19'), 2026).projected, 10);// 19.–31. = 13 pv -> ei täysi
});
t('vanha työsuhde, kokonaisuus 30 pv (max)', () => { assert.strictEqual(acc(reg('2015-01-01'), 2026).earned, 30); });
t('ei aloituspäivää', () => { const a = acc({ id: 1 }, 2026); assert.strictEqual(a.hasStart, false); assert.strictEqual(a.earned, 0); });
t('kertymisjakso kesken: vain valmiit kuukaudet + ennuste', () => {
    const a = acc(reg('2025-04-01'), 2027, '2026-09-30');   // 1.4.2026–31.3.2027, huhti–elokuu valmiina (syyskuu päättyy vasta tänään)
    assert.strictEqual(a.complete, false); assert.strictEqual(a.monthsDone, 5); assert.strictEqual(a.earned, 13); assert.strictEqual(a.projected, 30);
});
t('keikkalainen: kuukausi vaatii 35 h', () => {
    const hrs = { '2026-01': 40, '2026-02': 34.9, '2026-03': 35 };
    const u = { id: 2, start_date: '2025-06-01', employment_type: 'casual' };
    const a = acc(u, 2026, '2026-09-30', ym => hrs[ym] || 0);
    assert.strictEqual(a.months, 2); assert.strictEqual(a.rate, 2); assert.strictEqual(a.earned, 4); assert.strictEqual(a.casual, true);
});
t('pyöristys ylös (2,5 × 3 = 7,5 → 8)', () => {
    const hrs = {}; ['2026-01', '2026-02', '2026-03'].forEach(k => hrs[k] = 40);
    const u = { id: 2, start_date: '2024-01-01', employment_type: 'casual' };
    assert.strictEqual(acc(u, 2026, '2026-09-30', ym => hrs[ym] || 0).earned, 8);
});
t('yhteenveto: käytetty, odottava, jäljellä', () => {
    const u = reg('2020-01-01'); u.id = 5;
    const abs = [
        { id: 1, user_id: 5, type: 'vacation', status: 'approved', start_date: '2026-06-01', end_date: '2026-06-06' },   // 6
        { id: 2, user_id: 5, type: 'vacation', status: 'pending',  start_date: '2026-10-05', end_date: '2026-10-10' },   // 6
        { id: 3, user_id: 5, type: 'sick',     status: 'approved', start_date: '2026-07-01', end_date: '2026-07-10' },   // ei lasketa
        { id: 4, user_id: 6, type: 'vacation', status: 'approved', start_date: '2026-06-01', end_date: '2026-06-06' },   // toinen käyttäjä
        { id: 5, user_id: 5, type: 'vacation', status: 'approved', start_date: '2026-04-20', end_date: '2026-04-25' },   // edellinen lomavuosi
        { id: 6, user_id: 5, type: 'vacation', status: 'rejected', start_date: '2026-08-03', end_date: '2026-08-08' }    // hylätty
    ];
    const s = L.summary(u, abs, { today: '2026-09-30' });
    assert.strictEqual(s.leaveYear, 2026); assert.strictEqual(s.entitled, 30); assert.strictEqual(s.used, 6); assert.strictEqual(s.pending, 6);
    assert.strictEqual(s.remaining, 24); assert.strictEqual(s.remainingAfterPending, 18); assert.strictEqual(s.compensationPct, 11.5);
    const ex = L.summary(u, abs, { today: '2026-09-30', excludeId: 2 });
    assert.strictEqual(ex.pending, 0);
});
t('yhteenveto: tuleva lomavuosi käyttää ennustetta', () => {
    const u = reg('2025-04-01'); u.id = 1;
    const s = L.summary(u, [], { today: '2026-09-30', refDate: '2027-06-10' });
    assert.strictEqual(s.leaveYear, 2027); assert.strictEqual(s.entitled, 30);
});
t('uusi työntekijä: lomakorvaus 9 %', () => { assert.strictEqual(L.summary(reg('2026-06-01'), [], { today: '2026-09-30' }).compensationPct, 9); });
console.log(`\n${n} testiä läpi`);
