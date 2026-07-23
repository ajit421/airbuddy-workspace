import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, collectionGroup, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { getRoadmapCalendarEvents } from '../services/roadmapService';

/**
 * useRoadmapCalendarEvents.js
 * ─────────────────────────────────────────────────────────────────
 * Subscribes to ALL non-archived roadmap nodes AND all roadmap tasks
 * via collectionGroup, then computes calendar events with dedup logic.
 *
 * Returns:
 *   {
 *     roadmapEvents  : CalendarEvent[]     — events to add to CalendarView
 *     dedupTaskIds   : Set<string>         — task IDs to suppress from taskEvents
 *     roadmapLoading : boolean             — true while either query is loading
 *   }
 *
 * Notes:
 *  - collectionGroup('tasks') requires the `nodeId` index that was created in
 *    Phase 7. If the index doesn't exist yet, Firestore will log a URL to create
 *    it; the hook falls back gracefully with an empty tasks array.
 *  - Both subscriptions are cleaned up on unmount.
 * ─────────────────────────────────────────────────────────────────
 */
export function useRoadmapCalendarEvents() {
  const [nodes,        setNodes]        = useState([]);
  const [tasks,        setTasks]        = useState([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);

  const unsubNodesRef = useRef(null);

  // ── Subscribe to all non-archived nodes ──────────────────────────────────
  useEffect(() => {
    setNodesLoading(true);
    const q = query(
      collection(db, 'roadmapNodes'),
      where('isArchived', '==', false)
    );
    unsubNodesRef.current = onSnapshot(
      q,
      (snap) => {
        setNodes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setNodesLoading(false);
      },
      (err) => {
        console.error('[useRoadmapCalendarEvents] nodes:', err);
        setNodesLoading(false);
      }
    );
    return () => { unsubNodesRef.current?.(); };
  }, []);

  // ── Subscribe to all roadmap tasks (collectionGroup) ──────────────────────
  useEffect(() => {
    setTasksLoading(true);
    let unsub;
    try {
      const q = query(collectionGroup(db, 'tasks'));
      unsub = onSnapshot(
        q,
        (snap) => {
          // collectionGroup('tasks') may include tasks from other subcollections
          // if any exist. Filter to only tasks that live under roadmapNodes.
          const roadmapTasks = snap.docs
            .filter((d) => {
              // Path: roadmapNodes/{nodeId}/tasks/{taskId}
              const pathParts = d.ref.path.split('/');
              return pathParts[0] === 'roadmapNodes' && pathParts.length === 4;
            })
            .map((d) => ({ id: d.id, ...d.data() }));
          setTasks(roadmapTasks);
          setTasksLoading(false);
        },
        (err) => {
          // Graceful fallback: index may not exist yet — empty array is safe
          console.warn('[useRoadmapCalendarEvents] tasks collectionGroup:', err.message);
          setTasks([]);
          setTasksLoading(false);
        }
      );
    } catch (err) {
      console.warn('[useRoadmapCalendarEvents] collectionGroup setup:', err.message);
      setTasks([]);
      setTasksLoading(false);
    }
    return () => { unsub?.(); };
  }, []);

  // ── Compute deduped calendar events whenever data changes ─────────────────
  const { roadmapEvents, dedupTaskIds } = useMemo(
    () => getRoadmapCalendarEvents(nodes, tasks),
    [nodes, tasks]
  );

  return {
    roadmapEvents,
    dedupTaskIds,
    roadmapLoading: nodesLoading || tasksLoading,
  };
}
