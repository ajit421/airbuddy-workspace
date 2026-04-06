/**
 * useTeamMembers.js
 * Custom hook for the Team Members page.
 *
 * Responsibilities:
 *  - Maintains a real-time list of all users via subscribeToAllUsers().
 *  - Merges synchronous task stats (from TaskContext) into each user object.
 *  - Exposes refreshAttendance(uid) for lazy attendance fetching — called only
 *    when a profile card is opened, NOT for every member on mount.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '../context/TaskContext';
import {
  subscribeToAllUsers,
  getUserAttendanceSummary,
  getUserTaskStats,
} from '../services/teamMembersService';

/**
 * @returns {{
 *   members:           Array<Object>,  // real-time user list with merged task stats
 *   loading:           boolean,
 *   error:             string | null,
 *   refreshAttendance: (uid: string) => Promise<void>
 * }}
 */
export function useTeamMembers() {
  const { tasks: allTasks } = useTasks();

  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState(null);

  // ─── Real-time user listener + task-stats merge ──────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToAllUsers(
      (users) => {
        // Merge synchronous task stats into each user object.
        // getUserTaskStats() is pure and works on the already-loaded allTasks
        // array from TaskContext — zero extra Firestore reads.
        const merged = users.map((user) => ({
          ...user,
          taskStats: getUserTaskStats(user.uid, allTasks),
          // attendanceSummary starts null; populated lazily via refreshAttendance()
          attendanceSummary: null,
        }));

        setMembers(merged);
        setLoading(false);
      },
      (firestoreError) => {
        // Surface the error to the UI so TeamMembers can show an error banner
        console.error('[useTeamMembers] Firestore listener error:', firestoreError);
        setError('Could not load team members. Please refresh the page.');
        setLoading(false);
      }
    );

    // Cleanup: detach the Firestore listener when the component unmounts
    return () => unsubscribe();
    // NOTE: allTasks is intentionally excluded from deps so the snapshot
    // listener is only registered once. Task stats are re-merged below in a
    // separate effect whenever allTasks changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Re-merge task stats when TaskContext data updates ───────────────────
  // This runs after the initial mount effect above, so `members` is already
  // populated. We only run it when allTasks actually changes so we don't
  // spam re-renders on unrelated state updates.
  useEffect(() => {
    if (members.length === 0) return;

    setMembers((prev) =>
      prev.map((member) => ({
        ...member,
        taskStats: getUserTaskStats(member.uid, allTasks),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks]);

  // ─── Lazy attendance fetcher ─────────────────────────────────────────────
  /**
   * Fetches attendance summary for ONE user and patches it into the members
   * array. Call this when a profile card is opened — NOT on mount — to avoid
   * issuing one Firestore read per team member on every page load.
   *
   * @param {string} uid - UID of the member whose card was opened.
   */
  const refreshAttendance = useCallback(async (uid) => {
    try {
      const attendanceSummary = await getUserAttendanceSummary(uid);
      setMembers((prev) =>
        prev.map((member) =>
          member.uid === uid ? { ...member, attendanceSummary } : member
        )
      );
    } catch (err) {
      console.error(`[useTeamMembers] refreshAttendance failed for uid "${uid}":`, err);
    }
  }, []);

  return { members, loading, error, refreshAttendance };
}
