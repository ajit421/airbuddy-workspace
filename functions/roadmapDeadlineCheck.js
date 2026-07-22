/**
 * roadmapDeadlineCheck.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled Cloud Function — runs every 24 hours at 07:00 UTC.
 *
 * ⚠️  DEPLOYMENT NOTE:
 *   This function requires the Firebase Blaze (pay-as-you-go) plan.
 *   The project is currently on Spark (free tier). This file is committed and
 *   ready to deploy when the project upgrades to Blaze.
 *
 *   To deploy:
 *     firebase deploy --only functions:roadmapDeadlineCheck
 *
 * PURPOSE:
 *   1. Scan all roadmap tasks with dueDate = tomorrow → notify assignees
 *      (type: 'roadmap_deadline_tomorrow')
 *   2. Scan all roadmap tasks with dueDate < today AND status ≠ 'completed'
 *      → notify assignees (type: 'roadmap_deadline_missed')
 *
 * SCOPING RULE:
 *   Only notifies employees in the task-level `assignedTo` array.
 *   Does NOT walk the ancestor chain — avoids notification spam for users
 *   assigned only to parent nodes.
 *
 * Firestore paths read:
 *   - roadmapNodes (collectionGroup tasks subcollection via collectionGroup query)
 *   Fallback: collectionGroup('tasks') where nodeId is denormalized (Phase 7)
 *
 * Firestore path written:
 *   - notifications/{uid}/items/{notifId}
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { onSchedule }       = require('firebase-functions/v2/scheduler');
const { initializeApp }    = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Guard: only initialise if not already done (index.js may call initializeApp first)
try { initializeApp(); } catch (_) { /* already initialised */ }

const db = getFirestore();

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
      createdAt: Timestamp.now(),
    });
  } catch (err) {
    console.error(`[roadmapDeadlineCheck] writeNotification failed for ${uid}:`, err.message);
  }
}

// ─── Helper: fan-out to all assignees except already-notified set ─────────────
async function notifyAssignees(assignedTo, title, message, type, alreadyNotified) {
  const pending = (assignedTo ?? []).filter((uid) => !alreadyNotified.has(uid));
  await Promise.all(pending.map((uid) => {
    alreadyNotified.add(uid);
    return writeNotification(uid, title, message, type);
  }));
}

// ─── Main scheduled function ──────────────────────────────────────────────────
exports.roadmapDeadlineCheck = onSchedule(
  {
    schedule: 'every 24 hours',
    timeZone: 'UTC',
    // Retains a 60-second timeout — deadline checks are fast collectionGroup queries
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async () => {
    const now       = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow  = new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter  = new Date(todayMidnight.getTime() + 48 * 60 * 60 * 1000);

    console.log(`[roadmapDeadlineCheck] Running at ${now.toISOString()}`);
    console.log(`  → Tomorrow window: ${tomorrow.toISOString()} — ${dayAfter.toISOString()}`);
    console.log(`  → Overdue window:  dueDate < ${todayMidnight.toISOString()}`);

    // collectionGroup('tasks') — nodeId is denormalized on every task doc (Phase 7)
    const tasksRef = db.collectionGroup('tasks');

    // ── 1. Deadline tomorrow ────────────────────────────────────────────────
    const tomorrowSnap = await tasksRef
      .where('dueDate', '>=', Timestamp.fromDate(tomorrow))
      .where('dueDate', '<',  Timestamp.fromDate(dayAfter))
      .get();

    const tomorrowNotified = new Set();
    for (const taskDoc of tomorrowSnap.docs) {
      const task = taskDoc.data();
      if (!task.assignedTo?.length) continue;
      if (task.status === 'completed') continue;

      const nodeTitle  = task.nodeTitle ?? task.nodeId ?? 'a milestone';
      const title      = `Deadline Tomorrow: ${task.title}`;
      const message    = `Your task "${task.title}" under "${nodeTitle}" is due tomorrow. Update your progress on the Roadmap.`;

      await notifyAssignees(task.assignedTo, title, message, ROADMAP_NOTIF_TYPES.DEADLINE_TOMORROW, tomorrowNotified);
    }
    console.log(`  ✓ Deadline-tomorrow: processed ${tomorrowSnap.size} tasks`);

    // ── 2. Deadline missed (overdue) ────────────────────────────────────────
    const overdueSnap = await tasksRef
      .where('dueDate', '<', Timestamp.fromDate(todayMidnight))
      .where('status',  'in', ['pending', 'in-progress'])
      .get();

    const overdueNotified = new Set();
    for (const taskDoc of overdueSnap.docs) {
      const task = taskDoc.data();
      if (!task.assignedTo?.length) continue;

      const nodeTitle  = task.nodeTitle ?? task.nodeId ?? 'a milestone';
      const title      = `Overdue: ${task.title}`;
      const message    = `Your task "${task.title}" under "${nodeTitle}" is overdue. Please update the Roadmap.`;

      await notifyAssignees(task.assignedTo, title, message, ROADMAP_NOTIF_TYPES.DEADLINE_MISSED, overdueNotified);
    }
    console.log(`  ✓ Overdue: processed ${overdueSnap.size} tasks`);
    console.log('[roadmapDeadlineCheck] Done.');
  }
);
