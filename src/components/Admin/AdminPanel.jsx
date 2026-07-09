import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../utils/dateHelpers';
import { PriorityBadge, StatusBadge, ProgressBar } from '../shared/TaskCard';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, MODULE_OPTIONS } from '../../utils/permissions';
import { sendNotification } from '../../services/notificationService';
import { addTaskToGoogleCalendar } from '../../services/googleCalendarService';
// HI-5 + NEW-1 fix: ALL Firestore access goes through the service layer
import { createAdminTask, deleteTask, subscribeToAdminTasks } from '../../services/taskService';
import { createAnnouncement, deleteAnnouncement, subscribeToAnnouncements } from '../../services/announcementService';
import { subscribeToAllUsers } from '../../services/teamMembersService';

// ─── Team Overview ───────────────────────────────────────────
const TeamOverview = ({ users, allTasks }) => {
  const getStats = (uid) => {
    const assigned   = allTasks.filter(t => t.assignedTo?.includes(uid));
    const partnered  = allTasks.filter(t =>
      Array.isArray(t.workPartnerUids) && t.workPartnerUids.includes(uid) && !t.assignedTo?.includes(uid)
    );
    const allInvolved = [...assigned, ...partnered];
    const completed  = allInvolved.filter(t => t.status === 'completed').length;
    return {
      assigned:  assigned.length,
      partnered: partnered.length,
      total:     allInvolved.length,
      completed,
      rate: allInvolved.length > 0 ? Math.round((completed / allInvolved.length) * 100) : 0,
    };
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-background">
          <tr>
            {['Member', 'Role', 'Assigned', 'As Partner', 'Completed', 'Rate'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borderLight">
          {users.map(u => {
            const s = getStats(u.uid);
            return (
              <tr key={u.uid} className="hover:bg-surfaceHover transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.avatar ? <img src={u.avatar} className="w-7 h-7 rounded-full" alt="" /> :
                      <div className="w-7 h-7 rounded-full bg-orange-muted flex items-center justify-center text-orange font-bold text-xs">{u.name?.[0]?.toUpperCase()}</div>}
                    <span className="font-medium text-text-primary text-sm">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="badge-orange capitalize">{u.role}</span></td>
                <td className="px-4 py-3 text-text-primary font-semibold">{s.assigned}</td>
                <td className="px-4 py-3">
                  {s.partnered > 0
                    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">🤝 {s.partnered}</span>
                    : <span className="text-text-muted text-xs">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-green-400 font-semibold">{s.completed}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 progress-bar"><div className="progress-fill bg-gradient-to-r from-orange to-orange-hover" style={{ width: `${s.rate}%` }} /></div>
                    <span className="text-text-secondary text-xs">{s.rate}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Assign Task Form ────────────────────────────────────────
const AssignTask = ({ users }) => {
  const { userProfile, googleAccessToken } = useAuth();
  const [form, setForm] = useState({
    title: '', description: '', module: MODULE_OPTIONS[0],
    priority: 'medium', status: 'pending', progress: 0,
    startDate: '', dueDate: '', assignedTo: [], links: [], attachments: [],
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const toggleEmployee = (uid) => {
    setForm(p => ({
      ...p,
      assignedTo: p.assignedTo.includes(uid)
        ? p.assignedTo.filter(id => id !== uid)
        : [...p.assignedTo, uid],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || form.assignedTo.length === 0) return;
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      // HI-5 fix: use taskService instead of direct Firestore addDoc
      await createAdminTask(form, userProfile?.uid);
      setSuccess('Task assigned successfully!');

      // Sync task to Google Calendar (admin's calendar)
      const calTaskObj = {
        title: form.title,
        description: form.description,
        module: form.module,
        priority: form.priority,
        startDate: form.startDate ? new Date(form.startDate) : new Date(),
        dueDate: form.dueDate ? new Date(form.dueDate) : new Date(),
      };
      const assigneeNames = form.assignedTo
        .map(uid => users.find(u => u.uid === uid)?.name || 'Team Member')
        .join(', ');
      const calEvent = await addTaskToGoogleCalendar(googleAccessToken, calTaskObj, assigneeNames);
      const eventLink = calEvent?.htmlLink || null;

      // Notify each assigned employee (with calendar link if available)
      await Promise.all(
        form.assignedTo
          .filter(uid => uid !== userProfile?.uid)
          .map(uid => sendNotification(
            uid,
            '🆕 New Task Assigned',
            `"${form.title}" has been assigned to you.${eventLink ? ' Check your Google Calendar.' : ''}`,
            'task_assigned',
            eventLink,
            userProfile?.uid   // CR-6: senderUid required by Firestore rule
          ))
      );
      setForm({ title: '', description: '', module: MODULE_OPTIONS[0], priority: 'medium', status: 'pending', progress: 0, startDate: '', dueDate: '', assignedTo: [], links: [], attachments: [] });
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to assign task. Please verify your permissions and network connection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {success && <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">{success}</div>}
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Task Title *</label>
          <input className="input-field" placeholder="Enter task title" value={form.title} onChange={e => set('title', e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Description</label>
          <textarea className="input-field resize-none" rows={3} placeholder="Task description..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Module</label>
          <select className="select-field" value={form.module} onChange={e => set('module', e.target.value)}>
            {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Priority</label>
          <select className="select-field" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Start Date</label>
          <input type="date" className="input-field" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase mb-1.5 block">Due Date</label>
          <input type="date" className="input-field" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
      </div>

      {/* Assign To */}
      <div>
        <label className="text-xs font-semibold text-text-muted uppercase mb-2 block">
          Assign To * ({form.assignedTo.length} selected)
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {users.map(u => (
            <button
              type="button"
              key={u.uid}
              onClick={() => toggleEmployee(u.uid)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${form.assignedTo.includes(u.uid)
                ? 'border-orange bg-orange-muted text-orange'
                : 'border-border bg-surface text-text-secondary hover:border-orange/40'
                }`}
            >
              {u.avatar ? <img src={u.avatar} className="w-5 h-5 rounded-full" alt="" /> :
                <div className="w-5 h-5 rounded-full bg-orange-muted flex items-center justify-center text-orange font-bold text-xs">{u.name?.[0]?.toUpperCase()}</div>}
              <span className="truncate text-xs font-medium">{u.name}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving || !form.title || form.assignedTo.length === 0} className="btn-primary">
        {saving ? 'Assigning...' : 'Assign Task'}
      </button>
    </form>
  );
};

// ─── Task Monitor ────────────────────────────────────────────
const TaskMonitor = ({ allTasks }) => {
  const [filter, setFilter] = useState({ status: 'all', search: '' });
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const filtered = allTasks.filter(t => {
    const s = filter.status === 'all' || t.status === filter.status;
    const q = !filter.search || t.title?.toLowerCase().includes(filter.search.toLowerCase());
    return s && q;
  });

  const handleDelete = async (id) => {
    if (!confirm('Delete this task?')) return;
    setDeleting(id);
    setError('');
    try {
      // NEW-1 fix: use taskService.deleteTask instead of direct deleteDoc
      await deleteTask(id);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete task.');
    }
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
      <div className="flex gap-3 flex-wrap">
        <input className="input-field flex-1 min-w-[180px]" placeholder="🔍 Search tasks..." value={filter.search} onChange={e => setFilter(p => ({ ...p, search: e.target.value }))} />
        <select className="select-field w-36" value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-background">
            <tr>
              {['Title', 'Module', 'Due Date', 'Priority', 'Status', 'Progress', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLight">
            {filtered.map(t => (
              <tr key={t.id} className="hover:bg-surfaceHover transition-colors">
                <td className="px-4 py-3 font-medium text-text-primary max-w-xs truncate">{t.title}</td>
                <td className="px-4 py-3 text-text-muted text-xs">{t.module || '—'}</td>
                <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(t.dueDate)}</td>
                <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 progress-bar"><div className="progress-fill bg-gradient-to-r from-orange to-orange-hover" style={{ width: `${t.progress || 0}%` }} /></div>
                    <span className="text-xs text-text-muted">{t.progress || 0}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id} className="text-red-400 hover:text-red-300 text-xs font-medium">
                    {deleting === t.id ? '...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted text-sm">No tasks found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">{filtered.length} of {allTasks.length} tasks</p>
    </div>
  );
};

// ─── Announcements Manager ───────────────────────────────────
// HI-5+HI-6: now uses announcementService; `users` prop passed from AdminPanel
const AnnouncementsManager = ({ users }) => {
  const { userProfile } = useAuth();
  const [form, setForm] = useState({ title: '', message: '', priority: 'normal', meetingLink: '', targetAudience: 'all' });
  const [announcements, setAnnouncements] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // HI-5 fix: use service layer for real-time announcements listener
    return subscribeToAnnouncements(setAnnouncements);
  }, []);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handlePost = async (e) => {
    e.preventDefault();
    if (!form.title || !form.message) return;
    setSaving(true);
    setError('');
    try {
      // HI-5 + HI-6 fix: use announcementService which accepts pre-loaded users
      // — no getDocs(users) round-trip on every submit
      await createAnnouncement(form, userProfile, users);
      setForm({ title: '', message: '', priority: 'normal', meetingLink: '', targetAudience: 'all' });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to post announcement.');
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    setError('');
    try {
      // HI-5 fix: use announcementService.deleteAnnouncement
      await deleteAnnouncement(id);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete announcement.');
    }
  };

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
      <form onSubmit={handlePost} className="card space-y-4 max-w-2xl">
        <h3 className="font-bold text-text-primary">Create Announcement</h3>
        <input className="input-field" placeholder="Title *" value={form.title} onChange={e => set('title', e.target.value)} required />
        <textarea className="input-field resize-none" rows={4} placeholder="Message *" value={form.message} onChange={e => set('message', e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <select className="select-field" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="normal">Normal</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select className="select-field" value={form.targetAudience} onChange={e => set('targetAudience', e.target.value)}>
            <option value="all">All Team</option>
          </select>
        </div>
        <input className="input-field" placeholder="Meeting Link (optional)" value={form.meetingLink} onChange={e => set('meetingLink', e.target.value)} />
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Posting...' : 'Post Announcement'}</button>
      </form>

      <div className="space-y-3">
        <h3 className="font-bold text-text-primary">Recent Announcements</h3>
        {announcements.map(a => (
          <div key={a.id} className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary text-sm truncate">{a.title}</p>
              <p className="text-xs text-text-muted">{formatDate(a.createdAt)} · {a.isRead?.length || 0} read</p>
            </div>
            <PriorityBadge priority={a.priority} />
            <button onClick={() => handleDelete(a.id)} className="text-red-400 text-xs hover:text-red-300">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Employee Management ─────────────────────────────────────
const EmployeeManagement = ({ users }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {users.map(u => (
      <div key={u.uid} className="card">
        <div className="flex items-center gap-3 mb-3">
          {u.avatar ? <img src={u.avatar} className="w-10 h-10 rounded-full border-2 border-border" alt="" /> :
            <div className="w-10 h-10 rounded-full bg-orange-muted border-2 border-orange/30 flex items-center justify-center text-orange font-bold">{u.name?.[0]?.toUpperCase()}</div>}
          <div>
            <p className="font-semibold text-text-primary text-sm">{u.name}</p>
            <span className="badge-orange capitalize">{u.role}</span>
          </div>
        </div>
        <p className="text-xs text-text-muted truncate">{u.email}</p>
        <p className="text-xs text-text-muted mt-1">Joined {formatDate(u.createdAt)}</p>
      </div>
    ))}
  </div>
);

// ─── Main Admin Panel ────────────────────────────────────────
const TABS = ['Team Overview', 'Assign Task', 'Task Monitor', 'Announcements', 'Employee Management'];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [allTasks, setAllTasks] = useState([]);

  useEffect(() => {
    // HI-5 + NEW-1 fix: ALL listeners through the service layer
    const unsub1 = subscribeToAllUsers((users) => setUsers(users));
    const unsub2 = subscribeToAdminTasks((tasks) => setAllTasks(tasks));
    return () => { unsub1(); unsub2(); };
  }, []);

  const tabContent = [
    <TeamOverview key="team" users={users} allTasks={allTasks} />,
    <AssignTask key="assign" users={users} />,
    <TaskMonitor key="monitor" allTasks={allTasks} />,
    <AnnouncementsManager key="ann" users={users} />,
    <EmployeeManagement key="emp" users={users} />,
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-text-primary">Admin Panel</h1>
        <p className="text-sm text-text-secondary mt-1">Manage your team, tasks, and announcements</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-surface border border-border rounded-xl p-1">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${activeTab === i
              ? 'bg-orange text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{tabContent[activeTab]}</div>
    </div>
  );
}
