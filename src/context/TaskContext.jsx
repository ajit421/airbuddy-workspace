import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, collectionGroup, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';
import { subscribeToAssignedNodes, subscribeToAllAssignedNodes } from '../services/roadmapService';

const TaskContext = createContext(null);

export const TaskProvider = ({ children }) => {
  const { user, isAdmin, effectiveUid } = useAuth();
  const [allTasks, setAllTasks] = useState([]);
  const [allUsers, setAllUsers] = useState({});
  const [loading, setLoading] = useState(true);

  // ME-3 fix: separate state slices for each employee query (no shared mutable Map)
  // Each slice is independently updated by its own onSnapshot callback.
  // The merge happens in useMemo below — atomically, without clear() races.
  const [assignedTasks, setAssignedTasks] = useState(null); // null = not yet received
  const [partnerTasks,  setPartnerTasks]  = useState(null);
  const [roadmapAssignedTasks, setRoadmapAssignedTasks] = useState(null);

  // Roadmap milestones (roadmapNodes docs) assigned to this user, projected into
  // task shape. Kept in its own slice and exposed separately rather than merged
  // into `tasks`: the Calendar already draws every milestone through
  // useRoadmapCalendarEvents, so folding these into `tasks` would render each
  // assigned milestone twice there, and the Team page derives per-person task
  // stats from `tasks` — which would then count milestones for the viewer only.
  // The Dashboard does the merge explicitly instead.
  const [assignedNodes, setAssignedNodes] = useState([]);

  useEffect(() => {
    if (!user || !effectiveUid) {
      setAllTasks([]);
      setAllUsers({});
      setAssignedTasks(null);
      setPartnerTasks(null);
      setRoadmapAssignedTasks(null);
      setAssignedNodes([]);
      setLoading(false);
      return;
    }

    // Fetch all users to map UIDs to names
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const usersMap = {};
      snap.docs.forEach(d => {
        usersMap[d.id] = d.data();
      });
      setAllUsers(usersMap);
    });

    let unsubTasks = () => {};

    // Roadmap milestones — `assignedTo` on a roadmapNode is a real work
    // assignment, and nothing on the task path can see it.
    //
    // Scoped exactly like the `tasks` query below it: an employee gets their own
    // milestones, an admin gets every assigned one. The admin breadth is not
    // cosmetic — the Dashboard's admin-only employee filter narrows the viewer's
    // own list by `assignedTo`, so with a viewer-scoped listener, filtering by a
    // teammate showed nothing because their milestones were never loaded.
    const onNodes = (nodes) => setAssignedNodes(nodes);
    const onNodesError = (err) => {
      console.error('Roadmap node listener (assignedTo) error:', err);
      setAssignedNodes([]);
    };
    const unsubAssignedNodes = isAdmin
      ? subscribeToAllAssignedNodes(onNodes, onNodesError)
      : subscribeToAssignedNodes(effectiveUid, onNodes, onNodesError);

    if (isAdmin) {
      // Admin: fetch all tasks
      const adminQuery = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
      unsubTasks = onSnapshot(adminQuery, (snap) => {
        const taskList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllTasks(taskList);
        setLoading(false);
      }, (err) => {
        console.error('Task listener admin error:', err);
        setLoading(false);
      });
    } else {
      // ME-3 fix: two separate query results stored in separate state slices.
      // Each callback only writes to its own slice — no shared mutable Map,
      // no clear() races. Merging is deferred to the useMemo below.

      // Query 1: tasks assigned to this user
      const assignedQuery = query(
        collection(db, 'tasks'),
        where('assignedTo', 'array-contains', effectiveUid)
      );
      const unsubAssigned = onSnapshot(assignedQuery, (snap) => {
        setAssignedTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error('Task listener (assignedTo) error:', err);
        setLoading(false);
      });

      // Query 2: tasks where user is a work partner
      const partnerQuery = query(
        collection(db, 'tasks'),
        where('workPartnerUids', 'array-contains', effectiveUid)
      );
      const unsubPartner = onSnapshot(partnerQuery, (snap) => {
        setPartnerTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }, (err) => {
        console.error('Task listener (workPartnerUids) error:', err);
        setLoading(false);
      });

      // Query 3: roadmap tasks assigned to this user, read directly from their
      // source (roadmapNodes/{nodeId}/tasks/{taskId}) via a collectionGroup
      // query — not from the root `tasks` mirror written by roadmapTaskService.
      // The mirror write is explicitly best-effort/non-fatal (see
      // roadmapTaskService.js), so a roadmap task can be correctly assigned at
      // the source yet still be missing from the mirror. Querying the source
      // directly means the Dashboard reflects a roadmap assignment even if
      // mirroring silently failed. Deduped against the mirror by task id below.
      const roadmapTasksQuery = query(
        collectionGroup(db, 'tasks'),
        where('assignedTo', 'array-contains', effectiveUid)
      );
      const unsubRoadmapAssigned = onSnapshot(roadmapTasksQuery, (snap) => {
        const roadmapOnly = snap.docs
          .filter((d) => {
            const parts = d.ref.path.split('/');
            return parts[0] === 'roadmapNodes' && parts.length === 4;
          })
          .map((d) => ({ id: d.id, ...d.data() }));
        setRoadmapAssignedTasks(roadmapOnly);
        setLoading(false);
      }, (err) => {
        console.error('Task listener (roadmap assignedTo) error:', err);
        setRoadmapAssignedTasks([]);
        setLoading(false);
      });

      unsubTasks = () => { unsubAssigned(); unsubPartner(); unsubRoadmapAssigned(); };
    }

    return () => {
      unsubUsers();
      unsubTasks();
      unsubAssignedNodes();
    };
  }, [user, isAdmin, effectiveUid]);

  // ME-3 fix: merge the two employee query slices via useMemo.
  // This is atomic — React computes it in a single synchronous pass after
  // both state slices have been updated, so the intermediate "half-clear"
  // state that caused the race condition cannot occur here.
  const tasks = useMemo(() => {
    if (isAdmin) return allTasks; // admin path uses allTasks directly

    // Wait until all snapshots have been received at least once
    if (assignedTasks === null || partnerTasks === null || roadmapAssignedTasks === null) return [];

    // Deduplicate by id — a roadmap task and its root-collection mirror share
    // the same document id, so this also collapses mirror duplicates.
    const map = new Map();
    [...assignedTasks, ...partnerTasks, ...roadmapAssignedTasks].forEach(t => map.set(t.id, t));
    const merged = Array.from(map.values());

    // Sort by due date ascending (soonest first)
    merged.sort((a, b) => {
      const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
      const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
      return dateA - dateB;
    });
    return merged;
  }, [isAdmin, allTasks, assignedTasks, partnerTasks, roadmapAssignedTasks]);

  // The viewer's work list: `tasks` plus the roadmap milestones assigned to
  // them. This — not `tasks` — is what the Dashboard's counters and "due this
  // week" must read, or an assigned milestone stays invisible in exactly the
  // place the person looks for their work.
  //
  // Purely additive and deliberately without a role branch of its own — the
  // breadth difference already happened upstream, in which node listener ran.
  // For an employee this is their own work; for an admin it is the company-wide
  // task list plus every assigned milestone, which is what makes the employee
  // filter able to find a teammate's milestone. Narrowing the admin list here
  // would silently change every count on their Dashboard.
  const myWorkItems = useMemo(() => {
    if (assignedNodes.length === 0) return tasks;
    const ids = new Set(tasks.map(t => t.id));
    return [...tasks, ...assignedNodes.filter(n => !ids.has(n.id))];
  }, [tasks, assignedNodes]);

  const getTasksByStatus = (status) => myWorkItems.filter(t => t.status === status);
  const getUpcomingTasks = (days = 7) => {
    const cutoff = new Date(Date.now() + days * 86400000);
    return myWorkItems.filter(t => {
      const due = t.dueDate?.toDate ? t.dueDate.toDate() : new Date(t.dueDate);
      return due <= cutoff && t.status !== 'completed';
    });
  };

  return (
    <TaskContext.Provider value={{ tasks, allTasks, allUsers, assignedNodes, myWorkItems, loading, getTasksByStatus, getUpcomingTasks }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within TaskProvider');
  return ctx;
};

