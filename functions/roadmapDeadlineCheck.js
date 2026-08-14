/**
 * roadmapDeadlineCheck.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled Cloud Function — runs daily at 09:15 Asia/Kolkata.
 *
 * (09:15 rather than 09:00 so it does not contend with onDueDateApproach in
 * index.js, which fires at 09:00 for non-roadmap tasks.)
 *
 * PURPOSE:
 *   1. Scan all roadmap tasks with dueDate = tomorrow → notify assignees
 *      (type: 'roadmap_deadline_tomorrow')
 *   2. Scan all roadmap tasks with dueDate < today AND status ≠ 'completed'
 *      → notify assignees (type: 'roadmap_deadline_missed')
 *
 * Both produce an in-app notification document AND a push notification, so the
 * reminder still lands for users who have denied browser notification
 * permission.
 *
 * SCOPING RULE:
 *   Only notifies employees in the task-level `assignedTo` array.
 *   Does NOT walk the ancestor chain — avoids notification spam for users
 *   assigned only to parent nodes.
 *
 * COST GUARD:
 *   The overdue scan is bounded to OVERDUE_LOOKBACK_DAYS. Without a lower
 *   bound the query re-reads (and re-notifies about) every task that has ever
 *   slipped, every single day — unbounded reads and unbounded nagging.
 *
 * Firestore paths read:
 *   - collectionGroup('tasks'), filtered down to roadmapNodes/*&#47;tasks/* by
 *     isRoadmapTask(). The collection group also matches the root `tasks`
 *     collection (personal/assigned tasks and Phase 23 mirror docs), which are
 *     handled by onDueDateApproach instead.
 *
 * Firestore path written:
 *   - notifications/{uid}/items/{notifId}
 *
 * Required indexes (firestore.indexes.json):
 *   - fieldOverride: tasks.dueDate with COLLECTION_GROUP scope
 *   - composite:     collectionGroup tasks (status ASC, dueDate ASC)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

const { db, FieldValue, Timestamp } = require('./adminApp');
const { getTokenOwners, sendPush } = require('./fcm');
const { istTodayUtcMidnight, istDayOffsetUtcMidnight } = require('./time');

/** How far back the overdue scan looks. */
const OVERDUE_LOOKBACK_DAYS = 30;

// ─── Notification type constants (mirrored from notificationService.js) ──────
const ROADMAP_NOTIF_TYPES = {
  DEADLINE_TOMORROW: 'roadmap_deadline_tomorrow',
  DEADLINE_MISSED:   'roadmap_deadline_missed',
};

// ─── Helper: write a notification document for one user ──────────────────────
async function writeNotification(uid, title, message, type) {
  if (!uid) return;
  try {
    await db.collection('notifications').doc(uid).collection('items').add({
      title,
      message,
      type,
      read:      false,
      senderUid: 'system',      // system event — no human sender
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error(`[roadmapDeadlineCheck] writeNotification failed for ${uid}:`, err);
  }
}

// ─── Helper: fan-out to all assignees except already-notified set ─────────────
// alreadyNotified is keyed by `${uid}:${taskId}` so a user assigned to
// multiple due/overdue tasks in the same run gets notified for each task,
// while still preventing duplicate notifications for the same task+user.
async function notifyAssignees(assignedTo, taskId, title, message, type, alreadyNotified) {
  const pending = (assignedTo ?? []).filter((uid) => uid && !alreadyNotified.has(`${uid}:${taskId}`));
  if (pending.length === 0) return;

  await Promise.all(pending.map((uid) => {
    alreadyNotified.add(`${uid}:${taskId}`);
    return writeNotification(uid, title, message, type);
  }));

  const tokens = await getTokenOwners(pending);
  await sendPush(tokens, { title, body: message }, { type, taskId }, `roadmap ${type}`);
}

// ─── Helper: is this task doc actually under roadmapNodes/*/tasks? ────────────
// db.collectionGroup('tasks') also matches unrelated top-level `tasks` docs
// (personal/assigned tasks, Phase 23 mirror docs) which are not roadmap tasks
// and must not trigger roadmap deadline notifications.
function isRoadmapTask(taskDoc) {
  const parts = taskDoc.ref.path.split('/');
  return parts.length === 4 && parts[0] === 'roadmapNodes' && parts[2] === 'tasks';
}

// ─── Main scheduled function ──────────────────────────────────────────────────
exports.roadmapDeadlineCheck = onSchedule(
  {
    schedule: '15 9 * * *',
    timeZone: 'Asia/Kolkata',
    // region override: Cloud Scheduler has no asia-south2 (Delhi) presence, so
    // the job cannot be created in the same region as the Firestore triggers.
    // asia-south1 (Mumbai) is the nearest region that supports it; the
    // cross-region reads cost nothing meaningful for a once-a-day scan.
    region: 'asia-south1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    // Boundaries follow the *Indian* calendar day. dueDate is written
    // client-side as new Date('YYYY-MM-DD'), i.e. UTC midnight of the picked
    // day, so UTC-midnight boundaries are the correct comparison points.
    const todayMidnight = istTodayUtcMidnight();
    const tomorrow      = istDayOffsetUtcMidnight(1);
    const dayAfter      = istDayOffsetUtcMidnight(2);
    const lookbackStart = istDayOffsetUtcMidnight(-OVERDUE_LOOKBACK_DAYS);

    logger.info(`[roadmapDeadlineCheck] tomorrow window ${tomorrow.toISOString()} — ${dayAfter.toISOString()}`);
    logger.info(`[roadmapDeadlineCheck] overdue window  ${lookbackStart.toISOString()} — ${todayMidnight.toISOString()}`);

    const tasksRef = db.collectionGroup('tasks');

    // ── 1. Deadline tomorrow ────────────────────────────────────────────────
    const tomorrowSnap = await tasksRef
      .where('dueDate', '>=', Timestamp.fromDate(tomorrow))
      .where('dueDate', '<',  Timestamp.fromDate(dayAfter))
      .get();

    const tomorrowNotified = new Set();
    let tomorrowCount = 0;

    for (const taskDoc of tomorrowSnap.docs) {
      if (!isRoadmapTask(taskDoc)) continue;
      const task = taskDoc.data();
      if (!task.assignedTo?.length) continue;
      if (task.status === 'completed') continue;

      const nodeTitle = task.nodeTitle ?? task.nodeId ?? 'a milestone';
      tomorrowCount += 1;

      await notifyAssignees(
        task.assignedTo,
        taskDoc.id,
        `Deadline Tomorrow: ${task.title}`,
        `Your task "${task.title}" under "${nodeTitle}" is due tomorrow. Update your progress on the Roadmap.`,
        ROADMAP_NOTIF_TYPES.DEADLINE_TOMORROW,
        tomorrowNotified,
      );
    }
    logger.info(`[roadmapDeadlineCheck] deadline-tomorrow: ${tomorrowCount} roadmap task(s) of ${tomorrowSnap.size} scanned`);

    // ── 2. Deadline missed (overdue) ────────────────────────────────────────
    const overdueSnap = await tasksRef
      .where('status',  'in', ['pending', 'in-progress'])
      .where('dueDate', '>=', Timestamp.fromDate(lookbackStart))
      .where('dueDate', '<',  Timestamp.fromDate(todayMidnight))
      .get();

    const overdueNotified = new Set();
    let overdueCount = 0;

    for (const taskDoc of overdueSnap.docs) {
      if (!isRoadmapTask(taskDoc)) continue;
      const task = taskDoc.data();
      if (!task.assignedTo?.length) continue;

      const nodeTitle = task.nodeTitle ?? task.nodeId ?? 'a milestone';
      overdueCount += 1;

      await notifyAssignees(
        task.assignedTo,
        taskDoc.id,
        `Overdue: ${task.title}`,
        `Your task "${task.title}" under "${nodeTitle}" is overdue. Please update the Roadmap.`,
        ROADMAP_NOTIF_TYPES.DEADLINE_MISSED,
        overdueNotified,
      );
    }
    logger.info(`[roadmapDeadlineCheck] overdue: ${overdueCount} roadmap task(s) of ${overdueSnap.size} scanned`);
    logger.info('[roadmapDeadlineCheck] Done.');
  },
);
