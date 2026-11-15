// Offline support: the game is one HTML file plus icons. Network first for the page (so updates
// arrive), cache as the fallback when offline. The scope comes from where this file is served,
// so it works at the Pages subpath, on Vercel and on localhost alike.
const CACHE = 'spot-light-hd-v2';
const BASE = new URL('./', self.location).pathname;
const FILES = ['', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'docs/logo.png'].map(f => BASE + f);

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
