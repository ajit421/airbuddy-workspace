import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createPersonalTask } from '../../services/taskService';
import Modal from '../shared/Modal';

const EMPTY_FORM = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium',
};

export default function SelfTaskModal({ isOpen, onClose }) {
  // effectiveUid, not userProfile.uid: firestore.rules checks
  // `createdBy == getEffectiveUid()` on create and TaskContext queries
  // `assignedTo array-contains effectiveUid`.
  const { effectiveUid } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  /**
   * Reset the form every time the modal opens.
   *
   * This component stays mounted while closed (`if (!isOpen) return null` only
   * skips the render), so without this the previous task's title/description
   * survived the close. Re-opening "New Personal Task" showed the task that had
   * just been created instead of a blank form: the user could not start a new
   * one without reloading the page, and re-submitting the pre-filled form
   * created duplicate copies of the same task. Matches RoadmapTaskModal.
   */
  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM);
      setSaveError('');
      setSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Guard the submit itself, not just the button: Enter in a text input can
    // fire submit again before the disabled state has rendered.
    if (saving) return;
    if (!form.title.trim()) return;

    setSaving(true);
    setSaveError('');
    try {
      await createPersonalTask(form, effectiveUid);
      setForm(EMPTY_FORM);
      onClose();
    } catch (err) {
      console.error('Failed to create personal task:', err);
      setSaveError(err?.message || 'Failed to create task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Personal Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
            Task Name *
          </label>
          <input
            type="text"
            required
            autoFocus
            className="input-field"
            placeholder="E.g., Update monthly report"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
            Description
          </label>
          <textarea
            className="input-field min-h-[80px]"
            placeholder="Optional details..."
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
              Due Date
            </label>
            <input
              type="date"
              className="input-field"
              value={form.dueDate}
              onChange={e => setForm({ ...form, dueDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
              Priority
            </label>
            <select
              className="input-field"
              value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded-lg px-3 py-2">
            {saveError}
          </p>
        )}

        <div className="pt-4 flex justify-end gap-3 border-t border-border">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary text-sm">
            {saving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
