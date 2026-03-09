const CACHE_NAME = 'handl-v1';

// Filer vi eventuelt vil cache for offline-brug (kun et basalt sæt til prototype)
// I produktion vil Vite's build-process eller PWA-plugin typisk håndtere pre-caching af alle genererede filer.
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/vite.svg'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(URLS_TO_CACHE);
            })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // En simpel netværk-først strategi for prototypen, fals for caching hvis offline
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// Lyt efter push notifikationer
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { title: 'handl.', body: 'Ny opdatering!' };

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/vite.svg',
            badge: '/vite.svg',
            data: data.url // Kan indeholde en URL vi vil åbne ved klik
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    // Prøv at åbne appen eller fokusér vinduet hvis det er åbent
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            const targetUrl = event.notification.data || '/';

            for (const client of clientList) {
                if (client.url === targetUrl && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
