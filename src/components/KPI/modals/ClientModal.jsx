/**
 * ClientModal.jsx
 * KPI Module — Add / Edit Client modal.
 *
 * Props:
 *   isOpen      {boolean}      — controls visibility
 *   onClose     {function}     — called when the modal should dismiss
 *   onSaved     {function}     — called after a successful save
 *   item        {Object|null}  — null = create mode; object = edit mode
 *   industries  {Array}        — list of industry objects for the picker dropdown
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiClient, updateKpiClient } from '../../../services/kpiService';

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

const inputCls = `w-full px-3 py-2 rounded-lg bg-background border border-border
  text-text-primary text-sm placeholder:text-text-muted
  focus:outline-none focus:ring-2 focus:ring-orange/50 focus:border-orange
  transition-colors`;

const EMPTY_FORM = { name: '', industryId: '', currentStatus: '', progressPercent: '' };

export default function ClientModal({ isOpen, onClose, onSaved, item, industries = [] }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        name:            item.name            || '',
        industryId:      item.industryId      || '',
        currentStatus:   item.currentStatus   || '',
        progressPercent: item.progressPercent != null ? String(item.progressPercent) : '',
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

    if (!form.name.trim()) return setError('Client name is required.');

    const pct = Number(form.progressPercent);
    if (form.progressPercent !== '' && (isNaN(pct) || pct < 0 || pct > 100)) {
      return setError('Progress % must be a number between 0 and 100.');
    }

    const payload = {
      name:            form.name.trim(),
      industryId:      form.industryId      || '',
      currentStatus:   form.currentStatus.trim() || '',
      progressPercent: form.progressPercent !== '' ? pct : 0,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiClient(item.id, payload);
      } else {
        await addKpiClient(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Client' : 'Add Client'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Client Name" required>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Voltas, V-Guard..."
            className={inputCls}
          />
        </Field>

        <Field label="Industry">
          <select name="industryId" value={form.industryId} onChange={handleChange} className={inputCls}>
            <option value="">— Select an industry —</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.id}>{ind.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Current Status">
          <input
            name="currentStatus"
            value={form.currentStatus}
            onChange={handleChange}
            placeholder="e.g. Active, On Hold…"
            className={inputCls}
          />
        </Field>

        <Field label="Progress %">
          <input
            name="progressPercent"
            type="number"
            min="0"
            max="100"
            value={form.progressPercent}
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
