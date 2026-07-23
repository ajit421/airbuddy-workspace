import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { z } from 'zod';

/**
 * roadmapTaskService.js
 * Data access layer for roadmapNodes/{nodeId}/tasks subcollection.
 * Follows taskService.js conventions exactly.
 *
 * Rules:
 *  - Zod validation at every write boundary.
 *  - serverTimestamp() for createdAt / updatedAt.
 *  - subscribeToX(onData, onError) returns unsubscribe fn.
 *  - Error prefix: [roadmapTaskService] functionName: in console.error
 */

const ROADMAP_NODES_COL = 'roadmapNodes';
const TASKS_SUBCOL      = 'tasks';

/**
 * Zod validation schema for a full roadmap task document.
 * Used as a TypeScript-like contract for the shape of every task stored
 * under roadmapNodes/{nodeId}/tasks/{taskId}.
 *
 * `nodeId` is **denormalized** onto every task document so that
 * collectionGroup('tasks') queries (Phase 16 analytics) can filter
 * by nodeId without requiring a composite index.
 *
 * @see {@link createRoadmapTask} for the write-boundary schema (subset)
 */
// Zod Schema - kept in sync with phase3_firestore_schema.md
export const RoadmapTaskSchema = z.object({
  title:          z.string().min(1, 'Task title is required'),
  description:    z.string().optional().default(''),
  status:         z.enum(['pending', 'in-progress', 'completed']),
  priority:       z.enum(['low', 'medium', 'high']),
  progress:       z.number().min(0).max(100).default(0),
  assignedTo:     z.array(z.string()).optional().default([]),
  dueDate:        z.string().or(z.date()).optional().nullable(),
  completionNote: z.string().optional().default(''),
  assignedBy:     z.string().min(1, 'assignedBy is required'),
  createdBy:      z.string().min(1, 'createdBy is required'),
  updatedBy:      z.string().min(1, 'updatedBy is required'),
  nodeId:         z.string().min(1, 'nodeId is required'),
});

// Helper
const snapToArray = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Real-time Subscriptions

/**
 * Subscribe to all tasks under a roadmap node.
 * Results sorted by createdAt ascending (client-side).
 *
 * @param {string}   nodeId
 * @param {function} onData   - Called with task array
 * @param {function} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToRoadmapTasks(nodeId, onData, onError) {
  if (!nodeId) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, ROADMAP_NODES_COL, nodeId, TASKS_SUBCOL)
  );
  return onSnapshot(
    q,
    (snap) => {
      const tasks = snapToArray(snap).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });
      onData(tasks);
    },
    (err) => {
      console.error('[roadmapTaskService] subscribeToRoadmapTasks:', err);
      if (onError) onError(err);
    }
  );
}

// CRUD

/**
 * Create a new task under a roadmap node.
 * nodeId is denormalized into the task document for collectionGroup queries.
 *
 * @param {string} nodeId   - Parent roadmap node ID
 * @param {object} form     - Task form data
 * @param {string} adminUid - effectiveUid of assigning admin
 * @returns {Promise<string>} New task document ID
 */
export async function createRoadmapTask(nodeId, form, adminUid) {
  if (!nodeId) throw new Error('[roadmapTaskService] createRoadmapTask: nodeId is required');

  // ── Zod validation at write boundary ──────────────────────────────────────
  const CreateTaskSchema = z.object({
    title:          z.string().min(1, 'Task title is required'),
    description:    z.string().optional().default(''),
    status:         z.enum(['pending', 'in-progress', 'completed']).default('pending'),
    priority:       z.enum(['low', 'medium', 'high']).default('medium'),
    progress:       z.number().min(0).max(100).default(0),
    assignedTo:     z.array(z.string()).optional().default([]),
    dueDate:        z.string().or(z.date()).optional().nullable(),
    completionNote: z.string().optional().default(''),
  });

  const validated = CreateTaskSchema.parse(form);  // throws ZodError if invalid

  try {
    const taskRef = await addDoc(
      collection(db, ROADMAP_NODES_COL, nodeId, TASKS_SUBCOL),
      {
        ...validated,
        dueDate:    validated.dueDate ? new Date(validated.dueDate) : null,
        // Audit + denormalized
        assignedBy: adminUid,
        createdBy:  adminUid,
        updatedBy:  adminUid,
        nodeId:     nodeId,     // denormalized for collectionGroup queries (Phase 16)
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      }
    );
    return taskRef.id;
  } catch (err) {
    console.error('[roadmapTaskService] createRoadmapTask:', err);
    throw err;
  }
}


/**
 * Update a roadmap task.
 * Admin: any field.
 * Assigned employee: only status, progress, completionNote, updatedBy, updatedAt.
 * Field restriction is enforced in Firestore Rules (Phase 9) — this function
 * itself does not re-check; callers must pass only allowed fields for employees.
 *
 * @param {string} nodeId  - Parent roadmap node ID
 * @param {string} taskId  - Task document ID
 * @param {object} data    - Partial fields to update
 * @param {string} uid     - effectiveUid of the editing user
 * @returns {Promise<void>}
 */
export async function updateRoadmapTask(nodeId, taskId, data, uid) {
  if (!nodeId) throw new Error('[roadmapTaskService] updateRoadmapTask: nodeId is required');
  if (!taskId) throw new Error('[roadmapTaskService] updateRoadmapTask: taskId is required');

  // Strip immutable fields
  const { createdAt: _createdAt, createdBy: _createdBy, nodeId: _nodeId, id: _id, ...safeData } = data;

  try {
    await updateDoc(
      doc(db, ROADMAP_NODES_COL, nodeId, TASKS_SUBCOL, taskId),
      {
        ...safeData,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      }
    );
  } catch (err) {
    console.error('[roadmapTaskService] updateRoadmapTask:', err);
    throw err;
  }
}

/**
 * Delete a roadmap task.
 * Admin only (enforced by Firestore Rules in Phase 9).
 *
 * @param {string} nodeId - Parent roadmap node ID
 * @param {string} taskId - Task document ID
 * @returns {Promise<void>}
 */
export async function deleteRoadmapTask(nodeId, taskId) {
  if (!nodeId) throw new Error('[roadmapTaskService] deleteRoadmapTask: nodeId is required');
  if (!taskId) throw new Error('[roadmapTaskService] deleteRoadmapTask: taskId is required');
  try {
    await deleteDoc(doc(db, ROADMAP_NODES_COL, nodeId, TASKS_SUBCOL, taskId));
  } catch (err) {
    console.error('[roadmapTaskService] deleteRoadmapTask:', err);
    throw err;
  }
}
