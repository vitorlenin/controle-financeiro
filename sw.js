const CACHE = "cf-cache-v7.0.5";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/ui.js",
  "./js/auth.js",
  "./js/categorias.js",
  "./js/lancamentos.js",
  "./js/relatorios.js",
  "./js/dashboard.js",
  "./js/backup.js",
  "./js/app.js",
  "./manifest.json",
  "./favicon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((fresh) => {
    cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached || fetchPromise;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Só lida com o próprio escopo
  if (url.origin !== location.origin) return;

  // Navegação (HTML) sempre tenta rede primeiro pra não ficar preso em cache
  if (e.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // JS/CSS/manifest: rede primeiro para pegar versão atual sem F5
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".json")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // Demais: cache com atualização em background
  e.respondWith(staleWhileRevalidate(e.request));
});