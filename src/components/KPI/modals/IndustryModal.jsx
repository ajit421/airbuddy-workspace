/**
 * IndustryModal.jsx
 * KPI Module — Add / Edit Industry modal.
 *
 * Props:
 *   isOpen   {boolean}      — controls visibility
 *   onClose  {function}     — called when the modal should dismiss
 *   onSaved  {function}     — called after a successful save
 *   item     {Object|null}  — null = create mode; object = edit mode
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiIndustry, updateKpiIndustry } from '../../../services/kpiService';

// ─── Reusable field wrapper ───────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        {label}
        {required && <span className="text-orange ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// Shared input className — matches EmployeeModal.jsx exactly
const inputCls = `w-full px-3 py-2 rounded-lg bg-background border border-border
  text-text-primary text-sm placeholder:text-text-muted
  focus:outline-none focus:ring-2 focus:ring-orange/50 focus:border-orange
  transition-colors`;

const STATUS_OPTIONS = ['Active', 'Paused', 'Inactive'];

const EMPTY_FORM = { name: '', status: 'Active', growthPercent: '' };

export default function IndustryModal({ isOpen, onClose, onSaved, item }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        name:          item.name          || '',
        status:        item.status        || 'Active',
        growthPercent: item.growthPercent != null ? String(item.growthPercent) : '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [item, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Industry name is required.');

    const pct = Number(form.growthPercent);
    if (form.growthPercent !== '' && (isNaN(pct) || pct < 0 || pct > 100)) {
      return setError('Growth % must be a number between 0 and 100.');
    }

    const payload = {
      name:          form.name.trim(),
      status:        form.status || 'Active',
      growthPercent: form.growthPercent !== '' ? pct : 0,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiIndustry(item.id, payload);
      } else {
        await addKpiIndustry(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Industry' : 'Add Industry'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Industry Name" required>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Motors, Drone, PCB..."
            className={inputCls}
          />
        </Field>

        <Field label="Status">
          <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Growth %">
          <input
            name="growthPercent"
            type="number"
            min="0"
            max="100"
            value={form.growthPercent}
            onChange={handleChange}
            placeholder="0 – 100"
            className={inputCls}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 rounded-lg text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Industry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
