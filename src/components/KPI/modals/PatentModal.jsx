/**
 * PatentModal.jsx
 * KPI Module — Add / Edit Patent modal.
 *
 * Props:
 *   isOpen   {boolean}      — controls visibility
 *   onClose  {function}     — called when the modal should dismiss
 *   onSaved  {function}     — called after a successful save
 *   item     {Object|null}  — null = create mode; object = edit mode
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiPatent, updateKpiPatent } from '../../../services/kpiService';

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

export const FILING_STAGES = [
  'Idea',
  'Drafting',
  'Internal Review',
  'Filed',
  'Published',
  'RQ Filed',
  'Under Examination',
  'Granted',
  'Rejected',
];

const EMPTY_FORM = { title: '', filingStage: 'Idea', appNumber: '', fieldOfInvention: '' };

export default function PatentModal({ isOpen, onClose, onSaved, item }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        title:            item.title            || '',
        filingStage:      item.filingStage      || 'Idea',
        appNumber:        item.appNumber        || '',
        fieldOfInvention: item.fieldOfInvention || '',
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

    if (!form.title.trim()) return setError('Patent title is required.');

    const payload = {
      title:            form.title.trim(),
      filingStage:      form.filingStage || 'Idea',
      appNumber:        form.appNumber.trim(),
      fieldOfInvention: form.fieldOfInvention.trim(),
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiPatent(item.id, payload);
      } else {
        await addKpiPatent(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Patent' : 'Add Patent'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Patent Title" required>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="e.g. Non-magnetic PCB motor..."
            className={inputCls}
          />
        </Field>

        <Field label="Filing Stage">
          <select name="filingStage" value={form.filingStage} onChange={handleChange} className={inputCls}>
            {FILING_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>

        <Field label="Application Number">
          <input
            name="appNumber"
            value={form.appNumber}
            onChange={handleChange}
            placeholder="e.g. 202531082225"
            className={inputCls}
          />
        </Field>

        <Field label="Field of Invention">
          <input
            name="fieldOfInvention"
            value={form.fieldOfInvention}
            onChange={handleChange}
            placeholder="e.g. Electrical or Mechanical"
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Patent'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
