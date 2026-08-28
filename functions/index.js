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
 *   onTaskCreate            tasks/{taskId}                       onCreate  → push to assignees +
 *                                                                  a Calendar event per assignee
 *   onTaskUpdate            tasks/{taskId}                       onUpdate  → push on status change,
 *                                                                  Calendar events kept in sync
 *   onTaskDelete            tasks/{taskId}                       onDelete  → remove Calendar events
 *   onAnnouncementCreate    announcements/{id}                   onCreate  → push to everyone +
 *                                                                  Calendar entry for the whole team
 *   onAnnouncementDelete    announcements/{id}                   onDelete  → remove those entries
 *   onRoadmapNodeCalendar   roadmapNodes/{n}                     onWrite   → milestone Calendar events
 *   onLeaveCalendar         leaves/{leaveId}                     onWrite   → approved leave on the
 *                                                                  applicant's Calendar
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
const {
  onDocumentCreated, onDocumentUpdated, onDocumentDeleted, onDocumentWritten,
} = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const { db } = require('./adminApp');
const { getAllTokenOwners, sendPush } = require('./fcm');
const { istDayOffsetUtcMidnight } = require('./time');
const calendar = require('./calendar');
const { notifyUsers, NOTIF_TYPES } = require('./notify');

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

// Service-account JSON for Google Calendar sync (domain-wide delegation).
// Set it once with:  npx firebase-tools functions:secrets:set CALENDAR_SA_KEY
// Deliberately server-side only — see the header of calendar.js for why the
// Calendar scope must never go back onto the client's GoogleAuthProvider.
const CALENDAR_SA_KEY = defineSecret('CALENDAR_SA_KEY');

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

exports.onTaskCreate = onDocumentCreated(
  { document: 'tasks/{taskId}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const task = snap.data() || {};

    // Calendar sync runs first, before any early return: a self-created
    // personal task has nobody to notify (the creator is the only assignee)
    // but still belongs on that person's calendar.
    await calendar.syncTaskCreated(CALENDAR_SA_KEY.value(), event.params.taskId, task);

    const audience = [
      ...(Array.isArray(task.assignedTo) ? task.assignedTo : []),
      ...(Array.isArray(task.workPartnerUids) ? task.workPartnerUids : []),
    ];
    if (audience.length === 0) return;

    // Don't notify the person who created the task about their own creation.
    const recipients = [...new Set(audience)].filter((uid) => uid !== task.createdBy);
    if (recipients.length === 0) return;

    await notifyUsers(recipients, {
      title: 'New Task Assigned',
      body: `You have been assigned to: ${task.title || 'a task'}`
        + ' — it is on your Google Calendar too.',
      type: NOTIF_TYPES.TASK_ASSIGNED,
      data: { taskId: event.params.taskId },
      label: `new task: ${task.title}`,
    });
  },
);

exports.onTaskUpdate = onDocumentUpdated(
  { document: 'tasks/{taskId}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    if (!event.data) return;

    const before = event.data.before.data() || {};
    const after  = event.data.after.data()  || {};

    // Calendar first, and before the status guard below: a retitled or
    // rescheduled task must move on the calendar even though it sends no push.
    // syncTaskUpdated has its own guard, so its `calendarEventIds` write-back
    // does not loop back through this trigger.
    await calendar.syncTaskUpdated(CALENDAR_SA_KEY.value(), event.params.taskId, before, after);

    // Two things are worth telling people about: the status moved, or the
    // deadline did. Progress ticks and checklist edits are not — those would be
    // spam. A reschedule used to be silent, which is the worst of the three to
    // miss, since the work is now due on a different day.
    const statusChanged = before.status !== after.status;
    const dueBefore = before.dueDate?.toDate ? before.dueDate.toDate().getTime() : null;
    const dueAfter  = after.dueDate?.toDate  ? after.dueDate.toDate().getTime()  : null;
    const rescheduled = dueBefore !== dueAfter;
    if (!statusChanged && !rescheduled) return;

    // Work partners are told as well — they see the task in the app, so a
    // status change or a new deadline concerns them too.
    const audience = [
      ...(Array.isArray(after.assignedTo) ? after.assignedTo : []),
      ...(Array.isArray(after.workPartnerUids) ? after.workPartnerUids : []),
    ];
    if (audience.length === 0) return;

    // Roadmap mirror documents carry updatedBy; skip notifying whoever just
    // made the change. Plain tasks have no such field, so everyone gets it.
    const recipients = after.updatedBy
      ? audience.filter((uid) => uid !== after.updatedBy)
      : audience;
    if (recipients.length === 0) return;

    const title = after.title || 'Untitled';
    const completed = after.status === 'completed';

    if (statusChanged) {
      await notifyUsers(recipients, {
        title: completed ? 'Task Completed' : 'Task Status Updated',
        body: `Task "${title}" is now ${after.status}`,
        type: completed ? NOTIF_TYPES.TASK_COMPLETED : NOTIF_TYPES.TASK_UPDATED,
        data: { taskId: event.params.taskId },
        label: `status change: ${title}`,
      });
    }

    if (rescheduled) {
      const when = dueAfter
        ? new Date(dueAfter).toLocaleDateString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
        })
        : 'no date';
      await notifyUsers(recipients, {
        title: 'Task Rescheduled',
        body: `"${title}" is now due ${when}. Your calendar has been updated.`,
        type: NOTIF_TYPES.TASK_RESCHEDULED,
        data: { taskId: event.params.taskId },
        label: `reschedule: ${title}`,
      });
    }
  },
);

// Deleting a task must take its calendar events with it, otherwise employees
// keep reminders for work that no longer exists.
exports.onTaskDelete = onDocumentDeleted(
  { document: 'tasks/{taskId}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await calendar.syncTaskDeleted(CALENDAR_SA_KEY.value(), event.params.taskId, snap.data() || {});
  },
);

exports.onAnnouncementCreate = onDocumentCreated(
  { document: 'announcements/{id}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
  const snap = event.data;
  if (!snap) return;

  const announcement = snap.data() || {};

  // An announcement has no date of its own, so it lands as an all-day entry on
  // the day it was posted. That is the point: somebody who never opens the app,
  // or who missed the push, still finds it in their calendar.
  await calendar.syncAnnouncementCreated(CALENDAR_SA_KEY.value(), event.params.id, announcement);

  const tokens = await getAllTokenOwners();

  await sendPush(
    tokens,
    { title: 'New Announcement', body: announcement.title || 'Tap to view the new announcement' },
    { announcementId: event.params.id, type: 'announcement' },
    `announcement: ${announcement.title}`,
  );

  // The bell entry is written client-side by announcementService for the poster's
  // own session; push covers everybody else's devices, and the calendar entry
  // above pops immediately. Nothing about a new announcement is silent.
  },
);

// A deleted announcement must not leave a stale entry on 15 calendars.
exports.onAnnouncementDelete = onDocumentDeleted(
  { document: 'announcements/{id}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await calendar.syncAnnouncementDeleted(
      CALENDAR_SA_KEY.value(), event.params.id, snap.data() || {},
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Calendar sync for the two dated things that are not tasks
//
// The web app's Calendar page draws three sources — tasks, leaves and roadmap
// milestones. Tasks are handled by the triggers above; these two cover the rest,
// so a team member who never opens the app still has their whole schedule in
// Google Calendar.
//
// Both are onDocumentWritten rather than separate create/update/delete triggers,
// because eligibility here is a *state*, not an event: a leave becomes calendar
// -worthy when it is approved and stops being so if that is undone, and a node
// stops being worthy when it is archived or loses its last assignee. One
// reconciling handler per write is simpler than three that have to agree.
// ─────────────────────────────────────────────────────────────────────────────

// Deliberately separate from onRoadmapNodeProgressChange and
// onRoadmapNodeHistory rather than folded into them: those two are load-bearing
// for the progress rollup and the audit trail, and a Calendar API call has no
// business being able to slow down or throw inside either.
exports.onRoadmapNodeCalendar = onDocumentWritten(
  { document: 'roadmapNodes/{nodeId}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? (change.before.data() || {}) : null;
    const after  = change.after.exists  ? (change.after.data()  || {}) : null;
    await calendar.syncRoadmapNodeWritten(
      CALENDAR_SA_KEY.value(), event.params.nodeId, before, after,
    );

    // Being put on a milestone sent nothing at all before this: RoadmapNodeModal
    // only notifies on completion. Diff-aware, so editing an unrelated field
    // does not re-notify the people who were already on it.
    if (!after || after.isArchived) return;
    const wasAssigned = Array.isArray(before?.assignedTo) ? before.assignedTo : [];
    const nowAssigned = Array.isArray(after.assignedTo) ? after.assignedTo : [];
    const added = nowAssigned.filter((uid) => uid && !wasAssigned.includes(uid));
    const recipients = added.filter((uid) => uid !== after.updatedBy && uid !== after.createdBy);
    if (recipients.length === 0) return;

    await notifyUsers(recipients, {
      title: 'Milestone Assigned',
      body: `You are now on the milestone "${after.title || 'Untitled'}"`
        + (after.dueDate ? ' — the deadline is on your Google Calendar.' : '.'),
      type: NOTIF_TYPES.ROADMAP_NODE_ASSIGNED,
      data: { nodeId: event.params.nodeId },
      label: `milestone assigned: ${after.title}`,
    });
  },
);

exports.onLeaveCalendar = onDocumentWritten(
  { document: 'leaves/{leaveId}', secrets: [CALENDAR_SA_KEY] },
  async (event) => {
    const change = event.data;
    if (!change) return;
    const before = change.before.exists ? (change.before.data() || {}) : null;
    const after  = change.after.exists  ? (change.after.data()  || {}) : null;

    await calendar.syncLeaveWritten(
      CALENDAR_SA_KEY.value(), event.params.leaveId, before, after,
    );

    // An approval or rejection used to be entirely silent: the admin actioned
    // the request in LeaveManagement and the applicant found out only by opening
    // the page again. This is the notification that was missing.
    if (!after || !after.uid) return;
    const statusBefore = before ? before.status : null;
    if (statusBefore === after.status) return;
    if (after.status !== 'approved' && after.status !== 'rejected') return;

    const approved = after.status === 'approved';
    const type = after.type ? `${after.type} leave` : 'leave';
    await notifyUsers([after.uid], {
      title: approved ? 'Leave Approved' : 'Leave Rejected',
      body: approved
        ? `Your ${type} from ${after.startDate} to ${after.endDate} was approved`
          + ' — the days are blocked on your Google Calendar.'
        : `Your ${type} from ${after.startDate} to ${after.endDate} was not approved.`,
      type: NOTIF_TYPES.LEAVE_STATUS,
      data: { leaveId: event.params.leaveId },
      label: `leave ${after.status}`,
    });
  },
);

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

      // Bell + push together. The bell entry matters because it is the only
      // channel that still lands for somebody who denied browser notification
      // permission; the Google Calendar reminder for the same task fires at
      // 09:00 as well, so a due date now reaches people three ways.
      await notifyUsers([uid], {
        title,
        body,
        type: NOTIF_TYPES.GENERAL,
        data: { taskId: tasks[0].id },
        label: `due reminder ${uid}`,
      });
    }));

    logger.info(`[onDueDateApproach] notified ${tasksByUser.size} user(s)`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Calendar backfill / self-healing reconcile
//
// The task, node and leave triggers only fire on *writes*. Anything created
// before calendar sync was deployed therefore has no event and never would —
// which is exactly what happened on day one: the whole backlog was invisible in
// everybody's Google Calendar while new tasks synced fine.
//
// backfillAll() walks the current state and creates only what is missing. It is
// idempotent (a record that already has an event id costs no API call), so it is
// safe to run on a schedule as well as on demand. Running daily also heals a
// failed API call, a lost roadmap mirror write, and an event somebody deleted by
// hand.
// ─────────────────────────────────────────────────────────────────────────────

exports.dailyCalendarReconcile = onSchedule(
  {
    schedule: '30 7 * * *',      // 07:30 IST — before the 09:00 reminder wave
    timeZone: 'Asia/Kolkata',
    region: 'asia-south1',       // Cloud Scheduler has no asia-south2 presence
    secrets: [CALENDAR_SA_KEY],
    timeoutSeconds: 540,
  },
  async () => {
    const result = await calendar.backfillAll(CALENDAR_SA_KEY.value());
    logger.info('[dailyCalendarReconcile] done', result);
  },
);

// Same thing on demand, from the Admin Panel button. Admin-only: the callable
// runs with the Admin SDK, which bypasses security rules, so the role has to be
// checked here explicitly.
exports.syncAllCalendars = onCall({ secrets: [CALENDAR_SA_KEY], timeoutSeconds: 540 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to run a calendar sync.');
  }

  const uid = request.auth.uid;
  let role = null;
  try {
    const snap = await db.collection('users').doc(uid).get();
    role = snap.exists ? (snap.data() || {}).role : null;
  } catch (err) {
    logger.error('[syncAllCalendars] could not read the caller profile:', err);
    throw new HttpsError('internal', 'Could not verify your permissions.');
  }

  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only an admin can run a calendar sync.');
  }

  logger.info(`[syncAllCalendars] triggered by ${uid}`);
  const result = await calendar.backfillAll(CALENDAR_SA_KEY.value());
  return result;
});

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
