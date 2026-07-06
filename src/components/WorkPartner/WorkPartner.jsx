import { useState } from 'react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { ProgressBar } from '../shared/TaskCard';
import { formatDate, getDueDateLabel, getDueDateColor } from '../../utils/dateHelpers';
import TaskTimeline from './TaskTimeline';
import RoleBadge from '../shared/RoleBadge';

const statusColors = {
  'pending': 'bg-orange/10 text-orange border-orange/20',
  'in-progress': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'completed': 'bg-green-500/10 text-green-400 border-green-500/20',
};

const priorityColors = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
};

const Avatar = ({ name, size = 'md' }) => {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };
  return (
    <div
      className={`${sizes[size]} rounded-full bg-gradient-to-br from-orange/90 to-rose-500/90 flex items-center justify-center font-bold text-white shrink-0 shadow-inner ring-1 ring-white/20`}
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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-0 animate-fade-in" onClick={onClose}>
    <div
      className="bg-surface border border-white/10 rounded-2xl w-full max-w-xl mx-auto shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-6 bg-surfaceHover/40 border-b border-border">
        <div>
          <h2 className="text-xl font-black text-text-primary leading-tight">{task.title}</h2>
          {task.module && (
            <div className="inline-flex items-center px-2 py-0.5 mt-2 rounded bg-orange/10 text-orange text-[10px] uppercase tracking-widest font-bold">
              {task.module}
            </div>
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

      {/* Scrollable Content */}
      <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
        {/* Task Metadata */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surfaceHover/30 p-3 rounded-xl border border-border/50">
            <span className="block text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1">Status</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusColors[task.status] || ''}`}>
              {task.status}
            </span>
          </div>
          <div className="bg-surfaceHover/30 p-3 rounded-xl border border-border/50">
            <span className="block text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1">Priority</span>
            <span className={`capitalize text-xs font-bold ${priorityColors[task.priority] || 'text-text-primary'}`}>
              {task.priority || 'N/A'}
            </span>
          </div>
          <div className="bg-surfaceHover/30 p-3 rounded-xl border border-border/50 col-span-2 sm:col-span-1">
            <span className="block text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1">Due Date</span>
            <span className={`text-xs font-bold ${getDueDateColor(task.dueDate, task.status)}`}>
              {formatDate(task.dueDate)} <span className="text-text-muted text-[10px] ml-1 font-normal">({getDueDateLabel(task.dueDate, task.status)})</span>
            </span>
          </div>
          <div className="bg-surfaceHover/30 p-3 rounded-xl border border-border/50 col-span-2 sm:col-span-1">
            <span className="block text-[10px] text-text-muted uppercase tracking-wider font-bold mb-1">Start Date</span>
            <span className="text-xs font-bold text-text-primary">{formatDate(task.startDate)}</span>
          </div>
        </div>

        {task.description && (
          <div className="bg-surfaceHover/30 p-4 rounded-xl border border-border/50">
            <span className="block text-[10px] text-text-muted uppercase tracking-wider font-bold mb-2">Description</span>
            <p className="text-sm text-text-secondary leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-[10px] text-text-muted font-bold uppercase tracking-wider mb-2">
            <span>Progress</span>
            <span className="text-text-primary">{task.progress || 0}%</span>
          </div>
          <ProgressBar progress={task.progress} />
        </div>

        {/* Colleagues Profiles */}
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold mb-3 flex items-center gap-2">
            Team Members <span className="px-1.5 py-0.5 rounded-full bg-surfaceHover border border-border">{colleagues.length}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {colleagues.map(colleague => (
              <div key={colleague.uid} className="flex items-center gap-3 bg-surfaceHover/30 border border-border/50 rounded-xl p-3 hover:border-orange/30 transition-colors">
                <Avatar name={colleague.name} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-text-primary text-sm truncate">{colleague.name || 'Unknown'}</p>
                  <div className="mt-1">
                    <RoleBadge role={colleague.role} customRole={colleague.customRole} size="xs" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compact collaboration timeline */}
        <div className="bg-surfaceHover/20 rounded-xl border border-border/50 p-4">
          <TaskTimeline taskId={task.id} task={task} compact={true} />
        </div>
      </div>
    </div>
  </div>
);

const WorkPartnerCard = ({ task, currentUid, allUsers, onClick }) => {
  const allParticipantUids = [
    ...(Array.isArray(task.assignedTo) ? task.assignedTo : (task.assignedTo ? [task.assignedTo] : [])),
    ...(Array.isArray(task.workPartners) ? task.workPartners.map(p => p.uid) : [])
  ].filter((uid, index, array) => array.indexOf(uid) === index);

  const coworkers = allParticipantUids
    .filter(uid => uid !== currentUid)
    .map(uid => ({ uid, ...(allUsers[uid] || {}) }));

  return (
    <div className="card p-0 overflow-hidden cursor-pointer flex flex-col h-full bg-surface border border-border hover:border-orange/50 hover:shadow-2xl hover:shadow-orange/5 transform hover:-translate-y-1 transition-all duration-300 group relative" onClick={onClick}>
      {/* Background Glow */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="p-5 flex-1 space-y-4 relative z-10">
        {/* Task Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-text-primary text-base mb-1 line-clamp-2 leading-snug group-hover:text-orange transition-colors">
              {task.title}
            </h3>
            {task.module && (
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-bold">{task.module}</p>
            )}
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${statusColors[task.status] || ''}`}>
            {task.status}
          </span>
        </div>

        {/* Details (Date & Priority) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className={`flex items-center gap-1.5 ${getDueDateColor(task.dueDate, task.status)} font-medium`}>
            <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {formatDate(task.dueDate)}
          </div>
          {task.priority && (
            <div className={`flex items-center gap-1.5 font-medium ${priorityColors[task.priority]}`}>
              <span className="w-2 h-2 rounded-full currentColor bg-current opacity-75 animate-pulse"></span>
              <span className="capitalize">{task.priority}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1.5">
            <span>Completion</span>
            <span className="text-text-primary">{task.progress || 0}%</span>
          </div>
          <ProgressBar progress={task.progress} />
        </div>
      </div>

      {/* Footer: Colleagues */}
      <div className="px-5 py-3.5 bg-surfaceHover/50 border-t border-border flex items-center justify-between relative z-10 transition-colors group-hover:bg-surfaceHover/80">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mr-1">Team</span>
          <div className="flex -space-x-2">
            {coworkers.slice(0, 4).map((colleague, i) => (
              <div key={colleague.uid} className="inline-block rounded-full ring-2 ring-surface relative group/avatar hover:z-30 transition-transform hover:scale-110" style={{ zIndex: 10 - i }}>
                <Avatar name={colleague.name} size="sm" />
                <div className="absolute opacity-0 group-hover/avatar:opacity-100 transition-opacity bg-black border border-border text-white text-[10px] px-2 py-1 rounded bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap pointer-events-none shadow-xl font-medium">
                  {colleague.name}
                </div>
              </div>
            ))}
            {coworkers.length > 4 && (
              <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-surface ring-2 ring-surface border border-border text-[10px] font-bold text-text-primary z-0 shadow-sm">
                +{coworkers.length - 4}
              </div>
            )}
            {coworkers.length === 0 && (
              <span className="text-xs text-text-muted italic">Self</span>
            )}
          </div>
        </div>
        
        <span className="text-orange flex items-center justify-center w-8 h-8 rounded-full bg-orange/10 group-hover:bg-orange group-hover:text-white transition-colors duration-300">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </div>
  );
};

export default function WorkPartner() {
  const { tasks, loading, allUsers } = useTasks();
  const { user, isAdmin, effectiveUid } = useAuth();
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const sharedTasks = tasks.filter((t) => {
    const assignedArr = Array.isArray(t.assignedTo) ? t.assignedTo : (t.assignedTo ? [t.assignedTo] : []);
    const hasMultipleAssignees = assignedArr.length > 1;
    const hasWorkPartners = Array.isArray(t.workPartners) && t.workPartners.length > 0;
    
    let isIncluded = false;
    if (isAdmin) {
      isIncluded = hasMultipleAssignees || hasWorkPartners;
    } else {
      const isMultiAssignee = hasMultipleAssignees && assignedArr.includes(effectiveUid);
      const isWorkPartner = hasWorkPartners && t.workPartners.some((p) => p.uid === effectiveUid);
      const isCreatorWithPartners = hasWorkPartners && t.createdBy === effectiveUid;
      isIncluded = isMultiAssignee || isWorkPartner || isCreatorWithPartners;
    }

    if (!isIncluded) return false;
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    
    return true;
  });

  // Get colleagues for the selected task
  const selectedColleagues = selectedTask
    ? [
        ...(Array.isArray(selectedTask.assignedTo) ? selectedTask.assignedTo : (selectedTask.assignedTo ? [selectedTask.assignedTo] : [])),
        ...(Array.isArray(selectedTask.workPartners) ? selectedTask.workPartners.map(p => p.uid) : [])
      ]
      .filter((uid, index, array) => array.indexOf(uid) === index)
      .filter(uid => uid !== effectiveUid)
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
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/5 pb-6 mb-6 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-orange/5 via-orange/5 to-transparent blur-3xl -z-10 rounded-full" />
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-text-primary to-text-secondary tracking-tight">Work Partners</h1>
          <p className="text-sm text-text-secondary mt-1.5 max-w-lg leading-relaxed">
            Collaborate, track, and manage complex cross-functional tasks assigned to multiple team members seamlessly.
          </p>
        </div>

        {/* Dynamic Filters */}
        <div className="flex bg-surfaceHover/50 p-1 rounded-xl border border-border shadow-inner mt-2 sm:mt-0">
           {['all', 'pending', 'in-progress', 'completed'].map(status => (
             <button
               key={status}
               onClick={() => setFilterStatus(status)}
               className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all duration-300 ${filterStatus === status ? 'bg-surface border border-border shadow-md text-orange scale-105' : 'text-text-muted hover:text-text-primary hover:bg-surfaceHover'}`}
             >
               {status === 'all' ? 'All Tasks' : status}
             </button>
           ))}
        </div>
      </div>

      {sharedTasks.length === 0 ? (
        <div className="card flex flex-col items-center justify-center text-center py-24 bg-gradient-to-br from-surface to-surfaceHover border-dashed border-2 border-border/50 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-orange/5 rounded-full blur-3xl" />
          <div className="text-6xl mb-6 relative animate-bounce">🤝</div>
          <h3 className="text-xl font-black text-text-primary mb-2 relative">No shared tasks found</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto relative leading-relaxed">
             {filterStatus === 'all' 
               ? "When you and a colleague are assigned to the same task, they'll appear here." 
               : `You have no ${filterStatus} tasks right now. Try changing to a different filter.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sharedTasks.map(task => (
            <WorkPartnerCard
              key={task.id}
              task={task}
              currentUid={effectiveUid}
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
