/**
 * roadmapTriggers.js — Phase 8 + Phase 17
 * Firestore Cloud Function triggers for roadmap progress rollup (Phase 8)
 * and audit history writes (Phase 17).
 *
 * Migrated to the firebase-functions v2 API (`onDocumentWritten`). The v1
 * entry point `functions.firestore.document(...).onWrite()` does not exist on
 * the firebase-functions v7 root export, so the v1 version of this file threw
 * at module load and blocked the whole codebase from deploying.
 *
 * v2 event shape:
 *   event.params.{nodeId,taskId}
 *   event.data.before / event.data.after   — DocumentSnapshot (may be missing)
 *
 * ─── Phase 8 triggers ───────────────────────────────────────────────────────
 * Trigger 1: onRoadmapTaskWrite
 *   Path: roadmapNodes/{nodeId}/tasks/{taskId}
 *   Fires on: create, update, delete of any task under a roadmap node
 *   Action: recomputes node.progress via transaction (race-safe)
 *
 * Trigger 2: onRoadmapNodeProgressChange
 *   Path: roadmapNodes/{nodeId}
 *   Fires on: any write to a roadmap node
 *   Action: if progress changed, propagates up through all ancestors
 *
 * ─── Phase 17 triggers ──────────────────────────────────────────────────────
 * Trigger 3: onRoadmapNodeHistory
 *   Path: roadmapNodes/{nodeId}
 *   Fires on: create, update, delete of any roadmap node
 *   Action: diffs before/after, writes one history entry to
 *           roadmapNodes/{nodeId}/history/{auto-id}
 *
 * Trigger 4: onRoadmapTaskHistory
 *   Path: roadmapNodes/{nodeId}/tasks/{taskId}
 *   Fires on: create, update, delete of any task
 *   Action: diffs before/after, writes one history entry to
 *           roadmapNodes/{nodeId}/history/{auto-id}
 *           (task changes live in the parent node's history for a unified log)
 *
 * ─── Loop guards ────────────────────────────────────────────────────────────
 * Phase 8: skips writes when rounded progress value hasn't changed.
 * Phase 17: skips history entries when only metadata fields (updatedAt,
 *   updatedBy, path, ancestorIds, depth) changed with no substantive diff.
 *
 * NOTE: the client also runs the same rollup in
 * src/services/roadmapService.js#recomputeNodeRollup() for instant UI feedback.
 * Both paths are idempotent — whichever runs second finds the rounded value
 * unchanged and skips its write.
 */

'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');

const { db, FieldValue } = require('./adminApp');

const {
  recomputeNodeProgress,
  propagateProgressToAncestors,
} = require('./roadmapService.server');

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Trigger 1: onRoadmapTaskWrite
// Fires whenever a task under any roadmap node is created, updated, or deleted.
// Recomputes the parent node's progress using a transaction.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapTaskWrite = onDocumentWritten(
  'roadmapNodes/{nodeId}/tasks/{taskId}',
  async (event) => {
    const { nodeId, taskId } = event.params;

    logger.info(`[onRoadmapTaskWrite] task ${taskId} written under node ${nodeId}`);

    try {
      // recomputeNodeProgress handles the loop guard internally
      // (transaction + rounded-value check).
      const result = await recomputeNodeProgress(nodeId, db, FieldValue);
      if (result.wrote) {
        logger.info(`[onRoadmapTaskWrite] node ${nodeId} progress -> ${result.newProgress}`);
      } else {
        logger.info(`[onRoadmapTaskWrite] node ${nodeId} progress unchanged (${result.newProgress}) — no write`);
      }
    } catch (err) {
      logger.error(`[onRoadmapTaskWrite] ERROR for node ${nodeId}:`, err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Trigger 2: onRoadmapNodeProgressChange
// Fires on any write to a roadmap node document.
// If the progress field changed, propagates the new value up to all ancestors.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapNodeProgressChange = onDocumentWritten(
  'roadmapNodes/{nodeId}',
  async (event) => {
    const { nodeId } = event.params;
    const change = event.data;
    if (!change) return;

    // Document deleted — nothing to propagate
    if (!change.after.exists) {
      logger.info(`[onRoadmapNodeProgressChange] node ${nodeId} deleted — skipping`);
      return;
    }

    const afterData  = change.after.data() || {};
    const beforeData = change.before.exists ? (change.before.data() || {}) : null;

    const progressAfter  = afterData.progress || 0;
    const progressBefore = beforeData ? (beforeData.progress || 0) : null;

    // Only propagate if progress actually changed (loop guard — outer layer)
    if (beforeData !== null && Math.round(progressAfter) === Math.round(progressBefore)) {
      logger.info(`[onRoadmapNodeProgressChange] node ${nodeId} progress unchanged (${progressAfter}) — skipping ancestor propagation`);
      return;
    }

    const ancestorIds = afterData.ancestorIds || [];
    if (ancestorIds.length === 0) {
      logger.info(`[onRoadmapNodeProgressChange] node ${nodeId} is root — no ancestors to update`);
      return;
    }

    logger.info(`[onRoadmapNodeProgressChange] node ${nodeId} progress ${progressBefore} -> ${progressAfter}. Propagating to ${ancestorIds.length} ancestor(s)...`);

    try {
      await propagateProgressToAncestors(ancestorIds, db, FieldValue);
    } catch (err) {
      logger.error(`[onRoadmapNodeProgressChange] ERROR for node ${nodeId}:`, err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rollup / system-managed fields. When these change they get a history
 * entry attributed to "system" with no previousValue detail.
 */
const SYSTEM_FIELDS = ['progress', 'childCount', 'childCompletedCount'];

/**
 * Fields to track for node history entries (non-system).
 */
const NODE_TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority',
  'startDate', 'dueDate', 'assignedTo', 'tags',
  'dependencies', 'order', 'isArchived',
];

/**
 * Fields to track for task history entries.
 */
const TASK_TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority',
  'progress', 'assignedTo', 'dueDate',
  'completionNote',
];

/**
 * Stringify a Firestore value to a human-readable string for history display.
 * Handles Timestamp, Date, Array, null, boolean, and primitives.
 *
 * @param {*} val
 * @returns {string}
 */
function stringifyValue(val) {
  if (val === null || val === undefined) return '';
  // Firestore Timestamp
  if (val && typeof val.toDate === 'function') {
    return val.toDate().toISOString().split('T')[0]; // YYYY-MM-DD
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (Array.isArray(val)) {
    return val.join(', ');
  }
  return String(val);
}

/**
 * Determine if two Firestore field values are meaningfully equal.
 * Handles Timestamp comparison, array deep-equality, and primitives.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function valuesEqual(a, b) {
  // Both null/undefined
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if ((a === null || a === undefined) !== (b === null || b === undefined)) return false;

  // Firestore Timestamps: compare millis
  const aIsTs = a && typeof a.toMillis === 'function';
  const bIsTs = b && typeof b.toMillis === 'function';
  if (aIsTs && bIsTs) return a.toMillis() === b.toMillis();
  if (aIsTs !== bIsTs) {
    // One is a Timestamp, other might be a Date string — compare as ISO date
    const aStr = aIsTs ? stringifyValue(a) : String(a);
    const bStr = bIsTs ? stringifyValue(b) : String(b);
    return aStr === bStr;
  }

  // Arrays: compare sorted string representations
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return [...a].sort().join(',') === [...b].sort().join(',');
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  return a === b;
}

/**
 * Write a history entry to roadmapNodes/{nodeId}/history.
 * Uses Admin SDK — bypasses the client `allow write: if false` rule.
 *
 * `nodeId` is denormalized onto the entry because firestore.indexes.json
 * index 6 (collectionGroup history: nodeId + timestamp) queries on it.
 *
 * @param {string} nodeId
 * @param {object} entry  - History document fields
 * @returns {Promise<void>}
 */
async function writeHistoryEntry(nodeId, entry) {
  const ref = await db
    .collection('roadmapNodes')
    .doc(nodeId)
    .collection('history')
    .add({ nodeId, ...entry });
  logger.info(`[Phase17] History entry written: ${ref.id} for node ${nodeId}`);
}

/**
 * Build the changedFields array for a newly created document — every
 * non-empty tracked field, recorded as an empty -> value transition.
 *
 * @param {object} data
 * @param {string[]} trackedFields
 * @returns {Array<{field: string, previousValue: string, newValue: string}>}
 */
function initialFieldEntries(data, trackedFields) {
  const entries = [];
  for (const field of trackedFields) {
    const val = data[field];
    const isEmpty = val === null || val === undefined || val === '' ||
                    (Array.isArray(val) && val.length === 0);
    if (!isEmpty) {
      entries.push({ field, previousValue: '', newValue: stringifyValue(val) });
    }
  }
  return entries;
}

/**
 * Diff two documents across a tracked field list.
 *
 * @param {object} beforeData
 * @param {object} afterData
 * @param {string[]} trackedFields
 * @returns {Array<{field: string, previousValue: string, newValue: string}>}
 */
function diffFields(beforeData, afterData, trackedFields) {
  const changed = [];
  for (const field of trackedFields) {
    if (!valuesEqual(beforeData[field], afterData[field])) {
      changed.push({
        field,
        previousValue: stringifyValue(beforeData[field]),
        newValue:      stringifyValue(afterData[field]),
      });
    }
  }
  return changed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Trigger 3: onRoadmapNodeHistory
// Fires on every roadmap node write. Diffs before/after, writes one history
// document per substantive change (skips metadata-only writes).
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapNodeHistory = onDocumentWritten(
  'roadmapNodes/{nodeId}',
  async (event) => {
    const { nodeId } = event.params;
    const change = event.data;
    if (!change) return;

    const afterExists  = change.after.exists;
    const beforeExists = change.before.exists;

    const afterData  = afterExists  ? (change.after.data()  || {}) : {};
    const beforeData = beforeExists ? (change.before.data() || {}) : {};

    try {
      // ── created ───────────────────────────────────────────────────────────
      if (!beforeExists && afterExists) {
        await writeHistoryEntry(nodeId, {
          action:        'created',
          changedBy:     afterData.updatedBy || afterData.createdBy || 'system',
          changedFields: initialFieldEntries(afterData, NODE_TRACKED_FIELDS),
          nodeTitle:     afterData.title || '',
          timestamp:     FieldValue.serverTimestamp(),
          entityType:    'node',
        });
        return;
      }

      // ── deleted ───────────────────────────────────────────────────────────
      if (beforeExists && !afterExists) {
        await writeHistoryEntry(nodeId, {
          action:        'deleted',
          changedBy:     beforeData.updatedBy || beforeData.createdBy || 'system',
          changedFields: [],
          nodeTitle:     beforeData.title || '',
          timestamp:     FieldValue.serverTimestamp(),
          entityType:    'node',
        });
        return;
      }

      // ── updated ───────────────────────────────────────────────────────────
      const changedFields = diffFields(beforeData, afterData, NODE_TRACKED_FIELDS);

      // Rollup fields get lighter entries with no previousValue.
      const systemChangedFields = [];
      for (const field of SYSTEM_FIELDS) {
        if (!valuesEqual(beforeData[field], afterData[field])) {
          systemChangedFields.push({ field, newValue: stringifyValue(afterData[field]) });
        }
      }

      // Loop guard: if nothing substantive changed (only updatedAt/updatedBy/
      // path/ancestorIds/depth), don't write. This is what stops the Phase 8
      // rollup triggers from generating an endless history stream.
      if (changedFields.length === 0 && systemChangedFields.length === 0) {
        logger.debug(`[onRoadmapNodeHistory] node ${nodeId} — only metadata changed, skipping history write`);
        return;
      }

      const isArchive = !beforeData.isArchived && afterData.isArchived;

      await writeHistoryEntry(nodeId, {
        action:              isArchive ? 'archived' : 'updated',
        changedBy:           afterData.updatedBy || afterData.createdBy || 'system',
        changedFields,
        systemChangedFields,
        nodeTitle:           afterData.title || '',
        timestamp:           FieldValue.serverTimestamp(),
        entityType:          'node',
      });
    } catch (err) {
      logger.error(`[onRoadmapNodeHistory] write error for node ${nodeId}:`, err);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Trigger 4: onRoadmapTaskHistory
// Fires on every task write under any roadmap node. Diffs before/after,
// writes one history document to the *parent node's* history subcollection
// so the node's History tab shows both node-level and task-level changes.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapTaskHistory = onDocumentWritten(
  'roadmapNodes/{nodeId}/tasks/{taskId}',
  async (event) => {
    const { nodeId, taskId } = event.params;
    const change = event.data;
    if (!change) return;

    const afterExists  = change.after.exists;
    const beforeExists = change.before.exists;

    const afterData  = afterExists  ? (change.after.data()  || {}) : {};
    const beforeData = beforeExists ? (change.before.data() || {}) : {};

    try {
      // ── task_created ──────────────────────────────────────────────────────
      if (!beforeExists && afterExists) {
        await writeHistoryEntry(nodeId, {
          action:        'task_created',
          changedBy:     afterData.updatedBy || afterData.createdBy || 'system',
          taskId,
          taskTitle:     afterData.title || '',
          changedFields: initialFieldEntries(afterData, TASK_TRACKED_FIELDS),
          nodeTitle:     '',
          timestamp:     FieldValue.serverTimestamp(),
          entityType:    'task',
        });
        return;
      }

      // ── task_deleted ──────────────────────────────────────────────────────
      if (beforeExists && !afterExists) {
        await writeHistoryEntry(nodeId, {
          action:        'task_deleted',
          changedBy:     beforeData.updatedBy || beforeData.createdBy || 'system',
          taskId,
          taskTitle:     beforeData.title || '',
          changedFields: [],
          timestamp:     FieldValue.serverTimestamp(),
          entityType:    'task',
        });
        return;
      }

      // ── task_updated ──────────────────────────────────────────────────────
      const changedFields = diffFields(beforeData, afterData, TASK_TRACKED_FIELDS);

      if (changedFields.length === 0) {
        logger.debug(`[onRoadmapTaskHistory] task ${taskId} — only metadata changed, skipping history write`);
        return;
      }

      await writeHistoryEntry(nodeId, {
        action:        'task_updated',
        changedBy:     afterData.updatedBy || afterData.createdBy || beforeData.updatedBy || 'system',
        taskId,
        taskTitle:     afterData.title || '',
        changedFields,
        timestamp:     FieldValue.serverTimestamp(),
        entityType:    'task',
      });
    } catch (err) {
      logger.error(`[onRoadmapTaskHistory] write error for node ${nodeId}, task ${taskId}:`, err);
    }
  },
);
