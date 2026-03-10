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
      // Employee view: tasks assigned to current user
      const employeeQuery = query(
        collection(db, 'tasks'),
        where('assignedTo', 'array-contains', user.uid)
      );

      unsubTasks = onSnapshot(employeeQuery, (snap) => {
        const taskList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort manually by date to avoid requiring a composite index in Firestore
        taskList.sort((a, b) => {
          const dateA = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
          const dateB = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
          return dateA - dateB;
        });
        setTasks(taskList);
        setLoading(false);
      }, (err) => {
        console.error('Task listener employee error:', err);
        setLoading(false);
      });
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
