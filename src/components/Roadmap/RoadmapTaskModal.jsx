import { useState, useEffect, useRef } from 'react';
import Modal from '../shared/Modal';
import { useAuth } from '../../context/AuthContext';
import { createRoadmapTask, updateRoadmapTask } from '../../services/roadmapTaskService';
import { subscribeToAllUsers } from '../../services/teamMembersService';

/**
 * RoadmapTaskModal.jsx
 * Admin-only create/edit form for tasks under a roadmap node.
 * Wraps shared/Modal.jsx (size "md").
 *
 * Props:
 *  - isOpen    {boolean}       Controls modal visibility
 *  - onClose   {function}      Called on cancel or successful save
 *  - nodeId    {string}        Parent roadmap node ID (required)
 *  - task      {object|null}   null = create mode; object = edit mode (pre-fills form)
 */

const EMPTY_FORM = {
  title:       '',
  description: '',
  priority:    'medium',
  status:      'pending',
  dueDate:     '',
  assignedTo:  [],
};

function toInputDate(value) {
  if (!value) return '';
  let d;
  if (value?.toDate) d = value.toDate();
  else if (value instanceof Date) d = value;
  else d = new Date(value);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

export default function RoadmapTaskModal({ isOpen, onClose, nodeId, task = null }) {
  const { userProfile, effectiveUid } = useAuth();
  const isEdit = Boolean(task);

  const [form,      setForm]      = useState(EMPTY_FORM);
  const [errors,    setErrors]    = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  // Assignee picker
  const [allUsers,   setAllUsers]   = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const unsubRef = useRef(null);

  // Pre-fill form on open
  useEffect(() => {
    if (isOpen) {
      setSaveError('');
      setErrors({});
      setUserSearch('');
      if (isEdit && task) {
        setForm({
          title:       task.title       ?? '',
          description: task.description ?? '',
          priority:    task.priority    ?? 'medium',
          status:      task.status      ?? 'pending',
          dueDate:     toInputDate(task.dueDate),
          assignedTo:  Array.isArray(task.assignedTo) ? [...task.assignedTo] : [],
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, isEdit, task]);

  // Subscribe to users while modal is open
  useEffect(() => {
    if (!isOpen) return;
    unsubRef.current = subscribeToAllUsers(
      (users) => setAllUsers(users.sort((a, b) => a.name.localeCompare(b.name))),
      (err)   => console.error('[RoadmapTaskModal] subscribeToAllUsers:', err)
    );
    return () => { unsubRef.current?.(); };
  }, [isOpen]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const toggleAssignee = (uid) => {
    const cur = form.assignedTo;
    setField('assignedTo', cur.includes(uid) ? cur.filter((u) => u !== uid) : [...cur, uid]);
  };

  const filteredUsers = allUsers.filter(
    (u) => !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const uid = effectiveUid ?? userProfile?.uid;
    if (!uid) { setSaveError('Not authenticated'); return; }

    setSaving(true);
    setSaveError('');

    const payload = {
      title:       form.title.trim(),
      description: form.description.trim(),
      priority:    form.priority,
      status:      form.status,
      dueDate:     form.dueDate || null,
      assignedTo:  form.assignedTo,
    };

    try {
      if (isEdit) {
        await updateRoadmapTask(nodeId, task.id, payload, uid);
      } else {
        await createRoadmapTask(nodeId, payload, uid);
      }
      onClose();
    } catch (err) {
      console.error('[RoadmapTaskModal] save error:', err);
      setSaveError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = isEdit ? `Edit Task — ${task?.title ?? ''}` : 'Add Task';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="rm-task-title"
            type="text"
            placeholder="e.g. Design system component audit"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            className={`input-field ${errors.title ? 'border-red-500' : ''}`}
            autoFocus
          />
          {errors.title && <p className="text-red-400 text-xs">{errors.title}</p>}
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Description</label>
          <textarea
            id="rm-task-description"
            placeholder="Describe what needs to be done…"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={2}
            className="input-field resize-none"
          />
        </div>

        {/* Priority + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Priority</label>
            <select
              id="rm-task-priority"
              value={form.priority}
              onChange={(e) => setField('priority', e.target.value)}
              className="select-field"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Status</label>
            <select
              id="rm-task-status"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              className="select-field"
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Due Date */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Due Date</label>
          <input
            id="rm-task-due-date"
            type="date"
            value={form.dueDate}
            onChange={(e) => setField('dueDate', e.target.value)}
            className="input-field"
          />
        </div>

        {/* Assigned To */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Assigned To
          </label>

          {/* Selected pills */}
          {form.assignedTo.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-1">
              {form.assignedTo.map((uid) => {
                const u = allUsers.find((x) => x.uid === uid);
                return (
                  <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-muted border border-orange/30 text-xs text-orange font-medium">
                    {u?.name ?? uid}
                    <button type="button" onClick={() => toggleAssignee(uid)} className="hover:text-red-400">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search team members…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="input-field pl-8 text-xs"
            />
          </div>

          {/* User list */}
          <div className="max-h-32 overflow-y-auto border border-border rounded-lg divide-y divide-borderLight bg-background">
            {filteredUsers.length === 0 && (
              <p className="py-3 text-center text-xs text-text-muted">No team members found</p>
            )}
            {filteredUsers.map((u) => {
              const checked = form.assignedTo.includes(u.uid);
              return (
                <button
                  key={u.uid}
                  type="button"
                  onClick={() => toggleAssignee(u.uid)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors
                    ${checked ? 'bg-orange-muted text-orange' : 'hover:bg-surfaceHover text-text-secondary hover:text-text-primary'}`}
                >
                  <span className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold
                    ${checked ? 'bg-orange text-white' : 'bg-surfaceHover text-text-muted'}`}>
                    {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                  <span className="flex-1 font-medium truncate">{u.name}</span>
                  <span className="text-text-muted text-[10px] truncate">{u.customRole || u.role}</span>
                  {checked && (
                    <svg className="w-3 h-3 text-orange flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save error */}
        {saveError && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-xs">{saveError}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            id="rm-task-save-btn"
            type="submit"
            className="btn-primary min-w-[90px] justify-center"
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : isEdit ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
