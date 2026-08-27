/**
 * calendar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Calendar sync, entirely server-side.
 *
 * Everything the app notifies people about and shows on its own Calendar page
 * lands in each person's Google Calendar too, so somebody who never opens the
 * web app still knows their whole workload:
 *
 *   tasks           assignees *and* work partners     onTaskCreate/Update/Delete
 *   roadmap nodes   milestone assignees               onRoadmapNodeCalendar
 *   leaves          the applicant, once approved      onLeaveCalendar
 *   announcements   the whole team                    onAnnouncementCreate/Delete
 *
 * WHY THIS IS NOT DONE IN THE BROWSER
 * ------------------------------------
 * The obvious implementation — `googleProvider.addScope('.../auth/calendar')`
 * plus a fetch from the client — was tried and reverted, because it breaks
 * login for the whole team. That provider is the one `signInWithPopup()` uses,
 * so the Calendar scope becomes part of the *sign-in* request; Calendar is a
 * sensitive scope, and an OAuth app that Google has not verified is interrupted
 * with a full-page "Google hasn't verified this app" / "Access blocked" warning
 * before the user can even get in. It also cannot do what the feature needs: a
 * browser token can only write to the calendar of whoever is signed in, so an
 * admin assigning work to somebody else put the event in the admin's own
 * calendar.
 *
 * This module uses **domain-wide delegation** instead. A service account is
 * authorised once, org-wide, by the Workspace super admin in
 * admin.google.com → Security → API controls → Domain wide delegation, and then
 * impersonates each employee (`subject: 'someone@airbuddy.in'`) to write into
 * their own primary calendar. No consent screen, no popup, no scope on the
 * login provider — employees never see or click anything. It also works while
 * their browser is closed, exactly like the FCM push in fcm.js.
 *
 * NEVER re-add a Calendar scope to the client's GoogleAuthProvider. See the
 * comment in src/services/firebase.js.
 *
 * Credential: the service-account JSON lives in the `CALENDAR_SA_KEY` secret
 *   npx firebase-tools functions:secrets:set CALENDAR_SA_KEY
 * and is passed in by the caller (`defineSecret(...).value()`), so this module
 * stays a plain function library that unit tests can drive.
 *
 * Every failure here is caught and logged. Calendar sync must never fail a write
 * or block the push notification that goes out alongside it.
 */

'use strict';

const { JWT } = require('google-auth-library');
const logger = require('firebase-functions/logger');

const { db, FieldValue } = require('./adminApp');
const { APP_URL } = require('./fcm');
const {
  WORKSPACE_DOMAIN,
  NODE_SYNCED_FIELDS,
  LEAVE_SYNCED_FIELDS,
  isSyncableEmail,
  normalizeAssignees,
  taskRecipients,
  buildEvent,
  buildNodeEvent,
  buildLeaveEvent,
  buildAnnouncementEvent,
  fieldsChanged,
  syncedFieldsChanged,
  isNodeCalendarEligible,
  isLeaveCalendarEligible,
} = require('./calendarEvent');

/**
 * Least privilege: `calendar.events` can create/update/delete events on a
 * calendar but cannot create or delete calendars themselves. This exact string
 * must be the one authorised in the Admin console, character for character.
 */
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/** Events go into each employee's own default calendar. */
const TARGET_CALENDAR = 'primary';

/**
 * Where every collection keeps its `{ uid: eventId }` map. One field name for
 * all of them, so the shared plumbing below does not need to know which
 * collection it is working on.
 */
const EVENT_IDS_FIELD = 'calendarEventIds';

/**
 * JWT clients cached per impersonated user for the life of the container.
 * Each instance caches its own access token, so reusing them avoids a token
 * exchange on every single event.
 */
const clientCache = new Map();

// ─── Credential ──────────────────────────────────────────────────────────────

/**
 * Parse the service-account JSON from the secret.
 *
 * @param {string} raw
 * @returns {{ client_email: string, private_key: string } | null} null if the
 *   secret is missing or malformed — the caller then skips sync, so a
 *   half-finished setup degrades to "no calendar events" rather than throwing
 *   on every write.
 */
function parseServiceAccount(raw) {
  if (!raw || typeof raw !== 'string') {
    logger.warn('[calendar] CALENDAR_SA_KEY is empty — calendar sync is off');
    return null;
  }
  try {
    const key = JSON.parse(raw);
    if (!key.client_email || !key.private_key) {
      logger.error('[calendar] CALENDAR_SA_KEY has no client_email/private_key');
      return null;
    }
    return key;
  } catch (err) {
    logger.error('[calendar] CALENDAR_SA_KEY is not valid JSON:', err.message);
    return null;
  }
}

/**
 * Resolve uids to the Workspace addresses that can be impersonated.
 *
 * @param {string[]} uids
 * @returns {Promise<Map<string, string>>} uid -> email, syncable ones only
 */
async function getSyncableEmails(uids) {
  const emails = new Map();
  const unique = [...new Set((uids || []).filter(Boolean))];

  await Promise.all(unique.map(async (uid) => {
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) return;
      const email = (snap.data() || {}).email;
      if (isSyncableEmail(email)) emails.set(uid, email.trim().toLowerCase());
      else logger.info(`[calendar] ${uid} is not an @${WORKSPACE_DOMAIN} account — skipping`);
    } catch (err) {
      logger.error(`[calendar] could not read users/${uid}:`, err);
    }
  }));

  return emails;
}

/**
 * Every Workspace address in the users collection — the announcement fan-out,
 * mirroring getAllTokenOwners() in fcm.js.
 *
 * @returns {Promise<Map<string, string>>} uid -> email
 */
async function getAllSyncableEmails() {
  const emails = new Map();
  const snap = await db.collection('users').get();

  snap.forEach((doc) => {
    const email = (doc.data() || {}).email;
    if (isSyncableEmail(email)) emails.set(doc.id, email.trim().toLowerCase());
  });

  return emails;
}

// ─── API plumbing ────────────────────────────────────────────────────────────

/**
 * One authenticated Calendar API call, impersonating `userEmail`.
 *
 * Returns a result object rather than throwing: a single employee's calendar
 * failing must not abort the loop over the other recipients.
 *
 * @returns {Promise<{ ok: boolean, data?: object, status?: number, detail?: string }>}
 */
async function calendarRequest(key, userEmail, path, method, body) {
  const cacheKey = `${key.client_email}|${userEmail}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: [CALENDAR_SCOPE],
      subject: userEmail, // <- domain-wide delegation impersonation
    });
    clientCache.set(cacheKey, client);
  }

  try {
    const res = await client.request({
      url: `${CALENDAR_API}${path}`,
      method,
      ...(body ? { data: body } : {}),
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.error?.message
      || err?.response?.data?.error_description
      || err.message;

    // The one failure worth calling out precisely, because it is a setup step
    // and not a bug: the service account has not been authorised for this scope.
    if (/unauthorized_client|not authorized/i.test(String(detail))) {
      logger.error(
        `[calendar] delegation not authorised for ${userEmail}. In admin.google.com → `
        + 'Security → Access and data control → API controls → Domain wide delegation, '
        + `add client id ${key.client_email} with scope ${CALENDAR_SCOPE}`,
      );
    }
    // Reusing a client whose token exchange failed will keep failing.
    clientCache.delete(cacheKey);
    return { ok: false, status, detail };
  }
}

const eventsPath = (suffix = '') =>
  `/calendars/${encodeURIComponent(TARGET_CALENDAR)}/events${suffix}`;

/** 404 and 410 both mean "that event is not there any more". */
const isGone = (status) => status === 404 || status === 410;

// ─── The one reconciliation routine every entity type shares ─────────────────

/**
 * Make each recipient's calendar match `event`, and each ex-recipient's not.
 *
 * This is the whole engine: create for whoever has no event yet (which also
 * heals a record whose earlier create failed, or one that predates this
 * feature), patch for whoever does when a visible field moved, delete for
 * anyone dropped from the record, and recreate when the person deleted the event
 * by hand so a stored id never dangles.
 *
 * @param {object}   args
 * @param {object}   args.key         Parsed service account
 * @param {string}   args.label       Log label, e.g. `task abc123`
 * @param {Map<string,string>} args.emails  uid -> email, recipients + removed
 * @param {string[]} args.recipients  uids that should have an event
 * @param {string[]} args.removed     uids that should not have one any more
 * @param {object}   args.existing    Stored `{ uid: eventId }`
 * @param {object|null} args.event    Event body; null means delete-only
 * @param {boolean}  args.patch       Whether existing events need updating
 * @returns {Promise<object>} dotted-path Firestore updates for the id map
 */
async function reconcile({ key, label, emails, recipients, removed, existing, event, patch }) {
  const updates = {};
  const field = EVENT_IDS_FIELD;

  await Promise.all([
    ...recipients.map(async (uid) => {
      const email = emails.get(uid);
      if (!email) return;
      const eventId = existing[uid];

      if (!eventId) {
        if (!event) return;
        const res = await calendarRequest(key, email, eventsPath(), 'POST', event);
        if (res.ok && res.data?.id) updates[`${field}.${uid}`] = res.data.id;
        else logger.error(`[calendar] create failed for ${email} (${label}):`, res.detail);
        return;
      }

      if (!patch || !event) return;

      const res = await calendarRequest(
        key, email, eventsPath(`/${encodeURIComponent(eventId)}`), 'PATCH', event,
      );
      if (res.ok) return;

      if (isGone(res.status)) {
        // The person deleted the event themselves — put it back rather than
        // leaving the stored id pointing at nothing.
        const recreated = await calendarRequest(key, email, eventsPath(), 'POST', event);
        updates[`${field}.${uid}`] = (recreated.ok && recreated.data?.id)
          ? recreated.data.id
          : FieldValue.delete();
        return;
      }
      logger.error(`[calendar] patch failed for ${email} (${label}):`, res.detail);
    }),

    ...removed.map(async (uid) => {
      const email = emails.get(uid);
      const eventId = existing[uid];
      if (!eventId) return;
      if (email) {
        const res = await calendarRequest(
          key, email, eventsPath(`/${encodeURIComponent(eventId)}`), 'DELETE',
        );
        if (!res.ok && !isGone(res.status)) {
          logger.error(`[calendar] delete failed for ${email} (${label}):`, res.detail);
        }
      }
      updates[`${field}.${uid}`] = FieldValue.delete();
    }),
  ]);

  return updates;
}

/** Read the stored id map off a document, defensively. */
function storedIds(data) {
  const ids = (data || {})[EVENT_IDS_FIELD];
  return (ids && typeof ids === 'object') ? ids : {};
}

/** Apply the id-map updates, if there are any. */
async function writeBack(collection, docId, updates) {
  if (Object.keys(updates).length === 0) return;
  try {
    await db.collection(collection).doc(docId).update(updates);
  } catch (err) {
    // A document deleted between the API call and the write-back is normal.
    logger.warn(`[calendar] write-back skipped for ${collection}/${docId}:`, err.message);
  }
}

/**
 * Delete every event a document had, without a write-back. Used by the delete
 * paths, where the document is already gone.
 */
async function removeAllEvents(rawKey, label, data) {
  const key = parseServiceAccount(rawKey);
  if (!key) return;

  const existing = storedIds(data);
  const uids = Object.keys(existing);
  if (uids.length === 0) return;

  const emails = await getSyncableEmails(uids);
  await reconcile({
    key, label, emails, recipients: [], removed: uids, existing, event: null, patch: false,
  });
  logger.info(`[calendar] removed events for deleted ${label}`);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

/**
 * Create the event for every assignee and work partner of a new task.
 *
 * The resulting ids are stored on the task as `calendarEventIds: { uid: eventId }`
 * with the Admin SDK, which bypasses security rules — so no rules change is
 * needed for a field employees never write themselves.
 *
 * @param {string} rawKey  CALENDAR_SA_KEY value
 * @param {string} taskId
 * @param {object} task
 */
async function syncTaskCreated(rawKey, taskId, task) {
  try {
    const key = parseServiceAccount(rawKey);
    if (!key) return;

    const recipients = taskRecipients(task);
    if (recipients.length === 0) return;

    const emails = await getSyncableEmails(recipients);
    if (emails.size === 0) return;

    const updates = await reconcile({
      key,
      label: `task ${taskId}`,
      emails,
      recipients,
      removed: [],
      existing: {},
      event: buildEvent(task, taskId, APP_URL.value()),
      patch: false,
    });

    await writeBack('tasks', taskId, updates);
    if (Object.keys(updates).length > 0) {
      logger.info(`[calendar] created ${Object.keys(updates).length} event(s) for task ${taskId}`);
    }
  } catch (err) {
    logger.error(`[calendar] syncTaskCreated threw for ${taskId}:`, err);
  }
}

/**
 * Bring each recipient's event back in line with the task — a retitle or
 * reschedule patches every event, a new assignee or work partner gets one, and
 * anyone removed from the task loses theirs.
 *
 * @param {string} rawKey
 * @param {string} taskId
 * @param {object} before
 * @param {object} after
 */
async function syncTaskUpdated(rawKey, taskId, before, after) {
  try {
    const key = parseServiceAccount(rawKey);
    if (!key) return;

    const beforeRecipients = taskRecipients(before);
    const afterRecipients = taskRecipients(after);
    const removed = beforeRecipients.filter((uid) => !afterRecipients.includes(uid));
    const added = afterRecipients.filter((uid) => !beforeRecipients.includes(uid));
    const patch = syncedFieldsChanged(before, after);

    // Nothing the calendar cares about — in particular this is the guard that
    // stops the `calendarEventIds` write-back from looping back through here.
    if (!patch && removed.length === 0 && added.length === 0) return;

    const emails = await getSyncableEmails([...afterRecipients, ...removed]);
    const updates = await reconcile({
      key,
      label: `task ${taskId}`,
      emails,
      recipients: afterRecipients,
      removed,
      existing: storedIds(after),
      event: buildEvent(after, taskId, APP_URL.value()),
      patch,
    });

    await writeBack('tasks', taskId, updates);
  } catch (err) {
    logger.error(`[calendar] syncTaskUpdated threw for ${taskId}:`, err);
  }
}

/**
 * Remove the task's event from every calendar it was written to.
 *
 * @param {string} rawKey
 * @param {string} taskId
 * @param {object} task  The deleted document's data
 */
async function syncTaskDeleted(rawKey, taskId, task) {
  try {
    await removeAllEvents(rawKey, `task ${taskId}`, task);
  } catch (err) {
    logger.error(`[calendar] syncTaskDeleted threw for ${taskId}:`, err);
  }
}

// ─── Roadmap milestone nodes ─────────────────────────────────────────────────

/**
 * Keep milestone events in step with a roadmap node — create, update and delete
 * alike, since the trigger is an onDocumentWritten like the other roadmap ones.
 *
 * A node that stops being eligible (archived, dueDate cleared, last assignee
 * removed) has its events deleted, which is why ineligibility is handled as
 * "everyone is a removed recipient" rather than as an early return.
 *
 * Mind the write volume here: the Phase 8 rollup rewrites `progress` on every
 * task tick anywhere below the node, and this trigger fires on each of those.
 * `NODE_SYNCED_FIELDS` deliberately excludes `progress`, so those writes cost
 * nothing but the trigger invocation.
 *
 * @param {string} rawKey
 * @param {string} nodeId
 * @param {object|null} before  null when the node was just created
 * @param {object|null} after   null when the node was deleted
 */
async function syncRoadmapNodeWritten(rawKey, nodeId, before, after) {
  try {
    if (!after) {
      await removeAllEvents(rawKey, `roadmap node ${nodeId}`, before || {});
      return;
    }

    const key = parseServiceAccount(rawKey);
    if (!key) return;

    const eligible = isNodeCalendarEligible(after);
    const wasEligible = isNodeCalendarEligible(before);

    const beforeRecipients = wasEligible ? normalizeAssignees(before.assignedTo) : [];
    const afterRecipients = eligible ? normalizeAssignees(after.assignedTo) : [];
    const removed = beforeRecipients.filter((uid) => !afterRecipients.includes(uid));
    const added = afterRecipients.filter((uid) => !beforeRecipients.includes(uid));
    const patch = eligible && wasEligible && fieldsChanged(before, after, NODE_SYNCED_FIELDS);

    // A node that just became ineligible still has stored ids to clean up.
    const existing = storedIds(after);
    const orphaned = eligible ? [] : Object.keys(existing);
    const toRemove = [...new Set([...removed, ...orphaned])];

    if (!patch && toRemove.length === 0 && added.length === 0) return;

    const emails = await getSyncableEmails([...afterRecipients, ...toRemove]);
    const updates = await reconcile({
      key,
      label: `roadmap node ${nodeId}`,
      emails,
      recipients: afterRecipients,
      removed: toRemove,
      existing,
      event: eligible ? buildNodeEvent(after, nodeId, APP_URL.value()) : null,
      patch,
    });

    await writeBack('roadmapNodes', nodeId, updates);
  } catch (err) {
    logger.error(`[calendar] syncRoadmapNodeWritten threw for ${nodeId}:`, err);
  }
}

// ─── Leaves ──────────────────────────────────────────────────────────────────

/**
 * Put an approved leave on the applicant's calendar, and take it off again if
 * the approval is withdrawn or the request is deleted.
 *
 * Only the applicant gets an event. Admins can see every leave on the app's own
 * Calendar page, but mirroring the whole team's time off into an admin's
 * personal calendar would bury their own days.
 *
 * @param {string} rawKey
 * @param {string} leaveId
 * @param {object|null} before
 * @param {object|null} after
 */
async function syncLeaveWritten(rawKey, leaveId, before, after) {
  try {
    if (!after) {
      await removeAllEvents(rawKey, `leave ${leaveId}`, before || {});
      return;
    }

    const key = parseServiceAccount(rawKey);
    if (!key) return;

    const eligible = isLeaveCalendarEligible(after);
    const wasEligible = isLeaveCalendarEligible(before);
    const existing = storedIds(after);

    const recipients = eligible && after.uid ? [after.uid] : [];
    const removed = Object.keys(existing).filter((uid) => !recipients.includes(uid));
    const added = recipients.filter((uid) => !existing[uid]);
    const patch = eligible && wasEligible && fieldsChanged(before, after, LEAVE_SYNCED_FIELDS);

    if (!patch && removed.length === 0 && added.length === 0) return;

    const emails = await getSyncableEmails([...recipients, ...removed]);
    const updates = await reconcile({
      key,
      label: `leave ${leaveId}`,
      emails,
      recipients,
      removed,
      existing,
      event: eligible ? buildLeaveEvent(after, leaveId, APP_URL.value()) : null,
      patch,
    });

    await writeBack('leaves', leaveId, updates);
    if (added.length > 0) logger.info(`[calendar] leave ${leaveId} added to the applicant's calendar`);
  } catch (err) {
    logger.error(`[calendar] syncLeaveWritten threw for ${leaveId}:`, err);
  }
}

// ─── Announcements ───────────────────────────────────────────────────────────

/**
 * Put an announcement on everybody's calendar as an all-day entry on the day it
 * was posted, so a team member who never opens the app still finds it. The event
 * is transparent, so it does not mark anyone busy.
 *
 * @param {string} rawKey
 * @param {string} announcementId
 * @param {object} announcement
 */
async function syncAnnouncementCreated(rawKey, announcementId, announcement) {
  try {
    const key = parseServiceAccount(rawKey);
    if (!key) return;

    const emails = await getAllSyncableEmails();
    if (emails.size === 0) return;

    const updates = await reconcile({
      key,
      label: `announcement ${announcementId}`,
      emails,
      recipients: [...emails.keys()],
      removed: [],
      existing: {},
      event: buildAnnouncementEvent(announcement, announcementId, APP_URL.value()),
      patch: false,
    });

    await writeBack('announcements', announcementId, updates);
    logger.info(
      `[calendar] announcement ${announcementId} added to ${Object.keys(updates).length} calendar(s)`,
    );
  } catch (err) {
    logger.error(`[calendar] syncAnnouncementCreated threw for ${announcementId}:`, err);
  }
}

/**
 * @param {string} rawKey
 * @param {string} announcementId
 * @param {object} announcement  The deleted document's data
 */
async function syncAnnouncementDeleted(rawKey, announcementId, announcement) {
  try {
    await removeAllEvents(rawKey, `announcement ${announcementId}`, announcement);
  } catch (err) {
    logger.error(`[calendar] syncAnnouncementDeleted threw for ${announcementId}:`, err);
  }
}

module.exports = {
  CALENDAR_SCOPE,
  parseServiceAccount,
  syncTaskCreated,
  syncTaskUpdated,
  syncTaskDeleted,
  syncRoadmapNodeWritten,
  syncLeaveWritten,
  syncAnnouncementCreated,
  syncAnnouncementDeleted,
};
