import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { formatDate, timeFromNow } from '../../utils/dateHelpers';

const PriorityDot = ({ priority }) => {
  const color = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    normal: 'bg-blue-500',
  }[priority] || 'bg-blue-500';
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
};

const AnnouncementCard = ({ announcement, currentUser }) => {
  const [expanded, setExpanded] = useState(false);
  const isRead = Array.isArray(announcement.isRead) && announcement.isRead.includes(currentUser?.uid);

  const handleClick = async () => {
    setExpanded(p => !p);
    if (!isRead && currentUser) {
      try {
        await updateDoc(doc(db, 'announcements', announcement.id), {
          isRead: arrayUnion(currentUser.uid),
        });
      } catch (err) {
        console.error('Failed to mark read:', err);
      }
    }
  };

  const priorityBadgeClass = {
    high: 'badge-high',
    medium: 'badge-medium',
    normal: 'badge-orange',
  }[announcement.priority] || 'badge-orange';

  return (
    <div
      className={`card cursor-pointer hover:border-orange/40 transition-all duration-200 ${!isRead ? 'border-orange/30 bg-orange-muted/10' : ''}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <div className="mt-1.5 flex-shrink-0">
          {!isRead ? (
            <span className="w-2 h-2 rounded-full bg-orange block animate-pulse-dot" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-border block" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-bold text-text-primary flex-1 text-sm">{announcement.title}</h3>
            <span className={priorityBadgeClass}>{announcement.priority}</span>
          </div>

          {/* Admin info */}
          <p className="text-xs text-text-muted mt-1">
            By {announcement.adminName || 'Admin'} · {timeFromNow(announcement.createdAt)}
          </p>

          {/* Message (expanded) */}
          {expanded && (
            <p className="text-sm text-text-secondary mt-3 leading-relaxed whitespace-pre-wrap">
              {announcement.message}
            </p>
          )}
          {!expanded && (
            <p className="text-sm text-text-secondary mt-1 line-clamp-2">{announcement.message}</p>
          )}

          {/* Meeting Link */}
          {announcement.meetingLink && (
            <a
              href={announcement.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-blue-500/15 border border-blue-500/25 text-blue-400 rounded-lg text-xs font-semibold hover:bg-blue-500/25 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              Join Meeting
            </a>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform duration-200 mt-1 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};

export default function AnnouncementList() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, userProfile } = useAuth();

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter by targetAudience
      const visible = items.filter(a => {
        if (a.targetAudience === 'all') return true;
        if (Array.isArray(a.targetAudience)) return a.targetAudience.includes(user?.uid);
        return true;
      });
      setAnnouncements(visible);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const unreadCount = announcements.filter(
    a => !Array.isArray(a.isRead) || !a.isRead.includes(user?.uid)
  ).length;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Announcements</h1>
          <p className="text-sm text-text-secondary mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
      </div>

      {announcements.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">📣</div>
          <h3 className="text-lg font-bold text-text-primary mb-2">No announcements yet</h3>
          <p className="text-sm text-text-muted">Check back soon for updates from your admin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => (
            <AnnouncementCard key={a.id} announcement={a} currentUser={user} />
          ))}
        </div>
      )}
    </div>
  );
}
