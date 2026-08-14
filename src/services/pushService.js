/**
 * pushService.js — Firebase Cloud Messaging (web push)
 * ─────────────────────────────────────────────────────────────────────────────
 * Everything needed to turn a signed-in browser into an FCM-addressable device.
 *
 * This is the piece that was missing while the project sat on the Spark plan:
 * functions/index.js has always known how to *send* push, but nothing on the
 * client ever registered a service worker or wrote a device token, so there was
 * never an address to send to.
 *
 * Token storage model — users/{uid}:
 *   fcmTokens          string[]   every device this user has registered
 *   fcmToken           string     most recent device (kept for older documents
 *                                 and read by functions/fcm.js as a fallback)
 *   fcmTokenUpdatedAt  Timestamp  last registration, for debugging stale devices
 *
 * Cloud Functions prune dead tokens from `fcmTokens` after a failed send, so the
 * array does not grow without bound.
 *
 * Layering note: this is a service, so components must not call into
 * firebase/messaging directly — go through enablePushNotifications().
 */

import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
} from 'firebase/messaging';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  serverTimestamp,
} from 'firebase/firestore';

import app, { db, firebaseConfig } from './firebase';

/** Bumping this forces browsers to re-install the worker instead of reusing a cached one. */
const SW_VERSION = '1';
const SW_PATH = '/firebase-messaging-sw.js';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/** Result codes returned by enablePushNotifications — safe to branch on in UI. */
export const PUSH_STATUS = {
  READY:       'ready',
  UNSUPPORTED: 'unsupported',
  DENIED:      'denied',
  DISMISSED:   'dismissed',
  NO_VAPID:    'no-vapid-key',
  ERROR:       'error',
};

// Resolved once per page load — isSupported() does real feature detection.
let messagingPromise = null;

/**
 * Resolve the Messaging instance, or null when the browser cannot do web push
 * (Safari below 16.4, most in-app browsers, any non-secure origin).
 *
 * @returns {Promise<import('firebase/messaging').Messaging|null>}
 */
function getMessagingIfSupported() {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((supported) => (supported ? getMessaging(app) : null))
      .catch(() => null);
  }
  return messagingPromise;
}

/**
 * Register the FCM service worker, passing the Firebase config through the
 * query string. A service worker cannot read import.meta.env, and the file
 * lives in public/ where Vite performs no substitution — see the comment block
 * in public/firebase-messaging-sw.js.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
async function registerMessagingServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  const params = new URLSearchParams({
    apiKey:            firebaseConfig.apiKey ?? '',
    authDomain:        firebaseConfig.authDomain ?? '',
    projectId:         firebaseConfig.projectId ?? '',
    storageBucket:     firebaseConfig.storageBucket ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId:             firebaseConfig.appId ?? '',
    v:                 SW_VERSION,
  });

  try {
    return await navigator.serviceWorker.register(`${SW_PATH}?${params.toString()}`, {
      scope: '/',
    });
  } catch (err) {
    console.error('[pushService] registerMessagingServiceWorker:', err);
    return null;
  }
}

/**
 * Persist a device token on the user's profile document.
 *
 * Requires the firestore.rules carve-out that lets a user write their own
 * fcmToken / fcmTokens / fcmTokenUpdatedAt fields — every other self-write to
 * those keys is still denied.
 *
 * @param {string} uid    Effective UID (never user.uid — see AuthContext)
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function saveFcmToken(uid, token) {
  if (!uid || !token) return;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fcmToken:          token,
      fcmTokens:         arrayUnion(token),
      fcmTokenUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[pushService] saveFcmToken:', err);
    throw err;
  }
}

/**
 * Drop a device token from the user's profile document.
 *
 * @param {string} uid
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function removeFcmToken(uid, token) {
  if (!uid || !token) return;
  try {
    const ref = doc(db, 'users', uid);
    const update = { fcmTokens: arrayRemove(token) };

    // `fcmTokens` is authoritative, but the legacy single-token field is still
    // read as a fallback by functions/fcm.js — clear it too when it points at
    // *this* device, and leave it alone when it points at another one.
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().fcmToken === token) {
      update.fcmToken = deleteField();
    }

    await updateDoc(ref, update);
  } catch (err) {
    console.error('[pushService] removeFcmToken:', err);
    throw err;
  }
}

/**
 * Full opt-in flow: feature detection → permission prompt → service worker →
 * device token → Firestore.
 *
 * Safe to call on every login; getToken() returns the existing token for a
 * device that is already registered, and the arrayUnion write is idempotent.
 *
 * @param {string} uid Effective UID of the signed-in user
 * @returns {Promise<{ status: string, token?: string }>}
 */
export async function enablePushNotifications(uid) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return { status: PUSH_STATUS.UNSUPPORTED };

  if (!VAPID_KEY) {
    console.warn('[pushService] VITE_FIREBASE_VAPID_KEY is not set — push disabled');
    return { status: PUSH_STATUS.NO_VAPID };
  }

  if (Notification.permission === 'denied') return { status: PUSH_STATUS.DENIED };

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission === 'denied')  return { status: PUSH_STATUS.DENIED };
    if (permission !== 'granted') return { status: PUSH_STATUS.DISMISSED };
  }

  try {
    const registration = await registerMessagingServiceWorker();
    if (!registration) return { status: PUSH_STATUS.UNSUPPORTED };

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { status: PUSH_STATUS.ERROR };

    await saveFcmToken(uid, token);
    return { status: PUSH_STATUS.READY, token };
  } catch (err) {
    console.error('[pushService] enablePushNotifications:', err);
    return { status: PUSH_STATUS.ERROR };
  }
}

/**
 * Opt out on this device — used at sign-out so a shared machine does not keep
 * receiving the previous user's notifications.
 *
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function disablePushNotifications(uid) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return;

  try {
    const registration = await navigator.serviceWorker?.getRegistration(SW_PATH);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      ...(registration ? { serviceWorkerRegistration: registration } : {}),
    }).catch(() => null);

    if (token) {
      await removeFcmToken(uid, token).catch(() => {});
      await deleteToken(messaging).catch(() => {});
    }
  } catch (err) {
    // Never block sign-out on a push cleanup failure.
    console.warn('[pushService] disablePushNotifications:', err);
  }
}

/**
 * Subscribe to pushes that arrive while the tab is focused. FCM does not
 * display these itself — the callback decides what to do.
 *
 * @param {(payload: object) => void} callback
 * @returns {Promise<() => void>} unsubscribe
 */
export async function onForegroundPush(callback) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
