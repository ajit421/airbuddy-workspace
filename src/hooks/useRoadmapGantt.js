import { useState, useEffect, useMemo } from 'react';
import { subscribeToAllNodes } from '../services/roadmapService';
import { subscribeToAllUsers } from '../services/teamMembersService';
import { buildGanttRows } from '../utils/ganttHelpers';
import { toLocalDateString } from '../utils/dateHelpers';

/**
 * useRoadmapGantt.js
 * The whole roadmap tree as Gantt rows, plus uid -> name for the owner column
 * and the export.
 *
 * Mounted only by RoadmapGanttView, so the all-nodes listener runs while the
 * Gantt is on screen and not on every roadmap visit (List and Journey load
 * lazily, branch by branch).
 *
 * @returns {{ rows, userNames, today, loading, error }}
 */
export function useRoadmapGantt() {
  const [nodes, setNodes]     = useState([]);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const unsub = subscribeToAllNodes(
      (data) => {
        setNodes(data);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    // Names are a nicety: on failure the owner column falls back to uids.
    const unsub = subscribeToAllUsers(setUsers, (err) =>
      console.error('[useRoadmapGantt] subscribeToAllUsers:', err));
    return unsub;
  }, []);

  const today = toLocalDateString();

  const rows = useMemo(() => buildGanttRows(nodes, { today }), [nodes, today]);

  const userNames = useMemo(
    () => new Map(users.map((u) => [u.uid, u.name || u.email || u.uid])),
    [users]
  );

  return { rows, userNames, today, loading, error };
}
