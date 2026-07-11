/**
 * useTeamMembers.js
 * Custom hook for the Team Members page.
 *
 * Responsibilities:
 *  - Maintains a real-time list of all users via subscribeToAllUsers().
 *  - Merges synchronous task stats (from TaskContext) into each user object
 *    via useMemo — atomically, no double render (ME-7 fix).
 *  - Exposes refreshAttendance(uid) for lazy attendance fetching — called only
 *    when a profile card is opened, NOT for every member on mount.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
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

  // ME-7 fix: raw users from Firestore stored separately so that task stat
  // merging can happen in useMemo without a second setState call.
  const [rawUsers, setRawUsers]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error,   setError]             = useState(null);
  // Per-user attendance summaries — populated lazily on card open
  const [attendanceMap, setAttendanceMap] = useState({});

  // ─── Real-time user listener ──────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToAllUsers(
      (users) => {
        setRawUsers(users);
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
  }, []);

  // ─── ME-7 fix: merge task stats + attendance via useMemo ─────────────────
  // Previously two sequential useEffect hooks caused two renders per task update:
  //   1. Firestore snapshot → setMembers(with old task stats)   [render 1]
  //   2. allTasks effect   → setMembers(with new task stats)    [render 2]
  // Now: rawUsers (from Firestore) + allTasks (from TaskContext) + attendanceMap
  // are merged here in a single synchronous useMemo — zero extra renders per
  // task update. React computes this atomically within the same render cycle.
  const members = useMemo(
    () =>
      rawUsers.map((user) => ({
        ...user,
        taskStats:         getUserTaskStats(user.uid, allTasks),
        attendanceSummary: attendanceMap[user.uid] ?? null,
      })),
    [rawUsers, allTasks, attendanceMap]
  );

  // ─── Lazy attendance fetcher ──────────────────────────────────────────────
  /**
   * Fetches attendance summary for ONE user and patches it into attendanceMap.
   * Call this when a profile card is opened — NOT on mount — to avoid
   * issuing one Firestore read per team member on every page load.
   *
   * @param {string} uid - UID of the member whose card was opened.
   */
  const refreshAttendance = useCallback(async (uid) => {
    try {
      const attendanceSummary = await getUserAttendanceSummary(uid);
      setAttendanceMap((prev) => ({ ...prev, [uid]: attendanceSummary }));
    } catch (err) {
      console.error(`[useTeamMembers] refreshAttendance failed for uid "${uid}":`, err);
    }
  }, []);

  return { members, loading, error, refreshAttendance };
}
