// Service worker: deixa o app abrir rápido e funcionar sem internet.
// Arquivos do próprio site: tenta a rede primeiro (para pegar a versão nova) e usa a cópia guardada se estiver offline.
const CACHE = "meus-ganhos-v3";
const ARQUIVOS = [
  "/", "/index.html", "/estilo.css", "/app.js", "/config.js", "/manifest.webmanifest",
  "/icone.svg", "/icone-192.png", "/icone-512.png", "/apple-touch-icon.png"
];
const SDK = "https://www.gstatic.com/firebasejs/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(chaves => Promise.all(chaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Biblioteca do Firebase (versão fixa): usa a cópia guardada
  if (req.url.startsWith(SDK)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
      const copia = resp.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
      return resp;
    })));
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(resp => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return resp;
    }).catch(() => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("/index.html") : undefined)))
  );
});
