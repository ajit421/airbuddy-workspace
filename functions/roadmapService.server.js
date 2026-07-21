/**
 * roadmapService.server.js — Phase 8
 * Server-side helpers for roadmap progress rollup.
 * Used by roadmapTriggers.js only. Never imported client-side.
 *
 * Safety design:
 *  - computeTaskProgress() is a pure function (unit-testable).
 *  - recomputeNodeProgress() uses a Firestore transaction for race-safety.
 *  - propagateProgressToAncestors() stops early on unchanged values (loop guard).
 *  - Hard cap of 10 ancestor levels per invocation (cost control).
 */

'use strict';

const NODES_COL    = 'roadmapNodes';
const TASKS_SUBCOL = 'tasks';
const MAX_ANCESTORS = 10;

// ────────────────────────────────────────────────────────────────────────────
// Pure helper — easy to unit test without Firestore
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute progress and completion stats from a flat array of task objects.
 * Archived tasks are excluded from the calculation.
 *
 * @param {Array} tasks  Array of task data objects from Firestore
 * @returns {{ progress, childCount, childCompletedCount, nodeStatus }}
 */
function computeTaskProgress(tasks) {
  if (!tasks || tasks.length === 0) {
    return { progress: 0, childCount: 0, childCompletedCount: 0, nodeStatus: null };
  }

  const active = tasks.filter(function(t) { return t.status !== 'archived'; });

  if (active.length === 0) {
    return { progress: 0, childCount: 0, childCompletedCount: 0, nodeStatus: null };
  }

  var total    = active.reduce(function(sum, t) { return sum + (Number(t.progress) || 0); }, 0);
  var progress = Math.round(total / active.length);

  var completedCount = active.filter(function(t) { return t.status === 'completed'; }).length;

  var nodeStatus = null;
  if (completedCount === active.length) {
    nodeStatus = 'completed';
  } else if (active.some(function(t) { return t.status === 'in-progress' || (t.progress || 0) > 0; })) {
    nodeStatus = 'in-progress';
  }

  return {
    progress:            progress,
    childCount:          active.length,
    childCompletedCount: completedCount,
    nodeStatus:          nodeStatus,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Transaction-based recompute for a single node
// ────────────────────────────────────────────────────────────────────────────

/**
 * Read all tasks under a node, compute progress, write back only if changed.
 * Uses a Firestore transaction for race-safety.
 *
 * @param {string} nodeId
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} admin
 * @returns {Promise<{ wrote: boolean, newProgress: number }>}
 */
function recomputeNodeProgress(nodeId, db, admin) {
  var nodeRef  = db.collection(NODES_COL).doc(nodeId);
  var tasksRef = db.collection(NODES_COL).doc(nodeId).collection(TASKS_SUBCOL);

  return db.runTransaction(function(tx) {
    return Promise.all([tx.get(nodeRef), tx.get(tasksRef)]).then(function(results) {
      var nodeSnap  = results[0];
      var tasksSnap = results[1];

      if (!nodeSnap.exists) {
        console.warn('[roadmapService.server] recomputeNodeProgress: node ' + nodeId + ' not found - skipping');
        return { wrote: false, newProgress: 0 };
      }

      var tasks  = tasksSnap.docs.map(function(d) { return d.data(); });
      var result = computeTaskProgress(tasks);

      var currentProgress = nodeSnap.data().progress || 0;

      // Loop guard: skip write if rounded value is identical
      if (Math.round(result.progress) === Math.round(currentProgress)) {
        return { wrote: false, newProgress: result.progress };
      }

      var update = {
        progress:            result.progress,
        childCompletedCount: result.childCompletedCount,
        updatedAt:           admin.firestore.FieldValue.serverTimestamp(),
      };
      if (result.nodeStatus !== null) {
        update.status = result.nodeStatus;
      }

      tx.update(nodeRef, update);
      return { wrote: true, newProgress: result.progress };
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Ancestor propagation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute average progress of all direct (non-archived) children of a node.
 *
 * @param {string} parentId
 * @param {object} db
 * @returns {Promise<number>}
 */
function getDirectChildrenProgress(parentId, db) {
  return db.collection(NODES_COL)
    .where('parentId',   '==', parentId)
    .where('isArchived', '==', false)
    .get()
    .then(function(snap) {
      if (snap.empty) return 0;
      var total = snap.docs.reduce(function(sum, d) { return sum + (Number(d.data().progress) || 0); }, 0);
      return Math.round(total / snap.docs.length);
    });
}

/**
 * Walk the ancestor chain (nearest-first) and recompute progress for each.
 * Stops early when a value is unchanged (loop guard). Hard cap: MAX_ANCESTORS.
 *
 * @param {string[]} ancestorIds  Stored [root, ..., direct_parent]; reversed to nearest-first
 * @param {object}   db
 * @param {object}   admin
 * @returns {Promise<void>}
 */
function propagateProgressToAncestors(ancestorIds, db, admin) {
  if (!ancestorIds || ancestorIds.length === 0) return Promise.resolve();

  // Reverse: stored as [root → parent], we want [parent → root]
  var ordered = ancestorIds.slice().reverse();
  var capped  = ordered.slice(0, MAX_ANCESTORS);

  if (ordered.length > MAX_ANCESTORS) {
    console.warn('[roadmapService.server] tree depth ' + ordered.length +
      ' exceeds MAX_ANCESTORS (' + MAX_ANCESTORS + '). Truncating propagation.');
  }

  // Sequential iteration (not parallel) to avoid write amplification
  var chain = Promise.resolve();
  var stopped = false;

  capped.forEach(function(ancestorId) {
    chain = chain.then(function() {
      if (stopped) return;

      var ancestorRef = db.collection(NODES_COL).doc(ancestorId);
      return ancestorRef.get().then(function(snap) {
        if (!snap.exists) {
          console.warn('[roadmapService.server] ancestor ' + ancestorId + ' not found - stopping');
          stopped = true;
          return;
        }

        var currentProgress = snap.data().progress || 0;
        return getDirectChildrenProgress(ancestorId, db).then(function(newProgress) {
          // Loop guard
          if (Math.round(newProgress) === Math.round(currentProgress)) {
            console.log('[roadmapService.server] ancestor ' + ancestorId +
              ' progress unchanged at ' + newProgress + ' - stopping');
            stopped = true;
            return;
          }

          console.log('[roadmapService.server] ancestor ' + ancestorId +
            ' progress ' + currentProgress + ' -> ' + newProgress);

          return ancestorRef.update({
            progress:  newProgress,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      });
    });
  });

  return chain;
}

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  computeTaskProgress:          computeTaskProgress,
  recomputeNodeProgress:        recomputeNodeProgress,
  propagateProgressToAncestors: propagateProgressToAncestors,
  getDirectChildrenProgress:    getDirectChildrenProgress,
};