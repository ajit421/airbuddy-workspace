import { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';

const TaskContext = createContext(null);

export const TaskProvider = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [allUsers, setAllUsers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setAllTasks([]);
      setAllUsers({});
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
        setTasks(taskList); // Admin sees all tasks in their personal dashboard & calendar too
        setLoading(false);
      }, (err) => {
        console.error('Task listener admin error:', err);
        setLoading(false);
      });
    } else {
      // Employee view: tasks where assigned OR where they are a work partner.
      // Firestore doesn't support OR queries across different fields, so we run
      // two separate queries and merge + deduplicate the results client-side.
      const mergedMap = new Map(); // taskId → task doc
      let assignedSnap = null;
      let partnerSnap  = null;

      const tryMerge = () => {
        if (assignedSnap === null || partnerSnap === null) return; // wait for both
        mergedMap.clear();
        [...assignedSnap.docs, ...partnerSnap.docs].forEach(d => {
          mergedMap.set(d.id, { id: d.id, ...d.data() });
        });
        const taskList = Array.from(mergedMap.values());
        taskList.sort((a, b) => {
          const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
          const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
          return dateA - dateB;
        });
        setTasks(taskList);
        setLoading(false);
      };

      // Query 1: tasks assigned to this user
      const assignedQuery = query(
        collection(db, 'tasks'),
        where('assignedTo', 'array-contains', user.uid)
      );
      const unsubAssigned = onSnapshot(assignedQuery, (snap) => {
        assignedSnap = snap;
        tryMerge();
      }, (err) => {
        console.error('Task listener (assignedTo) error:', err);
        setLoading(false);
      });

      // Query 2: tasks where user is a work partner
      const partnerQuery = query(
        collection(db, 'tasks'),
        where('workPartnerUids', 'array-contains', user.uid)
      );
      const unsubPartner = onSnapshot(partnerQuery, (snap) => {
        partnerSnap = snap;
        tryMerge();
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
  }, [user, isAdmin]);

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
