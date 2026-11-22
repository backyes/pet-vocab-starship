const VERSION = "pet-starship-v9";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "game.js",
  "js/world.js",
  "js/audio.js",
  "data/themes.js",
  "data/vocab.json",
  "vendor/three.module.min.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/audio/")) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.status === 200) cache.put(request, response.clone());
        return response;
      }).catch(() => fetch(request)),
    );
    return;
  }

  // 导航请求按 URL 分别缓存：项目里还有 ink-cards/ 等子页面，
  // 统一覆盖 "index.html" 会让星舰首页的离线缓存被子页面顶掉。
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => caches.match(request).then((hit) => hit || caches.match("index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) caches.open(VERSION).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
