/**
 * roadmapTriggers.js — Phase 8 + Phase 17
 * Firestore Cloud Function triggers for roadmap progress rollup (Phase 8)
 * and audit history writes (Phase 17).
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
 */

'use strict';

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

const {
  recomputeNodeProgress,
  propagateProgressToAncestors,
} = require('./roadmapService.server');

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Trigger 1: onRoadmapTaskWrite
// Fires whenever a task under any roadmap node is created, updated, or deleted.
// Recomputes the parent node's progress using a transaction.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapTaskWrite = functions.firestore
  .document('roadmapNodes/{nodeId}/tasks/{taskId}')
  .onWrite(function(change, context) {
    var nodeId = context.params.nodeId;
    var taskId = context.params.taskId;

    console.log('[onRoadmapTaskWrite] task ' + taskId + ' written under node ' + nodeId);

    // recomputeNodeProgress handles the loop guard internally (transaction + round check)
    return recomputeNodeProgress(nodeId, db, admin)
      .then(function(result) {
        if (result.wrote) {
          console.log('[onRoadmapTaskWrite] node ' + nodeId + ' progress -> ' + result.newProgress);
        } else {
          console.log('[onRoadmapTaskWrite] node ' + nodeId + ' progress unchanged (' + result.newProgress + ') - no write');
        }
      })
      .catch(function(err) {
        console.error('[onRoadmapTaskWrite] ERROR for node ' + nodeId + ':', err);
      });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — Trigger 2: onRoadmapNodeProgressChange
// Fires on any write to a roadmap node document.
// If the progress field changed, propagates the new value up to all ancestors.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapNodeProgressChange = functions.firestore
  .document('roadmapNodes/{nodeId}')
  .onWrite(function(change, context) {
    var nodeId = context.params.nodeId;

    // Document deleted — nothing to propagate
    if (!change.after.exists) {
      console.log('[onRoadmapNodeProgressChange] node ' + nodeId + ' deleted — skipping');
      return null;
    }

    var afterData  = change.after.data();
    var beforeData = change.before.exists ? change.before.data() : null;

    var progressAfter  = afterData.progress  || 0;
    var progressBefore = beforeData ? (beforeData.progress || 0) : null;

    // Only propagate if progress actually changed (loop guard — outer layer)
    if (beforeData !== null && Math.round(progressAfter) === Math.round(progressBefore)) {
      console.log('[onRoadmapNodeProgressChange] node ' + nodeId +
        ' progress unchanged (' + progressAfter + ') — skipping ancestor propagation');
      return null;
    }

    var ancestorIds = afterData.ancestorIds || [];

    if (ancestorIds.length === 0) {
      console.log('[onRoadmapNodeProgressChange] node ' + nodeId + ' is root — no ancestors to update');
      return null;
    }

    console.log('[onRoadmapNodeProgressChange] node ' + nodeId +
      ' progress ' + progressBefore + ' -> ' + progressAfter +
      '. Propagating to ' + ancestorIds.length + ' ancestor(s)...');

    return propagateProgressToAncestors(ancestorIds, db, admin)
      .catch(function(err) {
        console.error('[onRoadmapNodeProgressChange] ERROR for node ' + nodeId + ':', err);
      });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fields on a roadmap node that are "structural" and never produce
 * a history entry on their own when only they change.
 * Rollup fields (progress, childCount, childCompletedCount) are logged
 * as lightweight "system" entries — see SYSTEM_FIELDS below.
 */
var SKIP_ONLY_FIELDS = ['updatedAt', 'updatedBy', 'path', 'ancestorIds', 'depth', 'createdAt'];

/**
 * Rollup / system-managed fields. When these change they get a history
 * entry attributed to "system" with no previousValue detail.
 */
var SYSTEM_FIELDS = ['progress', 'childCount', 'childCompletedCount'];

/**
 * Fields to track for node history entries (non-system).
 */
var NODE_TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority',
  'startDate', 'dueDate', 'assignedTo', 'tags',
  'dependencies', 'order', 'isArchived',
];

/**
 * Fields to track for task history entries.
 */
var TASK_TRACKED_FIELDS = [
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
  var aIsTs = a && typeof a.toMillis === 'function';
  var bIsTs = b && typeof b.toMillis === 'function';
  if (aIsTs && bIsTs) return a.toMillis() === b.toMillis();
  if (aIsTs !== bIsTs) {
    // One is a Timestamp, other might be a Date string — compare as ISO date
    var aStr = aIsTs ? stringifyValue(a) : String(a);
    var bStr = bIsTs ? stringifyValue(b) : String(b);
    return aStr === bStr;
  }

  // Arrays: compare sorted string representations
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    var aSorted = [...a].sort().join(',');
    var bSorted = [...b].sort().join(',');
    return aSorted === bSorted;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  return a === b;
}

/**
 * Write a history entry to roadmapNodes/{nodeId}/history.
 * Uses Admin SDK — bypasses the client `allow write: if false` rule.
 *
 * @param {string} nodeId
 * @param {object} entry  - History document fields
 * @returns {Promise<void>}
 */
function writeHistoryEntry(nodeId, entry) {
  return db
    .collection('roadmapNodes')
    .doc(nodeId)
    .collection('history')
    .add(entry)
    .then(function(ref) {
      console.log('[Phase17] History entry written: ' + ref.id + ' for node ' + nodeId);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Trigger 3: onRoadmapNodeHistory
// Fires on every roadmap node write. Diffs before/after, writes one history
// document per substantive change (skips metadata-only writes).
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapNodeHistory = functions.firestore
  .document('roadmapNodes/{nodeId}')
  .onWrite(function(change, context) {
    var nodeId = context.params.nodeId;

    // ── Determine action ────────────────────────────────────────────────────
    var action;
    if (!change.before.exists && change.after.exists) {
      action = 'created';
    } else if (change.before.exists && !change.after.exists) {
      action = 'deleted';
    } else {
      action = 'updated';
    }

    var afterData  = change.after.exists  ? change.after.data()  : {};
    var beforeData = change.before.exists ? change.before.data() : {};

    // changedBy: prefer updatedBy from after; fallback to createdBy on creation
    var changedBy = afterData.updatedBy || afterData.createdBy || 'system';

    // ── Action = 'created' ──────────────────────────────────────────────────
    if (action === 'created') {
      var createdEntry = {
        action:         'created',
        changedBy:      changedBy,
        changedFields:  [],
        nodeTitle:      afterData.title || '',
        timestamp:      admin.firestore.FieldValue.serverTimestamp(),
        entityType:     'node',
      };

      // Capture initial non-empty values as "changedFields" for completeness
      NODE_TRACKED_FIELDS.forEach(function(field) {
        var val = afterData[field];
        var isEmpty = val === null || val === undefined || val === '' ||
                      (Array.isArray(val) && val.length === 0);
        if (!isEmpty) {
          createdEntry.changedFields.push({
            field:         field,
            previousValue: '',
            newValue:      stringifyValue(val),
          });
        }
      });

      return writeHistoryEntry(nodeId, createdEntry)
        .catch(function(err) {
          console.error('[onRoadmapNodeHistory] created write error for node ' + nodeId + ':', err);
        });
    }

    // ── Action = 'deleted' ──────────────────────────────────────────────────
    if (action === 'deleted') {
      return writeHistoryEntry(nodeId, {
        action:        'deleted',
        changedBy:     beforeData.updatedBy || beforeData.createdBy || 'system',
        changedFields: [],
        nodeTitle:     beforeData.title || '',
        timestamp:     admin.firestore.FieldValue.serverTimestamp(),
        entityType:    'node',
      }).catch(function(err) {
        console.error('[onRoadmapNodeHistory] deleted write error for node ' + nodeId + ':', err);
      });
    }

    // ── Action = 'updated' ──────────────────────────────────────────────────

    // Determine action label (archived is a special case of updated)
    var isArchive = !beforeData.isArchived && afterData.isArchived;
    var actualAction = isArchive ? 'archived' : 'updated';

    // Diff tracked (non-system) fields
    var changedFields = [];
    NODE_TRACKED_FIELDS.forEach(function(field) {
      var before = beforeData[field];
      var after  = afterData[field];
      if (!valuesEqual(before, after)) {
        changedFields.push({
          field:         field,
          previousValue: stringifyValue(before),
          newValue:      stringifyValue(after),
        });
      }
    });

    // Diff system/rollup fields — lighter entries
    var systemChangedFields = [];
    SYSTEM_FIELDS.forEach(function(field) {
      var before = beforeData[field];
      var after  = afterData[field];
      if (!valuesEqual(before, after)) {
        systemChangedFields.push({
          field:    field,
          newValue: stringifyValue(after),
        });
      }
    });

    // ── Loop guard ──────────────────────────────────────────────────────────
    // If NOTHING substantive changed (only SKIP_ONLY_FIELDS or no fields at all),
    // don't write a history entry. This prevents infinite loops from metadata-only
    // writes (e.g. the progress rollup triggers from Phase 8 writing updatedAt).
    if (changedFields.length === 0 && systemChangedFields.length === 0) {
      console.log('[onRoadmapNodeHistory] node ' + nodeId +
        ' — only metadata changed, skipping history write');
      return null;
    }

    // Build the combined history entry
    var entry = {
      action:             actualAction,
      changedBy:          changedBy,
      changedFields:      changedFields,
      systemChangedFields: systemChangedFields,
      nodeTitle:          afterData.title || '',
      timestamp:          admin.firestore.FieldValue.serverTimestamp(),
      entityType:         'node',
    };

    return writeHistoryEntry(nodeId, entry)
      .catch(function(err) {
        console.error('[onRoadmapNodeHistory] updated write error for node ' + nodeId + ':', err);
      });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 17 — Trigger 4: onRoadmapTaskHistory
// Fires on every task write under any roadmap node. Diffs before/after,
// writes one history document to the *parent node's* history subcollection
// so the node's History tab shows both node-level and task-level changes.
// ─────────────────────────────────────────────────────────────────────────────

exports.onRoadmapTaskHistory = functions.firestore
  .document('roadmapNodes/{nodeId}/tasks/{taskId}')
  .onWrite(function(change, context) {
    var nodeId = context.params.nodeId;
    var taskId = context.params.taskId;

    var afterData  = change.after.exists  ? change.after.data()  : {};
    var beforeData = change.before.exists ? change.before.data() : {};

    // ── Determine action ────────────────────────────────────────────────────
    var action;
    if (!change.before.exists && change.after.exists) {
      action = 'task_created';
    } else if (change.before.exists && !change.after.exists) {
      action = 'task_deleted';
    } else {
      action = 'task_updated';
    }

    var changedBy = afterData.updatedBy || afterData.createdBy || beforeData.updatedBy || 'system';

    // ── Action = 'task_created' ─────────────────────────────────────────────
    if (action === 'task_created') {
      var createdEntry = {
        action:        'task_created',
        changedBy:     changedBy,
        taskId:        taskId,
        taskTitle:     afterData.title || '',
        changedFields: [],
        nodeTitle:     '',   // populated by CF only — no extra read needed
        timestamp:     admin.firestore.FieldValue.serverTimestamp(),
        entityType:    'task',
      };

      TASK_TRACKED_FIELDS.forEach(function(field) {
        var val = afterData[field];
        var isEmpty = val === null || val === undefined || val === '' ||
                      (Array.isArray(val) && val.length === 0);
        if (!isEmpty) {
          createdEntry.changedFields.push({
            field:         field,
            previousValue: '',
            newValue:      stringifyValue(val),
          });
        }
      });

      return writeHistoryEntry(nodeId, createdEntry)
        .catch(function(err) {
          console.error('[onRoadmapTaskHistory] task_created error for node ' + nodeId + ', task ' + taskId + ':', err);
        });
    }

    // ── Action = 'task_deleted' ─────────────────────────────────────────────
    if (action === 'task_deleted') {
      return writeHistoryEntry(nodeId, {
        action:        'task_deleted',
        changedBy:     beforeData.updatedBy || beforeData.createdBy || 'system',
        taskId:        taskId,
        taskTitle:     beforeData.title || '',
        changedFields: [],
        timestamp:     admin.firestore.FieldValue.serverTimestamp(),
        entityType:    'task',
      }).catch(function(err) {
        console.error('[onRoadmapTaskHistory] task_deleted error for node ' + nodeId + ', task ' + taskId + ':', err);
      });
    }

    // ── Action = 'task_updated' ─────────────────────────────────────────────
    var changedFields = [];
    TASK_TRACKED_FIELDS.forEach(function(field) {
      var before = beforeData[field];
      var after  = afterData[field];
      if (!valuesEqual(before, after)) {
        changedFields.push({
          field:         field,
          previousValue: stringifyValue(before),
          newValue:      stringifyValue(after),
        });
      }
    });

    // Loop guard: skip if nothing tracked actually changed
    if (changedFields.length === 0) {
      console.log('[onRoadmapTaskHistory] task ' + taskId +
        ' — only metadata changed, skipping history write');
      return null;
    }

    return writeHistoryEntry(nodeId, {
      action:        'task_updated',
      changedBy:     changedBy,
      taskId:        taskId,
      taskTitle:     afterData.title || '',
      changedFields: changedFields,
      timestamp:     admin.firestore.FieldValue.serverTimestamp(),
      entityType:    'task',
    }).catch(function(err) {
      console.error('[onRoadmapTaskHistory] task_updated error for node ' + nodeId + ', task ' + taskId + ':', err);
    });
  });