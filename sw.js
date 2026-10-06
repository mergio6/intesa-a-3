/* Intesa a 3 - service worker
   Serve a due cose: (1) far funzionare il gioco anche senza connessione, (2) tenere sempre aggiornata la versione
   quando c'è rete. Strategia: "prima la rete, poi la copia salvata". Quindi, quando carichi su GitHub un file nuovo,
   l'app lo mostra al primo avvio con connessione; senza rete usa l'ultima copia salvata. */

var CACHE = 'intesa-a-3-v1';
var PRECACHE = [
  './', 'index.html', 'manifest.webmanifest',
  'facili.txt', 'difficili.txt', 'raddoppi.txt',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'
];
// i caratteri (Google Fonts) vengono salvati la prima volta che si usa l'app con la rete, così offline restano uguali
var FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // uno per uno: se un file manca (per esempio una lista di parole) l'installazione non fallisce
      return Promise.all(PRECACHE.map(function (url) { return cache.add(url).catch(function () { /* ignora */ }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// chiave di cache senza parametri (?v=..., ?t=...): la stessa pagina o lista parole ha sempre la stessa copia
function cacheKey(url) { return new Request(url.origin + url.pathname); }

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 1) file del gioco (stessa origine): prima la rete (sempre aggiornato), se manca la rete la copia salvata
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(cacheKey(url), copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(cacheKey(url)).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') return caches.match(cacheKey(new URL('index.html', self.registration.scope)));
          return Response.error();
        });
      })
    );
    return;
  }

  // 2) caratteri: prima la copia salvata (veloce), e intanto la aggiorno
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
  }
});
