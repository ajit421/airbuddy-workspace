/**
 * roadmapHistoryService.js — Phase 17
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only data access layer for roadmapNodes/{nodeId}/history subcollection.
 *
 * Firestore path: roadmapNodes/{nodeId}/history/{historyId}
 *
 * Document shape (written by Cloud Functions — never by this service):
 *   {
 *     action:              string   // 'created'|'updated'|'archived'|'deleted'|
 *                                  // 'task_created'|'task_updated'|'task_deleted'
 *     changedBy:           string   // effectiveUid or 'system'
 *     changedFields:       Array<{ field, previousValue, newValue }>
 *     systemChangedFields: Array<{ field, newValue }>  // rollup fields only
 *     entityType:          string   // 'node' | 'task'
 *     taskId?:             string   // present when entityType === 'task'
 *     taskTitle?:          string
 *     nodeTitle?:          string
 *     timestamp:           Timestamp
 *   }
 *
 * Permissions:
 *   - Read:  All whitelisted authenticated users (Phase 9 rule: allow read).
 *   - Write: BLOCKED for all clients (Phase 9 rule: allow write: if false).
 *            Cloud Functions write via Admin SDK, bypassing this rule.
 *
 * Rules:
 *  - No write functions exist in this service.
 *  - subscribeToX(onData, onError) pattern returning unsubscribe fn.
 *  - Error prefix: [roadmapHistoryService] functionName: in console.error
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from './firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
} from 'firebase/firestore';

const ROADMAP_NODES_COL = 'roadmapNodes';
const HISTORY_SUBCOL    = 'history';
const DEFAULT_PAGE_SIZE = 20;

// ─── Collection path helper ───────────────────────────────────────────────────
const historyCol = (nodeId) =>
  collection(db, ROADMAP_NODES_COL, nodeId, HISTORY_SUBCOL);

// ─── Timestamp normaliser ─────────────────────────────────────────────────────
const normEntry = (d) => ({
  id: d.id,
  ...d.data(),
  // Normalise Firestore Timestamp → JS Date so relative-time utils work
  timestamp: d.data().timestamp?.toDate?.() ?? new Date(),
});

// ─── 1. subscribeToNodeHistory ────────────────────────────────────────────────
/**
 * Real-time subscription to the most-recent `pageSize` history entries
 * for a roadmap node. Ordered newest-first.
 *
 * Use this for the initial load of the History tab. For paginated "load more",
 * use getNodeHistoryPage().
 *
 * @param {string}   nodeId
 * @param {function} onData    - Called with history entry array (newest first)
 * @param {function} [onError]
 * @param {number}   [pageSize=20]
 * @returns {function} unsubscribe
 */
export function subscribeToNodeHistory(nodeId, onData, onError, pageSize = DEFAULT_PAGE_SIZE) {
  if (!nodeId) {
    onData([]);
    return () => {};
  }

  const q = query(
    historyCol(nodeId),
    orderBy('timestamp', 'desc'),
    limit(pageSize),
  );

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(normEntry)),
    (err) => {
      console.error('[roadmapHistoryService] subscribeToNodeHistory:', err);
      if (onError) onError(err);
    }
  );
}

// ─── 2. getNodeHistoryPage ────────────────────────────────────────────────────
/**
 * One-time paginated fetch — use for "Load more" pagination.
 * Pass the last document snapshot from the previous page as `lastDoc`.
 *
 * @param {string}             nodeId
 * @param {QueryDocumentSnapshot|null} lastDoc  - Last doc from previous page
 * @param {number}             [pageSize=20]
 * @returns {Promise<{ entries: Array, lastDoc: QueryDocumentSnapshot|null, hasMore: boolean }>}
 */
export async function getNodeHistoryPage(nodeId, lastDoc = null, pageSize = DEFAULT_PAGE_SIZE) {
  if (!nodeId) return { entries: [], lastDoc: null, hasMore: false };

  try {
    let q = query(
      historyCol(nodeId),
      orderBy('timestamp', 'desc'),
      limit(pageSize + 1),   // fetch one extra to detect hasMore
    );

    if (lastDoc) {
      q = query(
        historyCol(nodeId),
        orderBy('timestamp', 'desc'),
        startAfter(lastDoc),
        limit(pageSize + 1),
      );
    }

    const snap    = await getDocs(q);
    const hasMore = snap.docs.length > pageSize;
    const docs    = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    return {
      entries: docs.map(normEntry),
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hasMore,
    };
  } catch (err) {
    console.error('[roadmapHistoryService] getNodeHistoryPage:', err);
    throw err;
  }
}
