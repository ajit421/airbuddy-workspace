import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, getDoc, getDocs, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';
import { toDate } from '../utils/dateHelpers';

/**
 * roadmapService.js
 * Data access layer for roadmapNodes collection.
 * Follows taskService.js and kpiService.js conventions exactly.
 *
 * Rules:
 *  - Zod validation at every write boundary.
 *  - serverTimestamp() for createdAt / updatedAt — never new Date().
 *  - subscribeToX(onData, onError) pattern returning unsubscribe fn.
 *  - Client-side sort by dueDate ascending; no orderBy() to avoid a composite
 *    index per query. See sortNodesByDueDate for the undated-node tiebreak.
 *  - Error prefix: [roadmapService] functionName: in console.error
 */

const ROADMAP_NODES_COL = 'roadmapNodes';

/**
 * Zod validation schema for a full roadmap node document.
 * Used for write-time validation in createNode() and as a TypeScript-like
 * contract for the shape of every node in Firestore.
 *
 * Hierarchy fields (path, ancestorIds, depth, parentId) and rollup fields
 * (progress, childCount, childCompletedCount) are included here for
 * completeness but are computed internally — never passed in by callers.
 *
 * @see {@link createNode} for the write-boundary schema (subset of this)
 */
// Zod Schema - kept in sync with phase3_firestore_schema.md
export const RoadmapNodeSchema = z.object({
  title:               z.string().min(1, 'Title is required'),
  description:         z.string().optional().default(''),
  status:              z.enum(['pending', 'in-progress', 'completed', 'blocked', 'archived']),
  priority:            z.enum(['low', 'medium', 'high', 'critical']),
  startDate:           z.string().or(z.date()).optional().nullable(),
  dueDate:             z.string().or(z.date()).optional().nullable(),
  assignedTo:          z.array(z.string()).optional().default([]),
  createdBy:           z.string().min(1, 'createdBy is required'),
  updatedBy:           z.string().min(1, 'updatedBy is required'),
  parentId:            z.string().nullable().default(null),
  path:                z.string().default(''),
  ancestorIds:         z.array(z.string()).default([]),
  depth:               z.number().int().min(0).default(0),
  order:               z.number().int().min(0).default(0),
  progress:            z.number().min(0).max(100).default(0),
  childCount:          z.number().int().min(0).default(0),
  childCompletedCount: z.number().int().min(0).default(0),
  dependencies:        z.array(z.string()).optional().default([]),
  tags:                z.array(z.string()).optional().default([]),
  isArchived:          z.boolean().default(false),
});

// Helpers
const snapToArray = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
/**
 * Sort nodes by dueDate ascending — soonest deadline at the top.
 *
 * Nodes were previously ordered by the `order` field, which is only the
 * insertion counter set at create time, so a list of siblings appeared in the
 * sequence someone happened to add them rather than in timeline order.
 *
 * A node with no dueDate (or an unparseable one) has no position on a timeline,
 * so it sinks below every dated node instead of being treated as epoch 0.
 * `order` is the tiebreak for equal dates and for the undated group, which
 * keeps the sort stable across snapshots.
 *
 * Exported for unit testing (same pattern as computeHierarchy).
 *
 * @param {Array<object>} nodes
 * @returns {Array<object>} new sorted array — the input is not mutated
 */
export const sortNodesByDueDate = (nodes) => {
  const millis = (node) => {
    const d = toDate(node?.dueDate);
    return d && !isNaN(d) ? d.getTime() : null;
  };
  return [...nodes].sort((a, b) => {
    const ma = millis(a);
    const mb = millis(b);
    if (ma === null && mb === null) return (a.order ?? 0) - (b.order ?? 0);
    if (ma === null) return 1;
    if (mb === null) return -1;
    if (ma !== mb) return ma - mb;
    return (a.order ?? 0) - (b.order ?? 0);
  });
};

/**
 * Compute hierarchy fields for a new child node from its parent.
 * Called internally by createNode; also exported for testing (Phase 6).
 *
 * @param {string}      newNodeId  - The newly generated Firestore doc ID
 * @param {object|null} parentNode - Full parent node data (null for root)
 * @returns {{ parentId, path, ancestorIds, depth }}
 */
export function computeHierarchy(newNodeId, parentNode) {
  if (!parentNode) {
    return { parentId: null, path: newNodeId, ancestorIds: [], depth: 0 };
  }
  return {
    parentId:    parentNode.id,
    path:        `${parentNode.path}/${newNodeId}`,
    ancestorIds: [...(parentNode.ancestorIds ?? []), parentNode.id],
    depth:       (parentNode.depth ?? 0) + 1,
  };
}

// Real-time Subscriptions

/**
 * Subscribe to direct children of a parent node.
 * parentId = null returns root-level nodes.
 *
 * @param {string|null} parentId
 * @param {function}    onData   - Called with sorted children array
 * @param {function}    [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToChildren(parentId, onData, onError) {
  const q = query(
    collection(db, ROADMAP_NODES_COL),
    where('parentId',   '==', parentId),
    where('isArchived', '==', false),
  );
  return onSnapshot(
    q,
    (snap) => onData(sortNodesByDueDate(snapToArray(snap))),
    (err) => {
      console.error('[roadmapService] subscribeToChildren:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to ALL descendants of an ancestor node (full subtree).
 * Uses ancestorIds array-contains — one query for the full subtree.
 *
 * @param {string}   ancestorId
 * @param {function} onData   - Called with flat sorted descendant array
 * @param {function} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToSubtree(ancestorId, onData, onError) {
  const q = query(
    collection(db, ROADMAP_NODES_COL),
    where('ancestorIds', 'array-contains', ancestorId),
    where('isArchived',  '==', false),
  );
  return onSnapshot(
    q,
    (snap) => {
      const sorted = snapToArray(snap).sort((a, b) => {
        if ((a.depth ?? 0) !== (b.depth ?? 0)) return (a.depth ?? 0) - (b.depth ?? 0);
        return (a.order ?? 0) - (b.order ?? 0);
      });
      onData(sorted);
    },
    (err) => {
      console.error('[roadmapService] subscribeToSubtree:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to a single roadmap node document.
 *
 * @param {string}   nodeId
 * @param {function} onData   - Called with node object or null if not found
 * @param {function} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToNode(nodeId, onData, onError) {
  return onSnapshot(
    doc(db, ROADMAP_NODES_COL, nodeId),
    (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.error('[roadmapService] subscribeToNode:', err);
      if (onError) onError(err);
    }
  );
}

// CRUD

/**
 * Create a new roadmap node.
 * Uses a two-step write: addDoc to get the ID, then updateDoc to set path.
 * Increments parent childCount client-side (Phase 8 CF will also maintain this).
 *
 * @param {object}      form       - Form data (RoadmapNodeSchema fields)
 * @param {string}      adminUid   - effectiveUid of creating admin
 * @param {object|null} parentNode - Full parent node doc (null for root)
 * @returns {Promise<string>} New document ID
 */
export async function createNode(form, adminUid, parentNode = null) {
  // ── Zod validation at write boundary ────────────────────────────────────
  // Validate the user-supplied fields before any Firestore write.
  // Hierarchy fields (path, ancestorIds, depth, parentId) and rollup fields
  // (progress, childCount) are computed internally — not validated here.
  const CreateNodeSchema = z.object({
    title:        z.string().min(1, 'Title is required'),
    description:  z.string().optional().default(''),
    status:       z.enum(['pending', 'in-progress', 'completed', 'blocked', 'archived']).default('pending'),
    priority:     z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    startDate:    z.string().or(z.date()).optional().nullable(),
    dueDate:      z.string().or(z.date()).optional().nullable(),
    assignedTo:   z.array(z.string()).optional().default([]),
    order:        z.number().int().min(0).optional().default(0),
    dependencies: z.array(z.string()).optional().default([]),
    tags:         z.array(z.string()).optional().default([]),
  });

  const validated = CreateNodeSchema.parse(form);  // throws ZodError if invalid

  try {
    const colRef = collection(db, ROADMAP_NODES_COL);

    // Pre-generate the doc ID so hierarchy fields can be computed and written
    // in a single atomic setDoc — avoids the broken-intermediate-state window
    // of a two-step addDoc + updateDoc.
    const docRef = doc(colRef);
    const h = computeHierarchy(docRef.id, parentNode);

    await setDoc(docRef, {
      ...validated,
      startDate:           validated.startDate ? new Date(validated.startDate) : null,
      dueDate:             validated.dueDate   ? new Date(validated.dueDate)   : null,
      isArchived:          false,
      progress:            0,
      childCount:          0,
      childCompletedCount: 0,
      createdBy:           adminUid,
      updatedBy:           adminUid,
      createdAt:           serverTimestamp(),
      updatedAt:           serverTimestamp(),
      parentId:    h.parentId,
      path:        h.path,
      ancestorIds: h.ancestorIds,
      depth:       h.depth,
    });

    // Increment parent childCount atomically (best-effort; Phase 8 CF owns this authoritatively)
    if (parentNode) {
      await updateDoc(doc(db, ROADMAP_NODES_COL, parentNode.id), {
        childCount: increment(1),
        updatedAt:  serverTimestamp(),
      });
    }

    return docRef.id;
  } catch (err) {
    console.error('[roadmapService] createNode:', err);
    throw err;
  }
}


/**
 * Update structural fields of a roadmap node (admin only).
 * Strips rollup fields that must never be written client-side.
 *
 * @param {string} nodeId    - Firestore doc ID
 * @param {object} data      - Partial update data
 * @param {string} editorUid - effectiveUid of editor
 * @returns {Promise<void>}
 */
export async function updateNode(nodeId, data, editorUid) {
  if (!nodeId) throw new Error('[roadmapService] updateNode: nodeId is required');
  // Strip fields owned by Cloud Functions or immutable after create
  const { progress: _progress, childCount: _childCount, childCompletedCount: _childCompletedCount, path: _path, ancestorIds: _ancestorIds, depth: _depth, createdAt: _createdAt, createdBy: _createdBy, id: _id, ...safeData } = data;
  try {
    await updateDoc(doc(db, ROADMAP_NODES_COL, nodeId), {
      ...safeData,
      updatedBy: editorUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('[roadmapService] updateNode:', err);
    throw err;
  }
}

/**
 * Soft-delete a roadmap node (set isArchived = true).
 * Excluded from all default queries. Subcollections preserved.
 *
 * @param {string} nodeId   - Firestore doc ID
 * @param {string} adminUid - effectiveUid of archiving admin
 * @returns {Promise<void>}
 */
export async function archiveNode(nodeId, adminUid) {
  if (!nodeId) throw new Error('[roadmapService] archiveNode: nodeId is required');
  try {
    const snap = await getDoc(doc(db, ROADMAP_NODES_COL, nodeId));
    const parentId = snap.exists() ? snap.data().parentId : null;

    await updateDoc(doc(db, ROADMAP_NODES_COL, nodeId), {
      isArchived: true,
      updatedBy:  adminUid,
      updatedAt:  serverTimestamp(),
    });

    // Archived nodes are excluded from all queries, so the parent's
    // childCount must be decremented the same way deleteNode does.
    if (parentId) {
      await updateDoc(doc(db, ROADMAP_NODES_COL, parentId), {
        childCount: increment(-1),
        updatedAt:  serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('[roadmapService] archiveNode:', err);
    throw err;
  }
}

/**
 * Hard-delete a roadmap node document.
 * BLOCKED if childCount > 0 (reads the live doc to get latest value).
 * Subcollection cleanup must be done by Cloud Function (Phase 8).
 *
 * @param {string} nodeId - Firestore doc ID
 * @returns {Promise<void>}
 */
export async function deleteNode(nodeId) {
  if (!nodeId) throw new Error('[roadmapService] deleteNode: nodeId is required');
  try {
    const snap = await getDoc(doc(db, ROADMAP_NODES_COL, nodeId));
    if (!snap.exists()) throw new Error('[roadmapService] deleteNode: node not found');

    const data = snap.data();
    if ((data.childCount ?? 0) > 0) {
      throw new Error(
        `[roadmapService] deleteNode: cannot delete node with ${data.childCount} children. Archive it instead.`
      );
    }

    // Decrement parent childCount before deletion
    if (data.parentId) {
      const pSnap = await getDoc(doc(db, ROADMAP_NODES_COL, data.parentId));
      if (pSnap.exists()) {
        await updateDoc(doc(db, ROADMAP_NODES_COL, data.parentId), {
          childCount: Math.max(0, (pSnap.data().childCount ?? 1) - 1),
          updatedAt:  serverTimestamp(),
        });
      }
    }

    await deleteDoc(doc(db, ROADMAP_NODES_COL, nodeId));
  } catch (err) {
    console.error('[roadmapService] deleteNode:', err);
    throw err;
  }
}

/**
 * Recompute a node's progress/status/childCompletedCount from its own tasks
 * subcollection, then propagate the change up through its ancestors.
 *
 * This is a client-side stand-in for the Phase 8 Cloud Function triggers
 * (onRoadmapTaskWrite / onRoadmapNodeProgressChange in functions/roadmapTriggers.js).
 * Those triggers require the Firebase Blaze plan to deploy; this project is
 * currently on Spark, so no Cloud Functions are deployed at all — without this,
 * completing a task never updates the node's progress bar or status.
 * Mirrors the pure logic in functions/roadmapService.server.js exactly.
 *
 * Best-effort: failures are logged, never thrown — a rollup miss must not
 * block the task write that triggered it.
 *
 * @param {string} nodeId - The roadmap node whose own tasks subcollection changed
 * @returns {Promise<void>}
 */
export async function recomputeNodeRollup(nodeId) {
  if (!nodeId) return;
  try {
    const nodeRef  = doc(db, ROADMAP_NODES_COL, nodeId);
    const nodeSnap = await getDoc(nodeRef);
    if (!nodeSnap.exists()) return;
    const nodeData = nodeSnap.data();

    const tasksSnap = await getDocs(collection(db, ROADMAP_NODES_COL, nodeId, 'tasks'));
    const active = tasksSnap.docs
      .map((d) => d.data())
      .filter((t) => t.status !== 'archived');

    let progress = 0;
    let childCompletedCount = 0;
    let nodeStatus = null;
    if (active.length > 0) {
      const total = active.reduce((sum, t) => sum + (Number(t.progress) || 0), 0);
      progress = Math.round(total / active.length);
      childCompletedCount = active.filter((t) => t.status === 'completed').length;
      if (childCompletedCount === active.length) {
        nodeStatus = 'completed';
      } else if (active.some((t) => t.status === 'in-progress' || (t.progress || 0) > 0)) {
        nodeStatus = 'in-progress';
      }
    }

    const updatePayload = {};
    if (Math.round(progress) !== Math.round(nodeData.progress ?? 0)) {
      updatePayload.progress = progress;
    }
    if (childCompletedCount !== (nodeData.childCompletedCount ?? 0)) {
      updatePayload.childCompletedCount = childCompletedCount;
    }
    if (nodeStatus !== null && nodeStatus !== nodeData.status) {
      updatePayload.status = nodeStatus;
    }
    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updatedAt = serverTimestamp();
      await updateDoc(nodeRef, updatePayload);
    }

    // Propagate to ancestors, nearest-first, stopping when a value is unchanged.
    const ancestorIds = [...(nodeData.ancestorIds ?? [])].reverse().slice(0, 10);
    for (const ancestorId of ancestorIds) {
      const ancestorRef  = doc(db, ROADMAP_NODES_COL, ancestorId);
      const ancestorSnap = await getDoc(ancestorRef);
      if (!ancestorSnap.exists()) break;

      const childrenSnap = await getDocs(query(
        collection(db, ROADMAP_NODES_COL),
        where('parentId',   '==', ancestorId),
        where('isArchived', '==', false),
      ));
      if (childrenSnap.empty) break;

      const childTotal = childrenSnap.docs.reduce((sum, d) => sum + (Number(d.data().progress) || 0), 0);
      const newAncestorProgress = Math.round(childTotal / childrenSnap.docs.length);
      const currentAncestorProgress = ancestorSnap.data().progress ?? 0;

      if (Math.round(newAncestorProgress) === Math.round(currentAncestorProgress)) break;

      await updateDoc(ancestorRef, {
        progress:  newAncestorProgress,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('[roadmapService] recomputeNodeRollup:', err);
  }
}

/**
 * Convert roadmap nodes into calendar event objects with dedup logic.
 * Pure function — no Firestore calls. Takes already-subscribed data.
 *
 * DEDUP RULES:
 *  1. Nodes without a dueDate are excluded.
 *  2. Leaf node (childCount === 0) with exactly 1 task whose dueDate matches
 *     the node's dueDate → include 1 node event, add task.id to dedupTaskIds.
 *  3. Parent nodes → include only their own dueDate event, never child dates.
 *  4. Google Calendar sync: only depth 0 and 1 (returned as `syncEligible` flag).
 *
 * @param {Array}  nodes  - All roadmap node objects (from subscribeToChildren / subscribeToSubtree)
 * @param {Array}  tasks  - All roadmap tasks across all nodes (from collectionGroup query)
 * @returns {{ roadmapEvents: Array, dedupTaskIds: Set<string> }}
 */
export function getRoadmapCalendarEvents(nodes = [], tasks = []) {
  // Build a map: nodeId → task[]
  const tasksByNode = {};
  for (const task of tasks) {
    const nid = task.nodeId;
    if (!nid) continue;
    if (!tasksByNode[nid]) tasksByNode[nid] = [];
    tasksByNode[nid].push(task);
  }

  const roadmapEvents = [];
  const dedupTaskIds  = new Set();

  for (const node of nodes) {
    // Rule 1: skip nodes without a dueDate
    if (!node.dueDate) continue;

    const dueDateValue = node.dueDate?.toDate?.() ?? new Date(node.dueDate);
    if (!dueDateValue || isNaN(dueDateValue)) continue;

    const startValue = node.startDate
      ? (node.startDate?.toDate?.() ?? new Date(node.startDate))
      : dueDateValue;

    // Rule 2: leaf node dedup check
    const isLeaf      = (node.childCount ?? 0) === 0;
    const nodeTasks   = tasksByNode[node.id] ?? [];

    if (isLeaf && nodeTasks.length === 1) {
      const singleTask = nodeTasks[0];
      const taskDue    = singleTask.dueDate
        ? (singleTask.dueDate?.toDate?.() ?? new Date(singleTask.dueDate))
        : null;
      // If dates match (same calendar day) → suppress the task event
      if (taskDue && taskDue.toDateString() === dueDateValue.toDateString()) {
        dedupTaskIds.add(singleTask.id);
      }
    }

    // Build the calendar event for this node
    roadmapEvents.push({
      id:       `roadmap-${node.id}`,
      title:    node.title,
      start:    startValue,
      end:      dueDateValue,
      allDay:   true,
      resource: {
        ...node,
        _type:        'roadmap',
        syncEligible: (node.depth ?? 0) <= 1, // depth 0+1 only for Google Calendar sync
      },
    });
  }

  return { roadmapEvents, dedupTaskIds };
}
