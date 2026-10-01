// BarShift Pro: service worker. Push-ilmoitukset + offline-tila (viimeksi ladattu vuorolista luettavissa ilman verkkoa).
//  - Staattiset tiedostot (assets/, leave.js): "vanha heti, päivitys taustalla".
//  - Sivu (index.php): verkko ensin, offline-tilassa viimeksi ladattu.
//  - Pääpayload (api.php ilman action-parametria): verkko ensin, offline-tilassa viimeksi ladattu (otsake X-BarShift-Offline).
//  - Mitään muuta API:a (muutokset, viestit, vienti) ei koskaan välimuistiteta. Uloskirjautuessa välimuistit tyhjennetään (viesti "clear").
const V = 'bs-v3';
const STATIC = V + '-static', PAGES = V + '-pages', PAYLOAD = V + '-payload';
const ICON = 'assets/icon-192.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(V + '-')) await caches.delete(k);   // vanhat versiot pois
    await self.clients.claim();
})()));

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'clear') event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(PAYLOAD)]));
});

self.addEventListener('fetch', event => {
    const req = event.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;
    const path = url.pathname.replace(/^.*\//, '');
    if (path === 'api.php') {
        if (url.searchParams.has('action')) return;   // vain pääpayload
        return event.respondWith(networkFirst(req, PAYLOAD, '/payload', true));
    }
    if (req.mode === 'navigate' && (path === 'index.php' || path === '')) return event.respondWith(networkFirst(req, PAGES, '/index', false));
    if (/\/assets\//.test(url.pathname) || path === 'leave.js') return event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, cacheName, key, markOffline) {
    const cache = await caches.open(cacheName);
    try {
        const res = await fetch(req);
        if (res.ok) await cache.put(key, res.clone());
        return res;
    } catch (e) {
        const hit = await cache.match(key);
        if (!hit) throw e;
        if (!markOffline) return hit;
        const h = new Headers(hit.headers); h.set('X-BarShift-Offline', '1');
        return new Response(await hit.blob(), { status: 200, headers: h });
    }
}
async function staleWhileRevalidate(req) {
    const cache = await caches.open(STATIC), hit = await cache.match(req.url);
    const net = fetch(req).then(res => { if (res.ok) cache.put(req.url, res.clone()); return res; }).catch(() => hit);
    return hit || net;
}

// Syvälinkki vain sovelluksen omiin tunnettuihin näkymiin
const VIEWS = ['dashboard', 'calendar', 'list', 'events', 'messages', 'stats', 'absences', 'team', 'gigs'];
function deepLink(view) { return VIEWS.includes(view) && view !== 'dashboard' ? new URL('index.php?view=' + view, self.registration.scope).href : self.registration.scope; }

self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; }
    catch (e) { data = { body: event.data ? event.data.text() : '' }; }
    const icon = new URL(ICON, self.registration.scope).href;
    event.waitUntil(self.registration.showNotification(String(data.title || 'BarShift'), {
        body: String(data.body || ''), icon, badge: icon, vibrate: [100, 50, 100], tag: data.tag || undefined, data: { url: deepLink(data.view) }
    }).then(() => { try { if (self.navigator.setAppBadge) return self.navigator.setAppBadge(1); } catch (e) {} }));
});

// Napautus avaa (tai tuo esiin) sovelluksen; osoite on aina sovelluksen oma, ei ilmoituksen mukana tullut
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { if ('navigate' in c && target !== self.registration.scope) { return c.navigate(target).then(w => w && w.focus()).catch(() => c.focus()); } return c.focus(); } }
        return self.clients.openWindow(target);
    }));
});
