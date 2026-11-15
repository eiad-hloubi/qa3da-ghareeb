const C = 'qa3da-ghareeb-v2';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/qrcode.min.js', '/icon.svg', '/manifest.json',
  '/fonts/changa-arabic-400-normal.woff2', '/fonts/changa-arabic-600-normal.woff2', '/fonts/changa-arabic-800-normal.woff2', '/fonts/lalezar-arabic-400-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
