/*
 * Service worker do MyPlace (Fase 19) — só cuida de notificação push.
 * Nada de cache de páginas aqui: o app não é offline-first, e um SW que
 * intercepta fetch sem cuidado é a causa clássica de "site preso na versão
 * antiga" — mais risco do que vale pra este objetivo.
 */

self.addEventListener('push', (event) => {
  let payload = { title: 'MyPlace', body: '', url: '/' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'MyPlace', {
      body: payload.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.endsWith(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
