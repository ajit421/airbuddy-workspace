import { useState, useEffect, useMemo } from 'react';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * useRoadmapKpi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time fetch on mount of all roadmap nodes + tasks.
 * ALL stats are derived client-side — only 2 Firestore fetches total.
 *
 * Returns:
 *   {
 *     nodes, tasks,
 *     stats: { totalNodes, completedNodes, completionPct, pendingNodes,
 *              inProgressNodes, blockedNodes, totalTasks, completedTasks,
 *              completedTaskPct, delayedTasks, upcomingTasks, criticalNodes },
 *     topContributors,   // [{uid, name, avatar, completedCount, totalCount}] top 5
 *     nodesByStatus,     // { pending, inProgress, completed, blocked }
 *     tasksByPriority,   // { low, medium, high, critical }
 *     recentActivity,    // top 5 nodes sorted by updatedAt desc
 *     upcomingDeadlines, // nodes with dueDate within next 7 days, sorted asc
 *     loading, error
 *   }
 *
 * Query cost: 1 read per active node + 1 read per roadmap task.
 * No real-time subscription — data refreshes on component remount.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function useRoadmapKpi() {
  const [nodes,   setNodes]   = useState([]);
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchAll = async () => {
      try {
        // ── 1. All active roadmap nodes ──────────────────────────────────────
        const nodesSnap = await getDocs(
          query(collection(db, 'roadmapNodes'), where('isArchived', '==', false))
        );
        const nodesData = nodesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // ── 2. All roadmap tasks via collectionGroup ──────────────────────────
        // Path filter: roadmapNodes/{nodeId}/tasks/{taskId} — 4 path segments
        let tasksData = [];
        try {
          const tasksSnap = await getDocs(collectionGroup(db, 'tasks'));
          tasksData = tasksSnap.docs
            .filter((d) => {
              const parts = d.ref.path.split('/');
              return parts[0] === 'roadmapNodes' && parts.length === 4;
            })
            .map((d) => ({ id: d.id, ...d.data() }));
        } catch (taskErr) {
          // Graceful fallback — index may not exist yet
          console.warn('[useRoadmapKpi] collectionGroup tasks:', taskErr.message);
        }

        if (!cancelled) {
          setNodes(nodesData);
          setTasks(tasksData);
        }
      } catch (err) {
        console.error('[useRoadmapKpi] fetch error:', err);
        if (!cancelled) setError(err.message ?? 'Failed to load roadmap analytics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Derived stats (useMemo — re-computes only when nodes/tasks change) ──────
  const stats = useMemo(() => {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const in7days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const totalNodes      = nodes.length;
    const completedNodes  = nodes.filter((n) => n.status === 'completed').length;
    const pendingNodes    = nodes.filter((n) => n.status === 'pending').length;
    const inProgressNodes = nodes.filter((n) => n.status === 'in-progress').length;
    const blockedNodes    = nodes.filter((n) => n.status === 'blocked').length;
    const completionPct   = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;
    const criticalNodes   = nodes.filter(
      (n) => n.status === 'blocked' || n.priority === 'critical'
    ).length;

    const totalTasks     = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const completedTaskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Delayed: dueDate < today AND not completed
    const delayedTasks = tasks.filter((t) => {
      if (t.status === 'completed') return false;
      const due = t.dueDate?.toDate?.() ?? (t.dueDate ? new Date(t.dueDate) : null);
      return due && due < today;
    }).length;

    // Upcoming: dueDate is within next 7 days (includes today)
    const upcomingTasks = tasks.filter((t) => {
      if (t.status === 'completed') return false;
      const due = t.dueDate?.toDate?.() ?? (t.dueDate ? new Date(t.dueDate) : null);
      return due && due >= today && due <= in7days;
    }).length;

    return {
      totalNodes, completedNodes, completionPct,
      pendingNodes, inProgressNodes, blockedNodes,
      totalTasks, completedTasks, completedTaskPct,
      delayedTasks, upcomingTasks, criticalNodes,
    };
  }, [nodes, tasks]);

  // ── Node status counts (for Doughnut chart) ──────────────────────────────
  const nodesByStatus = useMemo(() => ({
    pending:    nodes.filter((n) => n.status === 'pending').length,
    inProgress: nodes.filter((n) => n.status === 'in-progress').length,
    completed:  nodes.filter((n) => n.status === 'completed').length,
    blocked:    nodes.filter((n) => n.status === 'blocked').length,
  }), [nodes]);

  // ── Task priority counts (for Bar chart) ─────────────────────────────────
  const tasksByPriority = useMemo(() => ({
    critical: tasks.filter((t) => t.priority === 'critical').length,
    high:     tasks.filter((t) => t.priority === 'high').length,
    medium:   tasks.filter((t) => t.priority === 'medium').length,
    low:      tasks.filter((t) => t.priority === 'low').length,
  }), [tasks]);

  // ── Top contributors (top 5 by completed tasks) ───────────────────────────
  const topContributors = useMemo(() => {
    const uidStats = {}; // uid → { totalCount, completedCount }
    for (const task of tasks) {
      for (const uid of (task.assignedTo ?? [])) {
        if (!uidStats[uid]) uidStats[uid] = { totalCount: 0, completedCount: 0 };
        uidStats[uid].totalCount++;
        if (task.status === 'completed') uidStats[uid].completedCount++;
      }
    }
    return Object.entries(uidStats)
      .map(([uid, s]) => ({ uid, ...s }))
      .sort((a, b) => b.completedCount - a.completedCount)
      .slice(0, 5);
  }, [tasks]);

  // ── Recent activity (top 5 recently updated nodes) ───────────────────────
  const recentActivity = useMemo(() => {
    return [...nodes]
      .filter((n) => n.updatedAt)
      .sort((a, b) => {
        const ta = a.updatedAt?.toDate?.() ?? new Date(a.updatedAt);
        const tb = b.updatedAt?.toDate?.() ?? new Date(b.updatedAt);
        return tb - ta;
      })
      .slice(0, 5);
  }, [nodes]);

  // ── Upcoming deadlines (next 5 nodes by dueDate) ─────────────────────────
  const upcomingDeadlines = useMemo(() => {
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    const in14days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    return [...nodes]
      .filter((n) => {
        if (n.status === 'completed') return false;
        const due = n.dueDate?.toDate?.() ?? (n.dueDate ? new Date(n.dueDate) : null);
        return due && due >= today && due <= in14days;
      })
      .sort((a, b) => {
        const da = a.dueDate?.toDate?.() ?? new Date(a.dueDate);
        const db_ = b.dueDate?.toDate?.() ?? new Date(b.dueDate);
        return da - db_;
      })
      .slice(0, 5);
  }, [nodes]);

  return {
    nodes, tasks,
    stats,
    topContributors,
    nodesByStatus,
    tasksByPriority,
    recentActivity,
    upcomingDeadlines,
    loading,
    error,
  };
}
