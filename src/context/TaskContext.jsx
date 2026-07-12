import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';

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

  useEffect(() => {
    if (!user || !effectiveUid) {
      setAllTasks([]);
      setAllUsers({});
      setAssignedTasks(null);
      setPartnerTasks(null);
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

      unsubTasks = () => { unsubAssigned(); unsubPartner(); };
    }

    return () => {
      unsubUsers();
      unsubTasks();
    };
  }, [user, isAdmin, effectiveUid]);

  // ME-3 fix: merge the two employee query slices via useMemo.
  // This is atomic — React computes it in a single synchronous pass after
  // both state slices have been updated, so the intermediate "half-clear"
  // state that caused the race condition cannot occur here.
  const tasks = useMemo(() => {
    if (isAdmin) return allTasks; // admin path uses allTasks directly

    // Wait until both snapshots have been received at least once
    if (assignedTasks === null || partnerTasks === null) return [];

    // Deduplicate by id (a task can appear in both queries)
    const map = new Map();
    [...assignedTasks, ...partnerTasks].forEach(t => map.set(t.id, t));
    const merged = Array.from(map.values());

    // Sort by due date ascending (soonest first)
    merged.sort((a, b) => {
      const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
      const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
      return dateA - dateB;
    });
    return merged;
  }, [isAdmin, allTasks, assignedTasks, partnerTasks]);

  const getTasksByStatus = (status) => tasks.filter(t => t.status === status);
  const getUpcomingTasks = (days = 7) => {
    const cutoff = new Date(Date.now() + days * 86400000);
    return tasks.filter(t => {
      const due = t.dueDate?.toDate ? t.dueDate.toDate() : new Date(t.dueDate);
      return due <= cutoff && t.status !== 'completed';
    });
  };

  return (
    <TaskContext.Provider value={{ tasks, allTasks, allUsers, loading, getTasksByStatus, getUpcomingTasks }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within TaskProvider');
  return ctx;
};

