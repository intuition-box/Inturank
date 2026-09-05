/**
 * IntuRank service worker — web push only.
 *
 * Deliberately does NOT cache or intercept fetches. This app talks to a chain RPC, an
 * indexer and a wallet; a caching worker would serve stale market data, which is worse
 * than no worker at all. If offline support is ever wanted it should be added knowingly,
 * not inherited from a boilerplate.
 */

self.addEventListener('install', () => {
  // Take over straight away so the first subscribe does not need a reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A push with no payload, or a malformed one, still deserves a notification —
    // browsers penalise workers that receive a push and show nothing.
    data = {};
  }

  const title = data.title || 'IntuRank';
  const options = {
    body: data.body || 'Something you backed has moved.',
    icon: '/icon.png',
    badge: '/icon.png',
    // Same tag replaces rather than stacks, so a chatty market cannot bury the phone.
    tag: data.tag || 'inturank',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Prefer focusing a tab that is already open rather than spawning another one.
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && target) {
            return client.navigate(target).then((c) => c && c.focus());
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
