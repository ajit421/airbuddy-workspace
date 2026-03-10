import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import Modal from '../shared/Modal';
import { PriorityBadge, StatusBadge, ProgressBar } from '../shared/TaskCard';
import { formatDate, formatDateTime, getDueDateLabel, getDueDateColor, isOverdue } from '../../utils/dateHelpers';
import { canEditTask, canUpdateProgress } from '../../utils/permissions';

export default function TaskDetailModal({ task, onClose }) {
  const { userProfile } = useAuth();
  const [progress, setProgress] = useState(task?.progress || 0);
  const [saving, setSaving] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');

  if (!task) return null;

  const canEdit = canEditTask(task, userProfile);
  const canUpdate = canUpdateProgress(task, userProfile);
  const overdue = isOverdue(task.dueDate) && task.status !== 'completed';
  const dueDays = getDueDateLabel(task.dueDate);
  const dueDateColor = getDueDateColor(task.dueDate);

  const handleProgressSave = async () => {
    if (!canUpdate) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        progress,
        status: progress === 100 ? 'completed' : progress > 0 ? 'in-progress' : 'pending',
        updatedAt: new Date(),
      });
    } catch (err) {
      console.error('Failed to update progress:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task.id) return;
    const isSelfCreated = task.isAdminTask === false && task.createdBy === userProfile.uid;
    const canDelete = userProfile?.role === 'admin' || isSelfCreated;
    
    if (!canDelete) return;
    
    if (window.confirm('Are you sure you want to delete this task?')) {
      setSaving(true);
      try {
        await deleteDoc(doc(db, 'tasks', task.id));
        onClose();
      } catch (err) {
        console.error('Failed to delete task:', err);
        alert('Failed to delete task.');
        setSaving(false);
      }
    }
  };

  const handleExtendDueDate = async () => {
    if (!newDueDate) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        dueDate: new Date(newDueDate),
        isExtended: true,
        updatedAt: new Date(),
      });
      setIsExtending(false);
    } catch (err) {
      console.error('Failed to extend task:', err);
      alert('Failed to extend due date.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!task} onClose={onClose} title="Task Details" size="lg">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-start gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-text-primary flex-1">{task.title}</h2>
            {task.isAdminTask === false && (
              <span className="badge bg-purple-500/10 text-purple-400 border border-purple-500/20">Self-Assigned</span>
            )}
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
          </div>
          {task.module && (
            <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mt-1">{task.module}</p>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Description</h4>
            <p className="text-sm text-text-secondary leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Start Date</h4>
            <p className="text-sm text-text-primary font-medium">{formatDate(task.startDate)}</p>
          </div>
          <div>
            <h4 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
              Due Date
              {task.isExtended && <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded">Extended</span>}
            </h4>
            
            {isExtending ? (
              <div className="mt-1 flex items-center gap-2">
                <input 
                  type="date"
                  className="input-field py-1 text-sm bg-surface max-w-[140px]"
                  value={newDueDate}
                  min={new Date().toISOString().split('T')[0]} // disallow past dates completely
                  onChange={e => setNewDueDate(e.target.value)}
                />
                <button onClick={handleExtendDueDate} disabled={saving} className="btn-primary text-xs py-1 px-2 shrink-0">
                  Save
                </button>
                <button onClick={() => setIsExtending(false)} className="text-text-muted hover:text-text-primary p-1">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between group">
                <div>
                  <p className={`text-sm font-medium ${task.isExtended ? 'text-red-400' : 'text-text-primary'}`}>{formatDate(task.dueDate)}</p>
                  <p className={`text-xs font-semibold mt-0.5 ${dueDateColor}`}>{dueDays}</p>
                </div>
                {canUpdate && task.status !== 'completed' && (
                  <button 
                    onClick={() => setIsExtending(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-orange hover:text-orange-hover flex items-center gap-1 mt-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Extend
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Progress</h4>
            <span className="text-sm font-bold text-text-primary">{progress}%</span>
          </div>
          {canUpdate ? (
            <div className="space-y-3">
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full h-2 bg-border rounded-full appearance-none cursor-pointer accent-orange"
              />
              <button
                onClick={handleProgressSave}
                disabled={saving}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {saving ? 'Saving...' : 'Save Progress'}
              </button>
            </div>
          ) : (
            <ProgressBar progress={task.progress} />
          )}
        </div>

        {/* Links */}
        {task.links?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Links</h4>
            <div className="space-y-1.5">
              {task.links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-orange hover:underline"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {link.label || link.url}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        {task.attachments?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Attachments</h4>
            <div className="space-y-1.5">
              {task.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {att.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timestamps and Actions */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span>Created {formatDate(task.createdAt)}</span>
            {task.updatedAt && <span>Updated {formatDate(task.updatedAt)}</span>}
          </div>
          
          {(userProfile?.role === 'admin' || (task.isAdminTask === false && task.createdBy === userProfile?.uid)) && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Task
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
