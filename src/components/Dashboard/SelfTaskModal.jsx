import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import Modal from '../shared/Modal';

export default function SelfTaskModal({ isOpen, onClose }) {
  const { userProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    
    setSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: 'pending',
        progress: 0,
        // Assign to self
        assignedTo: [userProfile.uid],
        assignedBy: userProfile.uid,
        createdBy: userProfile.uid,
        isAdminTask: false, // Indicates this is a self-created task
        startDate: new Date(),
        dueDate: form.dueDate ? new Date(form.dueDate) : new Date(Date.now() + 86400000), // default to tomorrow
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to create personal task:', err);
      alert('Failed to create task. Please try again.');
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
