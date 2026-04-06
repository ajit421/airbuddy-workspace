/**
 * useTaskTimeline.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Manages a real-time Firestore subscription to a task's `events/`
 *   subcollection. Handles loading state, error state, and cleanup.
 *
 * USAGE:
 *   const { events, loading, error } = useTaskTimeline(task.id);
 *
 * RULES:
 *   - Never imports from 'firebase/firestore' directly.
 *   - All Firestore access goes through collaborationService.subscribeToTimeline.
 *   - The subscription is torn down and restarted whenever taskId changes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { subscribeToTimeline } from '../services/collaborationService';

/**
 * Real-time hook for a task's collaboration timeline events.
 *
 * Events are returned in the order delivered by `subscribeToTimeline` —
 * that is, reverse-chronological (newest first), because the underlying
 * Firestore query uses `orderBy('createdAt', 'desc')`.
 *
 * @param {string | null | undefined} taskId
 *   Firestore task document ID. Passing `null` or `undefined` is safe —
 *   the hook will immediately set `loading = false` and return an empty array.
 *
 * @returns {{
 *   events:  Array<{
 *     id:           string,
 *     type:         'partner_added' | 'status_changed' | 'progress_updated' | 'commit',
 *     authorUid:    string,
 *     authorName:   string,
 *     authorAvatar: string,
 *     message:      string,
 *     metadata:     object,
 *     createdAt:    Date | null
 *   }>,
 *   loading: boolean,
 *   error:   string | null
 * }}
 */
export function useTaskTimeline(taskId) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    // Guard: no taskId means nothing to subscribe to
    if (!taskId) {
      setEvents([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Reset state when taskId changes so the previous task's events
    // don't flash briefly while the new subscription is loading
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToTimeline(
      taskId,
      // ── Success callback ──────────────────────────────────────────────────
      (newEvents) => {
        setEvents(newEvents);
        setLoading(false);
      },
      // ── Error callback ────────────────────────────────────────────────────
      (err) => {
        console.error('[useTaskTimeline] Snapshot error:', err);
        setError('Could not load timeline. Please try again.');
        setLoading(false);
      }
    );

    // Tear down the listener when taskId changes or the component unmounts
    return unsubscribe;
  }, [taskId]);

  return { events, loading, error };
}
