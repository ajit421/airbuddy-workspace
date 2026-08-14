/**
 * fcm.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared FCM helpers for every push-sending trigger.
 *
 * Token storage model (see src/services/pushService.js on the client):
 *   users/{uid}.fcmTokens  string[]  — every device the user has registered
 *   users/{uid}.fcmToken   string    — the most recently registered device,
 *                                     kept for backwards compatibility with
 *                                     documents written before multi-device
 *                                     support existed.
 *
 * Both are read here and de-duplicated, so a user with an old single-token
 * document still receives push.
 *
 * Stale tokens (unregistered / invalid) are pruned from Firestore automatically
 * after each send, otherwise the token arrays grow forever and every send wastes
 * quota on dead devices.
 */

'use strict';

const logger = require('firebase-functions/logger');
const { defineString } = require('firebase-functions/params');

const { db, FieldValue, getMessaging } = require('./adminApp');

/** Where a click on a push notification should land. */
const APP_URL = defineString('APP_URL', {
  default: 'https://airbuddy-workspace.vercel.app',
  description: 'Origin the web app is served from — used as the push notification click target.',
});

/** sendEachForMulticast accepts at most 500 tokens per call. */
const MULTICAST_BATCH_SIZE = 500;

/** Error codes that mean "this token is dead, stop sending to it". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

/**
 * Collect every FCM token belonging to the given users.
 *
 * @param {string[]} uids
 * @returns {Promise<Map<string, string>>} token -> owning uid
 */
async function getTokenOwners(uids) {
  const unique = [...new Set((uids || []).filter(Boolean))];
  const owners = new Map();

  await Promise.all(unique.map(async (uid) => {
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return;
      const data = snap.data() || {};

      const tokens = [];
      if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
      if (typeof data.fcmToken === 'string') tokens.push(data.fcmToken);

      for (const token of tokens) {
        if (typeof token === 'string' && token.length > 0 && !owners.has(token)) {
          owners.set(token, uid);
        }
      }
    } catch (err) {
      logger.error(`[fcm] getTokenOwners failed for ${uid}:`, err);
    }
  }));

  return owners;
}

/** Collect every FCM token in the users collection (announcement fan-out). */
async function getAllTokenOwners() {
  const owners = new Map();
  const snap = await db.collection('users').get();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const tokens = [];
    if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
    if (typeof data.fcmToken === 'string') tokens.push(data.fcmToken);

    for (const token of tokens) {
      if (typeof token === 'string' && token.length > 0 && !owners.has(token)) {
        owners.set(token, doc.id);
      }
    }
  });

  return owners;
}

/**
 * Remove dead tokens from their owners' user documents.
 *
 * @param {Array<{ uid: string, token: string }>} dead
 */
async function pruneDeadTokens(dead) {
  if (dead.length === 0) return;

  // Group by uid so each user document is touched once.
  const byUid = new Map();
  for (const { uid, token } of dead) {
    if (!byUid.has(uid)) byUid.set(uid, []);
    byUid.get(uid).push(token);
  }

  await Promise.all([...byUid.entries()].map(async ([uid, tokens]) => {
    try {
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) return;

      const update = { fcmTokens: FieldValue.arrayRemove(...tokens) };
      // Clear the legacy single-token field too when it is one of the dead ones.
      if (tokens.includes(snap.data().fcmToken)) {
        update.fcmToken = FieldValue.delete();
      }
      await ref.update(update);
      logger.info(`[fcm] pruned ${tokens.length} dead token(s) for ${uid}`);
    } catch (err) {
      logger.error(`[fcm] pruneDeadTokens failed for ${uid}:`, err);
    }
  }));
}

/**
 * Send a push notification to a set of tokens and prune the dead ones.
 *
 * @param {Map<string, string>} tokenOwners  token -> uid, from getTokenOwners()
 * @param {{ title: string, body: string }} notification
 * @param {object} [data]   Extra key/value payload (values must be strings)
 * @param {string} [label]  Log label, e.g. 'new task: Fix the wing'
 * @returns {Promise<{ successCount: number, failureCount: number }>}
 */
async function sendPush(tokenOwners, notification, data = {}, label = 'push') {
  const tokens = [...tokenOwners.keys()];
  if (tokens.length === 0) {
    logger.info(`[fcm] ${label}: no registered devices — skipping`);
    return { successCount: 0, failureCount: 0 };
  }

  const link = APP_URL.value();
  const dead = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < tokens.length; i += MULTICAST_BATCH_SIZE) {
    const batch = tokens.slice(i, i + MULTICAST_BATCH_SIZE);

    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens: batch,
        notification,
        data: { ...data, link },
        webpush: {
          notification: {
            icon: '/airbuddyin_logo.png',
            badge: '/airbuddyin_logo.png',
          },
          fcmOptions: { link },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((resp, idx) => {
        if (resp.success || !resp.error) return;
        const token = batch[idx];
        if (DEAD_TOKEN_CODES.has(resp.error.code)) {
          dead.push({ uid: tokenOwners.get(token), token });
        } else {
          logger.warn(`[fcm] ${label}: send failed (${resp.error.code})`);
        }
      });
    } catch (err) {
      logger.error(`[fcm] ${label}: multicast threw:`, err);
      failureCount += batch.length;
    }
  }

  logger.info(`[fcm] ${label}: ${successCount} sent, ${failureCount} failed, ${dead.length} stale`);
  await pruneDeadTokens(dead);

  return { successCount, failureCount };
}

module.exports = {
  APP_URL,
  getTokenOwners,
  getAllTokenOwners,
  sendPush,
  pruneDeadTokens,
};
