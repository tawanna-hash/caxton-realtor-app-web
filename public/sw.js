// Service worker for Realty News Now web push notifications.
// Handles incoming push events, notification clicks, and subscription changes.
// SW_VERSION: 2026-06-18.2 (icon hardening + push fallback)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      payload = { title: 'Realty News Now', body: event.data.text() };
    }
  }

  const title = payload.title || 'Realty News Now';
  const baseOptions = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    image: payload.image,
    tag: payload.tag || 'rnn-notification',
    renotify: true,
    requireInteraction: false,
    data: {
      url: payload.url || '/',
      notificationId: payload.notificationId || null,
    },
  };

  // If anything in the rich options throws (e.g. icon fails to fetch on
  // some browsers), fall back to a minimal notification so the toast is
  // never silently swallowed.
  event.waitUntil(
    self.registration.showNotification(title, baseOptions).catch(() => {
      return self.registration.showNotification(title, {
        body: baseOptions.body,
        tag: baseOptions.tag,
        data: baseOptions.data,
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  const notificationId = event.notification.data && event.notification.data.notificationId;

  event.waitUntil(
    (async () => {
      // Best-effort click tracking
      if (notificationId) {
        try {
          await fetch('/api/push/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId }),
            keepalive: true,
          });
        } catch (err) {
          // ignore
        }
      }

      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
        const newSub = await self.registration.pushManager.subscribe(
          event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true },
        );
        await fetch('/api/push/resubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldEndpoint,
            subscription: newSub.toJSON(),
          }),
        });
      } catch (err) {
        // ignore
      }
    })(),
  );
});
