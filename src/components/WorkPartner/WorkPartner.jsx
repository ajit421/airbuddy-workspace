import { useState } from 'react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { ProgressBar } from '../shared/TaskCard';
import { formatDate, getDueDateLabel, getDueDateColor } from '../../utils/dateHelpers';

const statusColors = {
  'pending': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'in-progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'completed': 'bg-green-500/20 text-green-400 border-green-500/30',
};

const priorityColors = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
};

// An avatar component that shows the user's initial and a gradient color
const Avatar = ({ name, size = 'md' }) => {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-xl',
  };
  return (
    <div
      className={`${sizes[size]} rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center font-bold text-white shrink-0 shadow-lg`}
    >
      {initial}
    </div>
  );
};

// A detail row for task info
const InfoRow = ({ label, value, className = '' }) => (
  <div className="flex items-start gap-2">
    <span className="text-xs text-text-muted w-20 shrink-0 pt-0.5">{label}</span>
    <span className={`text-xs font-semibold text-text-primary flex-1 ${className}`}>{value}</span>
  </div>
);

// Expanded task detail modal/drawer
const TaskDetailDrawer = ({ task, colleagues, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div
      className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl animate-fade-in space-y-5"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-text-primary leading-tight">{task.title}</h2>
          {task.module && (
            <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mt-1">{task.module}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors mt-0.5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Task Metadata */}
      <div className="card space-y-2.5">
        <InfoRow label="Status" value={
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusColors[task.status] || 'bg-gray-500/20 text-gray-400'}`}>
            {task.status}
          </span>
        } />
        <InfoRow label="Priority" value={
          <span className={`capitalize ${priorityColors[task.priority] || ''}`}>
            {task.priority || 'N/A'}
          </span>
        } />
        <InfoRow label="Due Date" value={
          <span className={getDueDateColor(task.dueDate)}>
            {formatDate(task.dueDate)} · {getDueDateLabel(task.dueDate)}
          </span>
        } />
        <InfoRow label="Start Date" value={formatDate(task.startDate)} />
        {task.description && <InfoRow label="Details" value={task.description} />}
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
          <span className="font-semibold">Progress</span>
          <span className="font-bold text-text-primary">{task.progress || 0}%</span>
        </div>
        <ProgressBar progress={task.progress} />
      </div>

      {/* Colleagues Profiles */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
          Team Members ({colleagues.length})
        </p>
        <div className="space-y-3">
          {colleagues.map(colleague => (
            <div key={colleague.uid} className="flex items-center gap-3 card p-3">
              <Avatar name={colleague.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-text-primary text-sm truncate">{colleague.name || 'Unknown'}</p>
                <p className="text-xs text-text-muted capitalize">{colleague.role || 'Employee'}</p>
                {colleague.email && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">{colleague.email}</p>
                )}
              </div>
              <div className={`px-2 py-0.5 rounded-full text-xs border ${statusColors[task.status] || ''}`}>
                {task.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const WorkPartnerCard = ({ task, currentUid, allUsers, onClick }) => {
  const coworkers = (task.assignedTo || [])
    .filter(uid => uid !== currentUid)
    .map(uid => ({ uid, ...(allUsers[uid] || {}) }));

  return (
    <div className="card-hover p-5 cursor-pointer" onClick={onClick}>
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text-primary mb-0.5 line-clamp-2 leading-snug">{task.title}</h3>
          {task.module && (
            <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">{task.module}</p>
          )}
        </div>
        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${statusColors[task.status] || ''}`}>
          {task.status}
        </span>
      </div>

      {/* Due Date + Priority */}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className={`${getDueDateColor(task.dueDate)}`}>
          📅 {formatDate(task.dueDate)}
        </span>
        {task.priority && (
          <span className={`capitalize font-semibold ${priorityColors[task.priority]}`}>
            ● {task.priority}
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>Progress</span>
          <span className="font-bold text-text-primary">{task.progress || 0}%</span>
        </div>
        <ProgressBar progress={task.progress} />
      </div>

      {/* Colleagues */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Working with you ({coworkers.length})
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {coworkers.slice(0, 4).map((colleague, i) => (
            <div key={colleague.uid} className="flex items-center gap-1.5" style={{ zIndex: 4 - i }}>
              <Avatar name={colleague.name} size="sm" />
              <span className="text-xs text-text-secondary font-medium">{colleague.name?.split(' ')[0] || 'Unknown'}</span>
            </div>
          ))}
          {coworkers.length > 4 && (
            <span className="text-xs text-text-muted">+{coworkers.length - 4} more</span>
          )}
        </div>
      </div>

      {/* View Detail hint */}
      <div className="mt-3 pt-3 border-t border-border">
        <span className="text-xs text-orange font-semibold hover:underline">View full details →</span>
      </div>
    </div>
  );
};

export default function WorkPartner() {
  const { tasks, loading, allUsers } = useTasks();
  const { user } = useAuth();
  const [selectedTask, setSelectedTask] = useState(null);

  const sharedTasks = tasks.filter(
    t => Array.isArray(t.assignedTo) && t.assignedTo.length > 1 && t.assignedTo.includes(user?.uid)
  );

  // Get colleagues for the selected task
  const selectedColleagues = selectedTask
    ? (selectedTask.assignedTo || [])
      .filter(uid => uid !== user?.uid)
      .map(uid => ({ uid, ...(allUsers[uid] || {}) }))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Work Partner</h1>
          <p className="text-sm text-text-secondary mt-1">
            {sharedTasks.length} shared task{sharedTasks.length !== 1 ? 's' : ''} with your colleagues
          </p>
        </div>
      </div>

      {sharedTasks.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🤝</div>
          <h3 className="text-lg font-bold text-text-primary mb-2">No shared tasks currently</h3>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            When you and a colleague are assigned to the same task, they'll appear here as your work partners.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sharedTasks.map(task => (
            <WorkPartnerCard
              key={task.id}
              task={task}
              currentUid={user?.uid}
              allUsers={allUsers}
              onClick={() => setSelectedTask(task)}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          colleagues={selectedColleagues}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
