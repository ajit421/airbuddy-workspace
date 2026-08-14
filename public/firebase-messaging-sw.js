/**
 * firebase-messaging-sw.js — background push handler
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase Cloud Messaging requires a service worker at this exact origin path
 * to deliver notifications while the tab is closed or backgrounded. Without
 * this file, getToken() fails and background push cannot work at all — which is
 * why FCM was dead in this app even though the Cloud Functions to send it had
 * been written.
 *
 * ── Why the config comes from the query string ───────────────────────────────
 * A service worker cannot read `import.meta.env`, and this file lives in
 * public/ so Vite copies it verbatim without substituting anything. Rather than
 * committing the Firebase config here, src/services/push.js registers the
 * worker with the config appended as query parameters:
 *
 *     navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=…')
 *
 * and this file reads them back off `self.location`. The Firebase web config is
 * not secret (it ships in the client bundle regardless), but keeping it out of
 * the repo means there is exactly one source of truth: `.env`.
 *
 * ── Registration is versioned ────────────────────────────────────────────────
 * SW_VERSION is part of the registered URL, so bumping it forces the browser to
 * treat this as a new worker and re-install rather than serving the cached one.
 */

importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;

const firebaseConfig = {
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  storageBucket:     params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId'),
};

const DEFAULT_ICON = '/airbuddyin_logo.png';

// Activate immediately instead of waiting for every old tab to close.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

if (firebaseConfig.projectId && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  /**
   * Fallback display path for data-only messages.
   *
   * Messages that carry a `notification` block (everything functions/fcm.js
   * sends today) are rendered by the SDK automatically and never reach this
   * handler. It exists so a future data-only payload still surfaces.
   */
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return; // already displayed by the SDK

    const data = payload.data || {};
    self.registration.showNotification(data.title || 'AirBuddy WorkSpace', {
      body: data.body || '',
      icon: DEFAULT_ICON,
      badge: DEFAULT_ICON,
      data: { link: data.link || '/' },
    });
  });
} else {
  console.warn('[firebase-messaging-sw] missing Firebase config in registration URL — push disabled');
}

/**
 * Focus an already-open tab if there is one, otherwise open a new one.
 * Without this the notification is inert on click in most browsers.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link =
    event.notification.data?.FCM_MSG?.notification?.click_action ||
    event.notification.data?.link ||
    '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(link);
    })
  );
});
