/* TrueWage service worker: lets the app open instantly and work offline once visited.
   Network-first for the app shell (so updates always win), cache fallback when offline. API calls are never cached. */
const V = 'truewage-v6';
const SHELL = ['/', '/index.html', '/css/style.css', '/js/engine.js', '/js/places.js', '/js/ask.js', '/js/demo.js', '/js/i18n.js', '/js/reader.js', '/js/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('/index.html'))));
});
