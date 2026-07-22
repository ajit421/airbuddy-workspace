import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { canEditRoadmapStructure, canUpdateProgress } from '../../utils/permissions';
import { updateRoadmapTask, deleteRoadmapTask } from '../../services/roadmapTaskService';
import { formatDate, getDueDateColor, getDueDateLabel } from '../../utils/dateHelpers';
import { PriorityBadge, StatusBadge, ProgressBar } from '../shared/TaskCard';

/**
 * RoadmapTaskCard.jsx
 * Renders a single roadmap task with role-aware controls.
 *
 * Three permission modes:
 *  - Admin          → full view + Edit button (opens modal) + Delete button
 *  - Assigned emp.  → read-only view + inline status/progress/completion note controls
 *  - Unassigned emp → read-only view only
 *
 * Props:
 *  - task      {object}    Full task document from Firestore
 *  - nodeId    {string}    Parent roadmap node ID (needed for service calls)
 *  - allUsers  {Array}     All team members (for displaying assignee names)
 *  - onEdit    {function}  Admin: called with task to open edit modal
 */

const TASK_STATUS_OPTIONS = ['pending', 'in-progress', 'completed'];

const PRIORITY_BADGE = {
  high:   'badge-high',
  medium: 'badge-medium',
  low:    'badge-low',
};

export default function RoadmapTaskCard({ task, nodeId, allUsers = [], onEdit }) {
  const { userProfile, effectiveUid } = useAuth();
  const isAdmin      = canEditRoadmapStructure(userProfile);
  const canProgress  = canUpdateProgress(task, userProfile);

  // Inline employee update state
  const [expanded,        setExpanded]       = useState(false);
  const [editStatus,      setEditStatus]     = useState(task.status);
  const [editProgress,    setEditProgress]   = useState(task.progress ?? 0);
  const [completionNote,  setCompletionNote] = useState(task.completionNote ?? '');
  const [saving,          setSaving]         = useState(false);
  const [saveError,       setSaveError]      = useState('');
  const [deleting,        setDeleting]       = useState(false);

  // Reset inline edit state when task prop changes (realtime update from Firestore)
  // Only reset if not currently in edit mode to avoid disrupting user input
  const isEditing = expanded;

  const dueDateColor = getDueDateColor(task.dueDate, task.status);
  const dueDateLabel = getDueDateLabel(task.dueDate, task.status);

  // Resolve assignee display names
  const assigneeNames = (task.assignedTo ?? []).map((uid) => {
    const u = allUsers.find((x) => x.uid === uid);
    return u?.name ?? uid;
  });

  // ── Employee inline save ──────────────────────────────────────────────────
  const handleProgressSave = async () => {
    const uid = effectiveUid ?? userProfile?.uid;
    if (!uid) return;
    setSaving(true);
    setSaveError('');
    try {
      // Only send the restricted employee-allowed fields
      const payload = {
        status:         editStatus,
        progress:       editProgress,
        completionNote: editStatus === 'completed' ? completionNote : '',
      };
      await updateRoadmapTask(nodeId, task.id, payload, uid);
      setExpanded(false);
    } catch (err) {
      console.error('[RoadmapTaskCard] updateRoadmapTask:', err);
      setSaveError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Admin delete ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    const confirmed = window.confirm(`Delete task "${task.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteRoadmapTask(nodeId, task.id);
    } catch (err) {
      console.error('[RoadmapTaskCard] deleteRoadmapTask:', err);
      alert(`Failed to delete task: ${err.message}`);
      setDeleting(false);
    }
  };

  return (
    <div className={`
      rounded-xl border transition-all duration-200 overflow-hidden
      ${expanded ? 'border-orange/50 bg-orange-muted/10' : 'border-border bg-surface hover:border-border/80 hover:bg-surfaceHover'}
    `}>
      {/* ── Card header ────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-3">

        {/* Status indicator dot */}
        <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${
          task.status === 'completed'   ? 'bg-green-400' :
          task.status === 'in-progress' ? 'bg-blue-400'  :
          task.status === 'pending'     ? 'bg-yellow-400': 'bg-text-muted'
        }`} />

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug ${task.status === 'completed' ? 'line-through text-text-muted' : 'text-text-primary'}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{task.description}</p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <StatusBadge   status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.dueDate && (
              <span className={`text-[10px] font-medium ${dueDateColor}`}>
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mt-2">
            <ProgressBar progress={task.progress} className="flex-1" />
            <span className="text-[10px] font-semibold text-text-muted w-7 text-right flex-shrink-0">
              {task.progress ?? 0}%
            </span>
          </div>

          {/* Assignees */}
          {assigneeNames.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <svg className="w-3 h-3 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[10px] text-text-muted truncate">
                {assigneeNames.join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons — right side */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Employee: update progress toggle */}
          {!isAdmin && canProgress && (
            <button
              onClick={() => {
                setEditStatus(task.status);
                setEditProgress(task.progress ?? 0);
                setCompletionNote(task.completionNote ?? '');
                setSaveError('');
                setExpanded((v) => !v);
              }}
              className={`btn-ghost p-1.5 rounded-lg text-xs ${expanded ? 'text-orange bg-orange-muted' : ''}`}
              title="Update progress"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          )}

          {/* Admin: edit button */}
          {isAdmin && (
            <button
              onClick={() => onEdit?.(task)}
              className="btn-ghost p-1.5 rounded-lg"
              title="Edit task"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {/* Admin: delete button */}
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-ghost p-1.5 rounded-lg hover:text-red-400 disabled:opacity-50"
              title="Delete task"
            >
              {deleting ? (
                <div className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Employee inline update panel ────────────────────────────────── */}
      {expanded && canProgress && !isAdmin && (
        <div className="border-t border-border/50 px-3 pb-3 pt-3 space-y-3 animate-fade-in">

          {/* Status select */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Status</label>
            <select
              value={editStatus}
              onChange={(e) => {
                setEditStatus(e.target.value);
                // Auto-set progress to 100 when completed
                if (e.target.value === 'completed') setEditProgress(100);
                if (e.target.value === 'pending')   setEditProgress(0);
              }}
              className="select-field text-xs h-8"
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Progress slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Progress</label>
              <span className="text-xs font-bold text-orange">{editProgress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={editProgress}
              onChange={(e) => setEditProgress(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-orange"
            />
            <div className="flex justify-between text-[9px] text-text-muted">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          {/* Completion note — only when status = completed */}
          {editStatus === 'completed' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Completion Note</label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Optional: describe what was delivered…"
                rows={2}
                className="input-field text-xs resize-none"
              />
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <p className="text-red-400 text-xs">{saveError}</p>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="btn-secondary flex-1 justify-center text-xs h-7"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleProgressSave}
              className="btn-primary flex-1 justify-center text-xs h-7"
              disabled={saving}
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
