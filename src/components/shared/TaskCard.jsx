import { formatDate, getDueDateLabel, getDueDateColor } from '../../utils/dateHelpers';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';

export const PriorityBadge = ({ priority }) => {
  const classes = {
    high: 'badge-high',
    medium: 'badge-medium',
    low: 'badge-low',
  }[priority] || 'badge';

  return <span className={classes}>{priority}</span>;
};

export const StatusBadge = ({ status }) => {
  const classes = {
    pending: 'badge-pending',
    'in-progress': 'badge-in-progress',
    completed: 'badge-completed',
  }[status] || 'badge';

  return <span className={classes}>{status}</span>;
};

export const ProgressBar = ({ progress, className = '' }) => (
  <div className={`progress-bar ${className}`}>
    <div
      className="progress-fill bg-gradient-to-r from-orange to-orange-hover"
      style={{ width: `${Math.min(100, Math.max(0, progress || 0))}%` }}
    />
  </div>
);

export default function TaskCard({ task, onClick }) {
  const { userProfile } = useAuth();
  const { allUsers } = useTasks();
  const dueDateColor = getDueDateColor(task.dueDate, task.status);
  const dueDateLabel = getDueDateLabel(task.dueDate, task.status);

  return (
    <div
      className="card-hover flex flex-col gap-3 animate-fade-in"
      onClick={() => onClick && onClick(task)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm text-text-primary line-clamp-2 flex-1">
          {task.title}
          {task.isAdminTask === false && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Self-Assigned
            </span>
          )}
        </h3>
        <PriorityBadge priority={task.priority} />
      </div>

      {/* Module */}
      {task.module && (
        <p className="text-xs text-text-muted font-medium uppercase tracking-wide">{task.module}</p>
      )}

      {/* Status */}
      <div className="flex items-center gap-2">
        <StatusBadge status={task.status} />
        <span className="text-xs text-text-muted ml-auto">{task.progress || 0}%</span>
      </div>

      {/* Progress Bar */}
      <ProgressBar progress={task.progress} />

      {/* Due Date */}
      <div className="flex items-center justify-between text-xs">
        <span className={`${task.isExtended ? 'text-red-400 font-medium' : 'text-text-muted'} flex items-center gap-1`}>
          {formatDate(task.dueDate)}
          {task.isExtended && <span className="text-[9px] bg-red-500/10 text-red-500 px-1 rounded uppercase tracking-wider border border-red-500/20">Extended</span>}
        </span>
        <span className={`font-medium ${dueDateColor}`}>{dueDateLabel}</span>
      </div>

      {/* Assignees (Admin only) */}
      {userProfile?.role === 'admin' && task.assignedTo?.length > 0 && (
        <div className="flex items-center gap-1 mt-1 pt-2 border-t border-borderLight text-xs text-text-secondary">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="truncate">
            {task.assignedTo.map(uid => allUsers[uid]?.name?.split(' ')[0] || 'Unknown').join(', ')}
          </span>
        </div>
      )}
    </div>
  );
}
