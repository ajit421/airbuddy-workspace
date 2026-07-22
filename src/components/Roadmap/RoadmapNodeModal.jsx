import { useState, useEffect, useRef } from 'react';
import Modal from '../shared/Modal';
import { useAuth } from '../../context/AuthContext';
import { createNode, updateNode } from '../../services/roadmapService';
import { subscribeToAllUsers } from '../../services/teamMembersService';
import { notifyUsers, ROADMAP_NOTIF_TYPES } from '../../services/notificationService';

/**
 * RoadmapNodeModal.jsx
 * Admin-only create/edit form for roadmap nodes. Wraps shared/Modal.jsx.
 *
 * Props:
 *  - isOpen      {boolean}       Controls modal visibility
 *  - onClose     {function}      Called on cancel or successful save
 *  - parentNode  {object|null}   Full parent node doc (null = root level)
 *  - node        {object|null}   null = create mode; object = edit mode (pre-fills form)
 *  - onCreated   {function}      Optional: called with newNodeId after successful create
 */

const EMPTY_FORM = {
  title:       '',
  description: '',
  status:      'pending',
  priority:    'medium',
  startDate:   '',
  dueDate:     '',
  assignedTo:  [],
  tags:        [],
};

/** Convert a Firestore Timestamp or Date or ISO string to YYYY-MM-DD for <input type="date"> */
function toInputDate(value) {
  if (!value) return '';
  let d;
  if (value?.toDate) d = value.toDate();
  else if (value instanceof Date) d = value;
  else d = new Date(value);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

export default function RoadmapNodeModal({
  isOpen,
  onClose,
  parentNode  = null,
  node        = null,
  onCreated,
}) {
  const { userProfile, effectiveUid } = useAuth();
  const isEdit = Boolean(node);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [tagInput,   setTagInput]   = useState('');
  const [errors,     setErrors]     = useState({});
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState('');

  // ── Users for assignee picker ──────────────────────────────────────────────
  const [allUsers,   setAllUsers]   = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const unsubUsersRef = useRef(null);

  // Pre-fill form when opening in edit mode
  useEffect(() => {
    if (isOpen) {
      setSaveError('');
      setErrors({});
      setTagInput('');
      setUserSearch('');
      if (isEdit && node) {
        setForm({
          title:       node.title       ?? '',
          description: node.description ?? '',
          status:      node.status      ?? 'pending',
          priority:    node.priority    ?? 'medium',
          startDate:   toInputDate(node.startDate),
          dueDate:     toInputDate(node.dueDate),
          assignedTo:  Array.isArray(node.assignedTo) ? [...node.assignedTo] : [],
          tags:        Array.isArray(node.tags)        ? [...node.tags]       : [],
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, isEdit, node]);

  // Subscribe to all users while modal is open (for assignee picker)
  useEffect(() => {
    if (!isOpen) return;
    unsubUsersRef.current = subscribeToAllUsers(
      (users) => setAllUsers(users.sort((a, b) => a.name.localeCompare(b.name))),
      (err)   => console.error('[RoadmapNodeModal] subscribeToAllUsers:', err)
    );
    return () => { unsubUsersRef.current?.(); };
  }, [isOpen]);

  // ── Field helpers ──────────────────────────────────────────────────────────
  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Tag input ──────────────────────────────────────────────────────────────
  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setField('tags', [...form.tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => setField('tags', form.tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
      removeTag(form.tags[form.tags.length - 1]);
    }
  };

  // ── Assignee picker ────────────────────────────────────────────────────────
  const toggleAssignee = (uid) => {
    const current = form.assignedTo;
    setField(
      'assignedTo',
      current.includes(uid) ? current.filter((u) => u !== uid) : [...current, uid]
    );
  };

  const filteredUsers = allUsers.filter((u) =>
    !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (form.dueDate && form.startDate && form.dueDate < form.startDate) {
      errs.dueDate = 'Due date must be after start date';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
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
      status:      form.status,
      priority:    form.priority,
      startDate:   form.startDate || null,
      dueDate:     form.dueDate   || null,
      assignedTo:  form.assignedTo,
      tags:        form.tags,
    };

    try {
      if (isEdit) {
        await updateNode(node.id, payload, uid);
        // Notify assignees when a milestone is marked completed
        const wasCompleted  = node.status === 'completed';
        const nowCompleted  = payload.status === 'completed';
        if (!wasCompleted && nowCompleted && payload.assignedTo.length > 0) {
          notifyUsers(
            payload.assignedTo,
            uid,
            `Milestone Completed: ${payload.title}`,
            `The milestone "${payload.title}" has been marked as completed.`,
            ROADMAP_NOTIF_TYPES.MILESTONE_COMPLETED
          ).catch((err) => console.warn('[RoadmapNodeModal] notify milestone:', err));
        }
        onClose();
      } else {
        const newId = await createNode(payload, uid, parentNode);
        onClose();
        onCreated?.(newId);
      }
    } catch (err) {
      console.error('[RoadmapNodeModal] save error:', err);
      setSaveError(err?.message ?? 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit
    ? `Edit — ${node?.title ?? 'Node'}`
    : parentNode
    ? `Add Child under "${parentNode.title}"`
    : 'Add Root Milestone';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            id="rm-node-title"
            type="text"
            placeholder="e.g. Q3 Product Launch"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            className={`input-field ${errors.title ? 'border-red-500 focus:ring-red-500' : ''}`}
            autoFocus
          />
          {errors.title && <p className="text-red-400 text-xs">{errors.title}</p>}
        </div>

        {/* ── Description ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Description
          </label>
          <textarea
            id="rm-node-description"
            placeholder="Describe this milestone or goal…"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={3}
            className="input-field resize-none"
          />
        </div>

        {/* ── Status + Priority ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Status
            </label>
            <select
              id="rm-node-status"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              className="select-field"
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Priority
            </label>
            <select
              id="rm-node-priority"
              value={form.priority}
              onChange={(e) => setField('priority', e.target.value)}
              className="select-field"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        {/* ── Start Date + Due Date ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Start Date
            </label>
            <input
              id="rm-node-start-date"
              type="date"
              value={form.startDate}
              onChange={(e) => setField('startDate', e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Due Date
            </label>
            <input
              id="rm-node-due-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setField('dueDate', e.target.value)}
              className={`input-field ${errors.dueDate ? 'border-red-500' : ''}`}
            />
            {errors.dueDate && <p className="text-red-400 text-xs">{errors.dueDate}</p>}
          </div>
        </div>

        {/* ── Assigned To ────────────────────────────────────────────────── */}
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
                  <span
                    key={uid}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-muted border border-orange/30 text-xs text-orange font-medium"
                  >
                    {u?.name ?? uid}
                    <button
                      type="button"
                      onClick={() => toggleAssignee(uid)}
                      className="hover:text-red-400 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search + dropdown list */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="rm-node-assignee-search"
              type="text"
              placeholder="Search team members…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="input-field pl-8 text-xs"
            />
          </div>

          <div className="max-h-36 overflow-y-auto border border-border rounded-lg divide-y divide-borderLight bg-background">
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
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors
                    ${checked ? 'bg-orange-muted text-orange' : 'hover:bg-surfaceHover text-text-secondary hover:text-text-primary'}`}
                >
                  {/* Avatar / initials */}
                  <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold
                    ${checked ? 'bg-orange text-white' : 'bg-surfaceHover text-text-muted'}`}>
                    {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                  <span className="flex-1 font-medium truncate">{u.name}</span>
                  <span className="text-text-muted truncate">{u.customRole || u.role}</span>
                  {checked && (
                    <svg className="w-3.5 h-3.5 text-orange flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tags ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Tags
          </label>
          <div className="flex flex-wrap gap-1.5 items-center min-h-[34px] px-3 py-1.5 bg-background border border-border rounded-lg focus-within:border-orange focus-within:ring-1 focus-within:ring-orange transition-colors">
            {form.tags.map((tag) => (
              <span key={tag} className="badge bg-surfaceHover border border-borderLight text-text-secondary text-[11px] flex items-center gap-1">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400 transition-colors">
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
            <input
              id="rm-node-tags"
              type="text"
              placeholder={form.tags.length === 0 ? 'Add tags (press Enter or comma)…' : ''}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              className="flex-1 min-w-[120px] bg-transparent text-text-primary text-xs outline-none placeholder-text-muted"
            />
          </div>
        </div>

        {/* ── Save error ─────────────────────────────────────────────────── */}
        {saveError && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-xs">{saveError}</p>
          </div>
        )}

        {/* ── Footer buttons ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            id="rm-node-save-btn"
            type="submit"
            className="btn-primary min-w-[100px] justify-center"
            disabled={saving}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
