import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

export const useNotifications = () => {
  const { user, effectiveUid } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || !effectiveUid) return;

    const q = query(
      collection(db, 'notifications', effectiveUid, 'items'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(items);
      setUnreadCount(items.filter(n => !n.read).length);
    });

    return unsub;
  }, [user, effectiveUid]);

  const markAsRead = async (notifId) => {
    if (!user) return;
    await updateDoc(doc(db, 'notifications', effectiveUid, 'items', notifId), { read: true });
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => markAsRead(n.id)));
  };

  return { notifications, unreadCount, markAsRead, markAllRead };
};
