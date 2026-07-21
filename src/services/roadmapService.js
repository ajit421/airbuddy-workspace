import { z } from 'zod';
// Phase 6+7: Full Firestore implementation
// import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
// import { db } from './firebase';

/**
 * roadmapService.js
 * Data access layer for roadmapNodes collection.
 * Follows taskService.js and kpiService.js conventions exactly.
 *
 * Rules:
 *  - Zod validation at every write boundary.
 *  - serverTimestamp() for createdAt / updatedAt — never new Date().
 *  - subscribeToX(onData, onError) pattern returning unsubscribe fn.
 *  - Client-side sort; no orderBy() unless index is confirmed.
 *  - Error prefix: '[roadmapService] functionName:' in console.error
 */

const ROADMAP_NODES_COL = 'roadmapNodes';

// ─── Zod Schema ─────────────────────────────────────────────────────────────
// Kept in sync with Phase 3 schema document (phase3_firestore_schema.md).
// All fields, types, defaults, and enums must match exactly.
export const RoadmapNodeSchema = z.object({
  // ── Core content ──────────────────────────────────────────────────────────
  title:               z.string().min(1, 'Title is required'),
  description:         z.string().optional().default(''),
  status:              z.enum(['pending', 'in-progress', 'completed', 'blocked', 'archived']),
  priority:            z.enum(['low', 'medium', 'high', 'critical']),
  startDate:           z.string().or(z.date()).optional().nullable(),
  dueDate:             z.string().or(z.date()).optional().nullable(),
  assignedTo:          z.array(z.string()).optional().default([]),

  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy:           z.string().min(1, 'createdBy is required'),   // effectiveUid
  updatedBy:           z.string().min(1, 'updatedBy is required'),   // effectiveUid

  // ── Hierarchy (computed on create, never updated directly) ────────────────
  parentId:            z.string().nullable().default(null),
  path:                z.string().default(''),         // "parentId/nodeId" materialized path
  ancestorIds:         z.array(z.string()).default([]),
  depth:               z.number().int().min(0).default(0),
  order:               z.number().int().min(0).default(0),

  // ── Progress rollup (maintained by Cloud Function, Phase 8) ──────────────
  progress:            z.number().min(0).max(100).default(0),
  childCount:          z.number().int().min(0).default(0),
  childCompletedCount: z.number().int().min(0).default(0),

  // ── Optional metadata ─────────────────────────────────────────────────────
  dependencies:        z.array(z.string()).optional().default([]),  // sibling nodeIds
  tags:                z.array(z.string()).optional().default([]),
  isArchived:          z.boolean().default(false),
});

// ─── Helper ─────────────────────────────────────────────────────────────────
/** Map a Firestore QuerySnapshot to plain-JS array with id injected. */
const snapToArray = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new roadmap node.
 * Computes path, ancestorIds, depth from parentNode automatically.
 *
 * @param {object} form       - Form data (validated by RoadmapNodeSchema)
 * @param {string} adminUid   - UID of the creating admin
 * @param {object|null} parentNode - Parent node document (null for root nodes)
 * @returns {Promise<string>} - Firestore document ID of the new node
 */
export async function createNode(form, adminUid, parentNode = null) {
  // Phase 7 implementation
  throw new Error('[roadmapService] createNode: Phase 7 not yet implemented');
}

/**
 * Update an existing roadmap node (structural fields — admin only).
 *
 * @param {string} nodeId   - Firestore document ID
 * @param {object} data     - Partial fields to update
 * @param {string} editorUid - UID of the editing admin
 * @returns {Promise<void>}
 */
export async function updateNode(nodeId, data, editorUid) {
  // Phase 7 implementation
  throw new Error('[roadmapService] updateNode: Phase 7 not yet implemented');
}

/**
 * Archive (soft-delete) a roadmap node by setting status = 'archived'.
 * Does NOT delete the document or its subcollections.
 *
 * @param {string} nodeId   - Firestore document ID
 * @param {string} adminUid - UID of the archiving admin
 * @returns {Promise<void>}
 */
export async function archiveNode(nodeId, adminUid) {
  // Phase 7 implementation
  throw new Error('[roadmapService] archiveNode: Phase 7 not yet implemented');
}

/**
 * Hard-delete a roadmap node.
 * BLOCKED if the node has children (childCount > 0).
 *
 * @param {string} nodeId - Firestore document ID
 * @returns {Promise<void>}
 */
export async function deleteNode(nodeId) {
  // Phase 7 implementation
  throw new Error('[roadmapService] deleteNode: Phase 7 not yet implemented');
}

// ─── Real-time Subscriptions ─────────────────────────────────────────────────

/**
 * Subscribe to direct children of a parent node.
 * Pass parentId = null to get root-level nodes.
 *
 * @param {string|null} parentId   - Parent node ID, or null for root nodes
 * @param {function} onData        - Callback with sorted children array
 * @param {function} [onError]     - Optional error callback
 * @returns {function} Firestore unsubscribe function
 */
export function subscribeToChildren(parentId, onData, onError) {
  // Phase 6 implementation — returns a no-op until then
  console.warn('[roadmapService] subscribeToChildren: Phase 6 not yet implemented');
  onData([]);
  return () => {};
}

/**
 * Subscribe to all descendants of an ancestor node (uses ancestorIds array-contains).
 *
 * @param {string} ancestorId  - Ancestor node ID
 * @param {function} onData    - Callback with all descendant nodes
 * @param {function} [onError] - Optional error callback
 * @returns {function} Firestore unsubscribe function
 */
export function subscribeToSubtree(ancestorId, onData, onError) {
  // Phase 6 implementation
  console.warn('[roadmapService] subscribeToSubtree: Phase 6 not yet implemented');
  onData([]);
  return () => {};
}

/**
 * Subscribe to a single roadmap node document.
 *
 * @param {string} nodeId      - Firestore document ID
 * @param {function} onData    - Callback with node data
 * @param {function} [onError] - Optional error callback
 * @returns {function} Firestore unsubscribe function
 */
export function subscribeToNode(nodeId, onData, onError) {
  // Phase 6 implementation
  console.warn('[roadmapService] subscribeToNode: Phase 6 not yet implemented');
  return () => {};
}

/**
 * Get roadmap nodes formatted as calendar events.
 * Applies dedup rule: leaf node + single matching task date = one entry.
 * Only depth 0/1 nodes synced to Google Calendar.
 *
 * @param {string}  uid     - Current user UID
 * @param {boolean} isAdmin - Whether current user is admin
 * @returns {Promise<Array>} Calendar event array
 */
export async function getRoadmapCalendarEvents(uid, isAdmin) {
  // Phase 7+15 implementation
  return [];
}
