import { z } from 'zod';
// Phase 6+7: Full Firestore implementation
// import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
// import { db } from './firebase';

/**
 * roadmapTaskService.js
 * Data access layer for roadmapNodes/{nodeId}/tasks subcollection.
 * Follows taskService.js conventions exactly.
 *
 * Rules:
 *  - Zod validation at every write boundary.
 *  - serverTimestamp() for createdAt / updatedAt.
 *  - subscribeToX(onData, onError) returns unsubscribe fn.
 *  - Error prefix: '[roadmapTaskService] functionName:' in console.error
 */

// ─── Zod Schema ─────────────────────────────────────────────────────────────
export const RoadmapTaskSchema = z.object({
  title:       z.string().min(1, 'Task title is required'),
  description: z.string().optional(),
  status:      z.enum(['pending', 'in-progress', 'completed']),
  priority:    z.enum(['low', 'medium', 'high']),
  progress:    z.number().min(0).max(100).default(0),
  assignedTo:  z.array(z.string()).optional().default([]),
  dueDate:     z.string().or(z.date()).optional().nullable(),
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new task under a roadmap node.
 *
 * @param {string} nodeId   - Parent roadmap node ID
 * @param {object} form     - Task form data (validated by RoadmapTaskSchema)
 * @param {string} adminUid - UID of the assigning admin
 * @returns {Promise<string>} Firestore document ID of the new task
 */
export async function createRoadmapTask(nodeId, form, adminUid) {
  // Phase 7 implementation
  throw new Error('[roadmapTaskService] createRoadmapTask: Phase 7 not yet implemented');
}

/**
 * Update an existing roadmap task.
 * Employees may only update: status, progress, dueDate, completionNote.
 * Admins may update any field.
 *
 * @param {string} nodeId  - Parent roadmap node ID
 * @param {string} taskId  - Task document ID
 * @param {object} data    - Partial fields to update
 * @param {string} uid     - UID of the editing user
 * @returns {Promise<void>}
 */
export async function updateRoadmapTask(nodeId, taskId, data, uid) {
  // Phase 7 implementation
  throw new Error('[roadmapTaskService] updateRoadmapTask: Phase 7 not yet implemented');
}

/**
 * Delete a roadmap task.
 *
 * @param {string} nodeId  - Parent roadmap node ID
 * @param {string} taskId  - Task document ID
 * @returns {Promise<void>}
 */
export async function deleteRoadmapTask(nodeId, taskId) {
  // Phase 7 implementation
  throw new Error('[roadmapTaskService] deleteRoadmapTask: Phase 7 not yet implemented');
}

// ─── Real-time Subscriptions ─────────────────────────────────────────────────

/**
 * Subscribe to all tasks under a roadmap node.
 *
 * @param {string} nodeId      - Parent roadmap node ID
 * @param {function} onData    - Callback with tasks array
 * @param {function} [onError] - Optional error callback
 * @returns {function} Firestore unsubscribe function
 */
export function subscribeToRoadmapTasks(nodeId, onData, onError) {
  // Phase 6 implementation
  console.warn('[roadmapTaskService] subscribeToRoadmapTasks: Phase 6 not yet implemented');
  onData([]);
  return () => {};
}
