// ═══════════════════════════════════════════════════════════════════
// SERVICE WORKER — Pão no Frio PWA
// Cache estratégico: app shell + fallback offline
// ═══════════════════════════════════════════════════════════════════

var CACHE_NAME = 'pao-no-frio-v1';
var URLS_CACHE = [
  '/pao-no-frio/',
  '/pao-no-frio/index.html',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
];

// Install: cache app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_CACHE).catch(function(err) {
        console.log('[SW] Cache parcial:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys
        .filter(function(k) { return k !== CACHE_NAME; })
        .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Never cache API calls
  if (url.includes('railway.app') || url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(JSON.stringify({ erro: 'Sem conexão' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return resp;
      }).catch(function() {
        // Offline fallback for navigation
        if (e.request.mode === 'navigate') {
          return caches.match('/pao-no-frio/index.html');
        }
      });
    })
  );
});
