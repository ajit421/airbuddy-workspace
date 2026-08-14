/**
 * index.js — Cloud Functions entry point
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrated from the firebase-functions v1 API to v2.
 *
 * Why: functions/package.json pins firebase-functions ^7, whose ROOT export is
 * the v2 namespace (`main: lib/v2/index.js`). Under v7 the old v1 entry points
 * (`functions.firestore.document(...)`, `functions.pubsub.schedule(...)`) are
 * `undefined`, so the previous file threw at module load and nothing could
 * deploy. `functions.config()` is also decommissioned — secrets and params are
 * used instead.
 *
 * Exported functions
 *   onTaskCreate            tasks/{taskId}                       onCreate  → push to assignees
 *   onTaskUpdate            tasks/{taskId}                       onUpdate  → push on status change
 *   onAnnouncementCreate    announcements/{id}                   onCreate  → push to everyone
 *   onDueDateApproach       schedule 09:00 Asia/Kolkata          → push + bell for tasks due tomorrow
 *   roadmapDeadlineCheck    schedule 09:15 Asia/Kolkata          → roadmap due/overdue notifications
 *   onRoadmapTaskWrite      roadmapNodes/{n}/tasks/{t}           onWrite   → node progress rollup
 *   onRoadmapNodeProgressChange  roadmapNodes/{n}                onWrite   → ancestor propagation
 *   onRoadmapNodeHistory    roadmapNodes/{n}                     onWrite   → audit history
 *   onRoadmapTaskHistory    roadmapNodes/{n}/tasks/{t}           onWrite   → audit history
 *   askGemini               callable                             → AI assistant (unused by the SPA,
 *                                                                  which calls /api/gemini on Vercel)
 */

'use strict';

const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const { db, FieldValue } = require('./adminApp');
const { getTokenOwners, getAllTokenOwners, sendPush } = require('./fcm');
const { istDayOffsetUtcMidnight } = require('./time');

// Region MUST match the Firestore database location, which is asia-south2
// (Delhi). Firestore triggers create their Eventarc trigger in the database's
// region regardless of where the function lives, so running the functions in
// asia-south1 produced a cross-region setup: an extra network hop plus egress
// on every document read the rollup and history triggers perform.
//
// maxInstances caps fan-out so a runaway trigger cannot turn into a surprise
// bill on the Blaze plan.
setGlobalOptions({
  region: 'asia-south2',
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 60,
});

// functions.config() was removed in firebase-functions v7 — use a secret.
// Set it once with:  npx firebase-tools functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// ─── Roadmap triggers (Phase 8 rollup + Phase 17 audit history) ──────────────
const roadmapTriggers = require('./roadmapTriggers');
exports.onRoadmapTaskWrite          = roadmapTriggers.onRoadmapTaskWrite;
exports.onRoadmapNodeProgressChange = roadmapTriggers.onRoadmapNodeProgressChange;
exports.onRoadmapNodeHistory        = roadmapTriggers.onRoadmapNodeHistory;
exports.onRoadmapTaskHistory        = roadmapTriggers.onRoadmapTaskHistory;

// ─── Roadmap deadline cron ───────────────────────────────────────────────────
// Was never re-exported here, so it would not have deployed even once the
// plan allowed it.
exports.roadmapDeadlineCheck = require('./roadmapDeadlineCheck').roadmapDeadlineCheck;

// ─────────────────────────────────────────────────────────────────────────────
// Task triggers
// ─────────────────────────────────────────────────────────────────────────────

exports.onTaskCreate = onDocumentCreated('tasks/{taskId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const task = snap.data() || {};
  const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : [];
  if (assignees.length === 0) return;

  // Don't notify the person who created the task about their own creation.
  const recipients = assignees.filter((uid) => uid !== task.createdBy);
  if (recipients.length === 0) return;

  const tokens = await getTokenOwners(recipients);
  await sendPush(
    tokens,
    { title: 'New Task Assigned', body: `You have been assigned to: ${task.title || 'a task'}` },
    { taskId: event.params.taskId, type: 'task_assigned' },
    `new task: ${task.title}`,
  );
});

exports.onTaskUpdate = onDocumentUpdated('tasks/{taskId}', async (event) => {
  if (!event.data) return;

  const before = event.data.before.data() || {};
  const after  = event.data.after.data()  || {};

  // Only notify on a status transition — progress ticks would be spam.
  if (before.status === after.status) return;

  const assignees = Array.isArray(after.assignedTo) ? after.assignedTo : [];
  if (assignees.length === 0) return;

  // Roadmap mirror documents carry updatedBy; skip pushing a status change back
  // to whoever just made it. Plain tasks have no such field, so everyone gets it.
  const recipients = after.updatedBy
    ? assignees.filter((uid) => uid !== after.updatedBy)
    : assignees;
  if (recipients.length === 0) return;

  const tokens = await getTokenOwners(recipients);
  await sendPush(
    tokens,
    { title: 'Task Status Updated', body: `Task "${after.title || 'Untitled'}" is now ${after.status}` },
    { taskId: event.params.taskId, type: 'task_updated' },
    `status change: ${after.title}`,
  );
});

exports.onAnnouncementCreate = onDocumentCreated('announcements/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const announcement = snap.data() || {};
  const tokens = await getAllTokenOwners();

  await sendPush(
    tokens,
    { title: 'New Announcement', body: announcement.title || 'Tap to view the new announcement' },
    { announcementId: event.params.id, type: 'announcement' },
    `announcement: ${announcement.title}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Daily due-date reminder — 09:00 IST
// ─────────────────────────────────────────────────────────────────────────────
//
// Two changes from the v1 version beyond the API migration:
//   1. The query no longer combines a dueDate range with `status != 'completed'`.
//      Firestore needs a composite index and a specific orderBy for two
//      inequality fields; filtering status in memory avoids that entirely for
//      what is a small result set (one day's worth of tasks).
//   2. Day boundaries come from time.js so they track the *Indian* calendar day
//      rather than the container's UTC one.

// region override: Cloud Scheduler has no asia-south2 (Delhi) presence —
// creating the job there fails with "Location 'asia-south2' is not a valid
// location". asia-south1 (Mumbai) is the nearest region that supports it.
// The cross-region Firestore reads this causes are irrelevant here: the query
// runs once a day.
exports.onDueDateApproach = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Kolkata', region: 'asia-south1' },
  async () => {
    const tomorrow = istDayOffsetUtcMidnight(1);
    const dayAfter = istDayOffsetUtcMidnight(2);

    logger.info(`[onDueDateApproach] window ${tomorrow.toISOString()} — ${dayAfter.toISOString()}`);

    const tasksSnap = await db.collection('tasks')
      .where('dueDate', '>=', tomorrow)
      .where('dueDate', '<',  dayAfter)
      .get();

    if (tasksSnap.empty) {
      logger.info('[onDueDateApproach] no tasks due tomorrow');
      return;
    }

    /** @type {Map<string, Array<{id: string, title: string}>>} */
    const tasksByUser = new Map();

    tasksSnap.forEach((doc) => {
      const task = doc.data() || {};
      if (task.status === 'completed') return;
      if (!Array.isArray(task.assignedTo)) return;

      for (const uid of task.assignedTo) {
        if (!uid) continue;
        if (!tasksByUser.has(uid)) tasksByUser.set(uid, []);
        tasksByUser.get(uid).push({ id: doc.id, title: task.title || 'Untitled task' });
      }
    });

    if (tasksByUser.size === 0) {
      logger.info('[onDueDateApproach] all tasks due tomorrow are already completed');
      return;
    }

    await Promise.all([...tasksByUser.entries()].map(async ([uid, tasks]) => {
      const title = 'Task Due Tomorrow';
      const body = tasks.length === 1
        ? `"${tasks[0].title}" is due tomorrow.`
        : `You have ${tasks.length} tasks due tomorrow.`;

      // In-app bell entry, so the reminder still lands for anyone who has
      // denied browser notification permission.
      try {
        await db.collection('notifications').doc(uid).collection('items').add({
          title,
          message: body,
          type: 'general',
          read: false,
          senderUid: 'system',
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        logger.error(`[onDueDateApproach] bell write failed for ${uid}:`, err);
      }

      const tokens = await getTokenOwners([uid]);
      await sendPush(tokens, { title, body }, { type: 'task_due_soon' }, `due reminder ${uid}`);
    }));

    logger.info(`[onDueDateApproach] notified ${tasksByUser.size} user(s)`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Callable: askGemini
// ─────────────────────────────────────────────────────────────────────────────
// The SPA calls POST /api/gemini on Vercel instead of this callable. It is kept
// deployable as a fallback path that does not depend on Vercel.

exports.askGemini = onCall({ secrets: [GEMINI_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to use the AI assistant.');
  }

  const { history, systemPrompt, newMessage } = request.data || {};
  if (!systemPrompt || !newMessage) {
    throw new HttpsError('invalid-argument', 'Missing systemPrompt or newMessage.');
  }

  try {
    // Required lazily: secret values are only populated at runtime.
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });

    const contents = [
      { role: 'user',  parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready to help with your tasks.' }] },
      ...(Array.isArray(history) ? history.slice(-20) : []),
      { role: 'user',  parts: [{ text: newMessage }] },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents,
      config: { temperature: 0.7 },
    });

    return { reply: response.text };
  } catch (error) {
    logger.error('[askGemini] Gemini call failed:', error);
    throw new HttpsError('internal', 'Unable to fetch AI response.');
  }
});
