/**
 * roadmapCommentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for roadmapNodes/{nodeId}/comments subcollection.
 * Follows collaborationService.js conventions exactly.
 *
 * Firestore path: roadmapNodes/{nodeId}/comments/{commentId}
 * Document shape:
 *   { text, authorUid, authorName, authorAvatar, createdAt }
 *
 * Permissions:
 *   - Any authenticated user can post a comment.
 *   - Users can delete their own comments (authorUid === uid).
 *   - Admins can delete any comment.
 *   - Firestore Rules (Phase 9) enforce this server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

// ─── Collection helper ────────────────────────────────────────────────────────
const commentsCol = (nodeId) =>
  collection(db, 'roadmapNodes', nodeId, 'comments');

// ─── 1. subscribeToComments ──────────────────────────────────────────────────
/**
 * Real-time listener on roadmapNodes/{nodeId}/comments, ordered oldest-first.
 *
 * @param {string}   nodeId
 * @param {function} onData   - Called with comment array (oldest first)
 * @param {function} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToComments(nodeId, onData, onError) {
  if (!nodeId) {
    onData([]);
    return () => {};
  }

  const q = query(commentsCol(nodeId), orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const comments = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        // Normalise Timestamp → JS Date so timeFromNow() works without conversion
        createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
      }));
      onData(comments);
    },
    (err) => {
      console.error('[roadmapCommentService] subscribeToComments:', err);
      if (onError) onError(err);
    }
  );
}

// ─── 2. postComment ───────────────────────────────────────────────────────────
/**
 * Posts a new comment on a roadmap node.
 * Open to all authenticated users (no admin check).
 *
 * @param {string} nodeId
 * @param {string} text       - Comment body. Must be non-empty after trimming.
 * @param {{ uid: string, name: string, avatar?: string }} author
 * @returns {Promise<string>} New comment document ID
 * @throws {Error} If text is empty or Firestore write fails.
 */
export async function postComment(nodeId, text, author) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('Comment cannot be empty.');
  if (!nodeId)  throw new Error('[roadmapCommentService] postComment: nodeId is required');

  try {
    const ref = await addDoc(commentsCol(nodeId), {
      text:         trimmed,
      authorUid:    author.uid,
      authorName:   author.name   ?? 'Unknown',
      authorAvatar: author.avatar ?? '',
      createdAt:    serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    console.error('[roadmapCommentService] postComment:', err);
    throw err;
  }
}

// ─── 3. deleteComment ─────────────────────────────────────────────────────────
/**
 * Deletes a comment document.
 * Caller must check permissions before calling (own comment or admin).
 * Firestore Rules enforce this server-side.
 *
 * @param {string} nodeId
 * @param {string} commentId
 * @returns {Promise<void>}
 */
export async function deleteComment(nodeId, commentId) {
  if (!nodeId || !commentId)
    throw new Error('[roadmapCommentService] deleteComment: nodeId and commentId are required');

  try {
    await deleteDoc(doc(db, 'roadmapNodes', nodeId, 'comments', commentId));
  } catch (err) {
    console.error('[roadmapCommentService] deleteComment:', err);
    throw err;
  }
}
