/**
 * collaborationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   All Firestore reads/writes for Work Partner assignment and the GitHub-style
 *   collaboration timeline. This is the ONLY file that touches the following
 *   Firestore paths:
 *     - tasks/{taskId}          (workPartners + workPartnerUids fields only)
 *     - tasks/{taskId}/events/  (full CRUD)
 *
 * DUAL-ARRAY PATTERN — MANDATORY:
 *   Firestore security rules cannot filter into an array-of-maps by a single
 *   sub-field (e.g. workPartners[].uid). To work around this, we maintain two
 *   parallel fields on every task document:
 *
 *     workPartners    : Array<{ uid, name, avatar, addedBy, addedByName, addedAt }>
 *                       Rich object array — consumed by UI components.
 *
 *     workPartnerUids : string[]
 *                       Flat UID array — used ONLY by Firestore security rules
 *                       (request.auth.uid in resource.data.workPartnerUids).
 *                       Never render this in the UI; always read from workPartners.
 *
 *   Both fields MUST be updated atomically in the same updateDoc call.
 *   Add    → arrayUnion on both fields.
 *   Remove → replace both fields with filtered arrays (arrayRemove is unreliable
 *             for object equality in arrays-of-maps).
 *
 * RULES:
 *   - No React imports — pure data/service layer.
 *   - Every async function wraps its body in try/catch and rethrows.
 *   - serverTimestamp() is used for all Timestamps written to Firestore.
 *   - Components never import from 'firebase/firestore' directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from './firebase';
import { workItemCollection, workItemId } from '../utils/workItemRef';
import {
  doc,
  collection,
  addDoc,
  updateDoc,
  arrayUnion,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Collection / doc helpers ─────────────────────────────────────────────────

/** Reference to a task document. */
/**
 * References to the work item that owns the partners and timeline.
 *
 * These take `task` — the work item object, not just its id — so a roadmap
 * milestone (`roadmapNodes/{id}`, tagged `_source: 'roadmapNode'`) gets the
 * same work partners and activity feed as an ordinary task. A bare id string
 * still resolves to `tasks`, keeping older callers working.
 */
const taskDoc = (task) => doc(db, workItemCollection(task), workItemId(task));

/** Reference to the events sub-collection for a task. */
const eventsCol = (task) => collection(db, workItemCollection(task), workItemId(task), 'events');

// ─── 1. addWorkPartner ────────────────────────────────────────────────────────

/**
 * Adds a new Work Partner to a task. Atomically updates both the rich
 * `workPartners` object array and the `workPartnerUids` flat string array so
 * that Firestore security rules remain valid.
 *
 * After the Firestore write succeeds, immediately posts a `partner_added`
 * timeline event so the change is reflected in the collaboration feed.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Firestore task document ID.
 * @param {{ uid: string, name: string, avatar?: string }} newPartner
 *   The user being added as a work partner.
 * @param {{ uid: string, name: string, avatar?: string }} addedByUser
 *   The currently authenticated user performing the add action.
 * @returns {Promise<void>}
 * @throws Will rethrow any Firestore error so the calling component can handle it.
 */
export async function addWorkPartner(task, newPartner, addedByUser) {
  // ── Build the rich partner object written to workPartners[] ──────────────
  const partnerObject = {
    uid:         newPartner.uid,
    name:        newPartner.name,
    avatar:      newPartner.avatar || '',
    addedBy:     addedByUser.uid,
    addedByName: addedByUser.name,
    addedAt:     new Date().toISOString(),
  };

  try {
    // ── Step 1: Atomically update both parallel arrays ─────────────────────
    // arrayUnion is safe here: the partner object is new (caller should guard
    // against duplicates before calling this function).
    await updateDoc(taskDoc(task), {
      workPartners:    arrayUnion(partnerObject),   // rich array — UI reads this
      workPartnerUids: arrayUnion(newPartner.uid),  // flat array — rules read this
      updatedAt:       serverTimestamp(),
    });

    // ── Step 2: Post a timeline event for the addition ────────────────────
    await addTimelineEvent(task, {
      type:         'partner_added',
      authorUid:    addedByUser.uid,
      authorName:   addedByUser.name,
      authorAvatar: addedByUser.avatar || '',
      message:      `${addedByUser.name} added ${newPartner.name} as a Work Partner.`,
      metadata: {
        targetUid:  newPartner.uid,
        targetName: newPartner.name,
      },
    });
  } catch (error) {
    console.error(`[collaborationService] addWorkPartner failed (task: ${workItemCollection(task)}/${workItemId(task)}):`, error);
    throw error;
  }
}

// ─── 2. removeWorkPartner ─────────────────────────────────────────────────────

/**
 * Removes a Work Partner from a task. Replaces BOTH parallel arrays with
 * filtered copies. We do NOT use arrayRemove for the object array because
 * Firestore's arrayRemove relies on deep-equality of the object, which fails
 * when the stored object contains a Firestore Timestamp (non-serialisable).
 *
 * No timeline event is posted for removals — only additions are recorded.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Firestore task document ID.
 * @param {string} partnerUid
 *   UID of the Work Partner to remove.
 * @param {Array<{ uid: string, [key: string]: any }>} currentWorkPartners
 *   Current `workPartners` array from the live task document (used to build
 *   the replacement array — avoids a redundant getDoc call).
 * @returns {Promise<void>}
 * @throws Will rethrow any Firestore error so the calling component can handle it.
 */
export async function removeWorkPartner(task, partnerUid, currentWorkPartners) {
  try {
    // Filter the rich array — both arrays derive from this single source of truth
    const updatedPartners    = (currentWorkPartners || []).filter((p) => p.uid !== partnerUid);
    const updatedPartnerUids = updatedPartners.map((p) => p.uid);

    // Replace both arrays atomically in one updateDoc call
    await updateDoc(taskDoc(task), {
      workPartners:    updatedPartners,      // rich array without the removed partner
      workPartnerUids: updatedPartnerUids,   // flat array kept in sync
      updatedAt:       serverTimestamp(),
    });
  } catch (error) {
    console.error(`[collaborationService] removeWorkPartner failed (task: ${workItemCollection(task)}/${workItemId(task)}, partner: ${partnerUid}):`, error);
    throw error;
  }
}

// ─── 3. addTimelineEvent (internal + exported for system events) ──────────────

/**
 * Writes a single timeline event document to `tasks/{taskId}/events/`.
 * This is the core primitive used by all other functions in this service.
 * It is also exported so that `taskService.js` can post system events
 * (status_changed, progress_updated) from the progress-save flow.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Parent task document ID.
 * @param {{
 *   type:         'partner_added' | 'status_changed' | 'progress_updated' | 'commit',
 *   authorUid:    string,
 *   authorName:   string,
 *   authorAvatar: string,
 *   message:      string,
 *   metadata:     object
 * }} eventData
 *   Event payload. `createdAt` is injected by this function — do NOT pass it.
 * @returns {Promise<import('firebase/firestore').DocumentReference>}
 *   The DocumentReference of the newly created event.
 * @throws Will rethrow any Firestore error.
 */
export async function addTimelineEvent(task, eventData) {
  const fullEventDoc = {
    ...eventData,
    createdAt: serverTimestamp(), // server-side timestamp for consistent ordering
  };

  try {
    const ref = await addDoc(eventsCol(task), fullEventDoc);
    return ref;
  } catch (error) {
    console.error(`[collaborationService] addTimelineEvent failed (task: ${workItemCollection(task)}/${workItemId(task)}, type: ${eventData?.type}):`, error);
    throw error;
  }
}

// ─── 4. subscribeToTimeline ───────────────────────────────────────────────────

/**
 * Sets up a real-time `onSnapshot` listener on `tasks/{taskId}/events/`.
 * Events are ordered by `createdAt` descending (newest first) at the
 * Firestore query level. The snapshot handler normalises Timestamps so
 * that `timeFromNow()` and `formatDate()` in the UI work without extra
 * conversion.
 *
 * Firestore note: `orderBy('createdAt', 'desc')` requires the `createdAt`
 * field to exist on every document — this is guaranteed because addTimelineEvent
 * always injects `serverTimestamp()`. No composite index is needed because
 * we use a single orderBy with no where() clause.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Parent task document ID.
 * @param {(events: Array<object>) => void} callback
 *   Called with the mapped event array every time Firestore data changes.
 * @param {(error: Error) => void} [onError]
 *   Optional error handler — called if the snapshot listener encounters a
 *   permissions or network error.
 * @returns {() => void} Unsubscribe function — call in useEffect cleanup.
 */
export function subscribeToTimeline(task, callback, onError) {
  if (!task) {
    // Guard: if task is undefined (e.g. new task not yet saved), return a no-op.
    callback([]);
    return () => {};
  }

  const q = query(eventsCol(task), orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          // Normalise Firestore Timestamp → JS Date so dateHelpers work seamlessly.
          // Pending serverTimestamp() writes come back as null until the server
          // round-trip completes; fall back to new Date() so timeFromNow() always
          // receives a valid Date object and never renders an empty string.
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
        };
      });
      callback(events);
    },
    (error) => {
      console.error(`[collaborationService] subscribeToTimeline error (task: ${workItemCollection(task)}/${workItemId(task)}):`, error);
      if (typeof onError === 'function') onError(error);
    }
  );

  return unsubscribe;
}

// ─── 5. postCommit ────────────────────────────────────────────────────────────

/**
 * Posts a manual commit event to the task timeline. Any task participant
 * (assignee, creator, or work partner) can post a commit.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Firestore task document ID.
 * @param {{ uid: string, name: string, avatar?: string }} author
 *   Currently authenticated user (from `useAuth().userProfile`).
 * @param {string} message
 *   Commit message text. Must be non-empty after trimming.
 * @param {string|null} [driveLink]
 *   Optional Google Drive / attachment URL.
 * @param {string|null} [driveLinkLabel]
 *   Optional human-readable label for the drive link displayed in the UI.
 * @returns {Promise<void>}
 * @throws {Error} If message is empty. Rethrows Firestore errors.
 */
export async function postCommit(task, author, message, driveLink = null, driveLinkLabel = null) {
  const trimmedMessage = (message || '').trim();
  if (!trimmedMessage) {
    throw new Error('Commit message cannot be empty.');
  }

  const metadata = {
    driveLink:      driveLink      || null,
    driveLinkLabel: driveLinkLabel || null,
  };

  try {
    await addTimelineEvent(task, {
      type:         'commit',
      authorUid:    author.uid,
      authorName:   author.name,
      authorAvatar: author.avatar || '',
      message:      trimmedMessage,
      metadata,
    });
  } catch (error) {
    console.error(`[collaborationService] postCommit failed (task: ${workItemCollection(task)}/${workItemId(task)}):`, error);
    throw error;
  }
}

// ─── 6. checkCanAddPartner ────────────────────────────────────────────────────

/**
 * Pure synchronous check — no Firebase call.
 * Determines whether the current user is allowed to add a Work Partner to
 * a task. The admin case is handled separately at component level via
 * `isAdmin` from `useAuth()`.
 *
 * Permission rules (any ONE is sufficient):
 *   1. User is the task creator (`createdBy`).
 *   2. User is an admin-assigned assignee (`assignedTo` array).
 *   3. User is already a Work Partner (`workPartners` array) — the recursive rule
 *      that allows partners to invite new partners.
 *
 * @param {object} task
 *   Task object from Firestore / TaskContext. Must contain `createdBy`,
 *   `assignedTo`, and `workPartners` fields.
 * @param {string} currentUserUid
 *   UID of the currently authenticated user.
 * @returns {boolean}
 */
export const checkCanAddPartner = (task, currentUserUid) => {
  if (!task || !currentUserUid) return false;

  const isCreator         = task.createdBy === currentUserUid;
  const isAssignee        = Array.isArray(task.assignedTo) && task.assignedTo.includes(currentUserUid);
  // Recursive rule: existing partners can also invite new partners
  const isExistingPartner = Array.isArray(task.workPartners) &&
    task.workPartners.some((p) => p.uid === currentUserUid);

  return isCreator || isAssignee || isExistingPartner;
};

// ─── 7. recordStatusChange ────────────────────────────────────────────────────

/**
 * Convenience wrapper that posts a `status_changed` timeline event.
 * Called by `taskService.updateTaskProgress` when the derived status
 * changes (e.g. pending → in-progress, in-progress → completed).
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Firestore task document ID.
 * @param {{ uid: string, name: string, avatar?: string }} author
 *   The user who triggered the status change.
 * @param {string} fromStatus
 *   The status value before the change (e.g. `"pending"`).
 * @param {string} toStatus
 *   The status value after the change (e.g. `"in-progress"`).
 * @returns {Promise<void>}
 * @throws Will rethrow any Firestore error.
 */
export async function recordStatusChange(task, author, fromStatus, toStatus) {
  const message = `Status changed from "${fromStatus}" to "${toStatus}".`;

  try {
    await addTimelineEvent(task, {
      type:         'status_changed',
      authorUid:    author.uid,
      authorName:   author.name,
      authorAvatar: author.avatar || '',
      message,
      metadata: { fromStatus, toStatus },
    });
  } catch (error) {
    console.error(`[collaborationService] recordStatusChange failed (task: ${workItemCollection(task)}/${workItemId(task)}):`, error);
    throw error;
  }
}

// ─── 8. recordProgressUpdate ──────────────────────────────────────────────────

/**
 * Convenience wrapper that posts a `progress_updated` timeline event.
 * Called by `taskService.updateTaskProgress` after a successful progress save.
 *
 * THROTTLE: Only posts if the absolute delta is ≥ 10 percentage points.
 * This prevents noisy micro-updates (e.g. 41% → 42%) from flooding the timeline.
 *
 * @param {object|string} task - Work item (or a bare task id)
 *   Firestore task document ID.
 * @param {{ uid: string, name: string, avatar?: string }} author
 *   The user who updated the progress.
 * @param {number} fromProgress
 *   Progress value before the save (0–100).
 * @param {number} toProgress
 *   Progress value after the save (0–100).
 * @returns {Promise<void>} Resolves immediately (no-op) if delta < 10.
 * @throws Will rethrow any Firestore error.
 */
export async function recordProgressUpdate(task, author, fromProgress, toProgress) {
  // Throttle: skip small incremental updates to keep the timeline readable
  if (Math.abs(toProgress - fromProgress) < 10) return;

  const message = `Progress updated from ${fromProgress}% to ${toProgress}%.`;

  try {
    await addTimelineEvent(task, {
      type:         'progress_updated',
      authorUid:    author.uid,
      authorName:   author.name,
      authorAvatar: author.avatar || '',
      message,
      metadata: { fromProgress, toProgress },
    });
  } catch (error) {
    console.error(`[collaborationService] recordProgressUpdate failed (task: ${workItemCollection(task)}/${workItemId(task)}):`, error);
    throw error;
  }
}
