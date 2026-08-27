/**
 * notify.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One entry point for telling somebody something happened.
 *
 * Three channels reach a team member, and they are not interchangeable:
 *
 *   in-app bell   notifications/{uid}/items — what they see when the app is open,
 *                 and the only channel that survives a denied browser permission
 *   push (FCM)    what reaches them with the tab closed (fcm.js)
 *   Google Calendar  the reminder that fires later, at 09:00 IST (calendar.js)
 *
 * Every server-side notification goes through `notifyUsers()` so all three stay
 * in step. Before this existed, each cron wrote its own bell document inline and
 * a few events — a leave being approved, somebody being put on a milestone —
 * sent nothing at all and happened completely silently.
 *
 * Bell writes here use `senderUid: 'system'`, which is legal because the Admin
 * SDK bypasses security rules entirely. `type` must still be one of the values
 * in the enum in firestore.rules, since the client reads these documents and the
 * Navbar picks an icon from the same list.
 */

'use strict';

const logger = require('firebase-functions/logger');

const { db, FieldValue } = require('./adminApp');
const { getTokenOwners, sendPush } = require('./fcm');

/**
 * Notification types, mirroring the enum in firestore.rules and the icon map in
 * src/components/shared/Navbar.jsx. Adding one means editing all three.
 */
const NOTIF_TYPES = {
  TASK_ASSIGNED: 'task_assigned',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  TASK_RESCHEDULED: 'task_rescheduled',
  ANNOUNCEMENT: 'announcement',
  LEAVE_STATUS: 'leave_status',
  ROADMAP_NODE_ASSIGNED: 'roadmap_node_assigned',
  ROADMAP_DEADLINE_TOMORROW: 'roadmap_deadline_tomorrow',
  GENERAL: 'general',
};

/** Firestore rules cap these, so truncate rather than have the write rejected. */
const MAX_TITLE = 200;
const MAX_MESSAGE = 500;

/**
 * Write one in-app bell entry.
 *
 * @param {string} uid
 * @param {{ title: string, message: string, type: string, eventLink?: string }} notification
 */
async function writeBellEntry(uid, { title, message, type, eventLink }) {
  if (!uid) return;
  try {
    await db.collection('notifications').doc(uid).collection('items').add({
      title: String(title).slice(0, MAX_TITLE),
      message: String(message).slice(0, MAX_MESSAGE),
      type: type || NOTIF_TYPES.GENERAL,
      read: false,
      senderUid: 'system', // legal: the Admin SDK bypasses rules
      ...(eventLink ? { eventLink } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error(`[notify] bell write failed for ${uid}:`, err);
  }
}

/**
 * Tell a set of users something, on the bell and by push at the same time.
 *
 * Failures are logged, never thrown: a notification must not be able to fail the
 * Firestore write that triggered it.
 *
 * @param {string[]} uids
 * @param {object} args
 * @param {string} args.title    Bell + push title
 * @param {string} args.body     Bell message and push body
 * @param {string} args.type     One of NOTIF_TYPES
 * @param {object} [args.data]   Extra push payload (string values only)
 * @param {string} [args.label]  Log label
 */
async function notifyUsers(uids, { title, body, type, data = {}, label }) {
  const recipients = [...new Set((uids || []).filter(Boolean))];
  if (recipients.length === 0) return;

  try {
    await Promise.all(recipients.map((uid) => writeBellEntry(uid, {
      title, message: body, type,
    })));

    const tokens = await getTokenOwners(recipients);
    await sendPush(
      tokens,
      { title, body },
      { ...data, type: type || NOTIF_TYPES.GENERAL },
      label || `notify ${type}`,
    );
  } catch (err) {
    logger.error(`[notify] notifyUsers failed (${type}):`, err);
  }
}

module.exports = {
  NOTIF_TYPES,
  writeBellEntry,
  notifyUsers,
};
