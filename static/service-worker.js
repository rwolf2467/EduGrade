// EduGrade Service Worker
const CACHE_NAME = 'edugrade-v21';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        ).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests; let everything else pass through
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request).catch(async () => {
            const cached = await caches.match(event.request);
            return cached || Response.error();
        })
    );
});
