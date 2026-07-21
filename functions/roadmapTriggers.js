/**
 * roadmapTriggers.js — Phase 8
 * Firestore Cloud Function triggers for roadmap progress rollup.
 *
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
 * Infinite-loop guard: both triggers skip writes when the rounded value
 * is identical to the current stored value, causing the cascade to converge.
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
// Trigger 1: onRoadmapTaskWrite
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
// Trigger 2: onRoadmapNodeProgressChange
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