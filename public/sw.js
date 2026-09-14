const CACHE_NAME = "study-tracker-shell-v4";
const APP_SHELL = [
    "/",
    "/display",
    "/manifest-input.json",
    "/manifest-display.json",
    "/css/style.css",
    "/js/input.js",
    "/js/tasks.js",
    "/js/display.js",
    "/js/pwa.js",
    "/icons/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// stale-while-revalidate: まずキャッシュを即返しつつ、裏で必ず最新を取りに行って
// キャッシュを更新する。CACHE_NAMEを毎回上げなくても新しいデプロイが次回表示に反映される。
self.addEventListener("fetch", (event) => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== "GET" || requestUrl.pathname.startsWith("/api/")) {
        return;
    }
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            const updateCache = fetch(event.request)
                .then((response) => {
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                })
                .catch(() => cached);

            if (cached) {
                event.waitUntil(updateCache);
                return cached;
            }
            return updateCache;
        })
    );
});
