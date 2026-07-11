/**
 * ProductModal.jsx
 * KPI Module — Add / Edit Product modal.
 *
 * Props:
 *   isOpen   {boolean}      — controls visibility
 *   onClose  {function}     — called when the modal should dismiss
 *   onSaved  {function}     — called after a successful save
 *   item     {Object|null}  — null = create mode; object = edit mode
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiProduct, updateKpiProduct } from '../../../services/kpiService';

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

const EMPTY_FORM = { name: '', type: '', devProgressPercent: '', devCompleted: false };

export default function ProductModal({ isOpen, onClose, onSaved, item }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        name:               item.name               || '',
        type:               item.type               || '',
        devProgressPercent: item.devProgressPercent != null ? String(item.devProgressPercent) : '',
        devCompleted:       item.devCompleted        ?? false,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [item, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Product name is required.');

    const pct = Number(form.devProgressPercent);
    if (form.devProgressPercent !== '' && (isNaN(pct) || pct < 0 || pct > 100)) {
      return setError('Dev Progress % must be a number between 0 and 100.');
    }

    const payload = {
      name:               form.name.trim(),
      type:               form.type.trim() || '',
      devProgressPercent: form.devProgressPercent !== '' ? pct : 0,
      devCompleted:       form.devCompleted,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiProduct(item.id, payload);
      } else {
        await addKpiProduct(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Product' : 'Add Product'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Product Name" required>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Pravah, VyomX..."
            className={inputCls}
          />
        </Field>

        <Field label="Type">
          <input
            name="type"
            value={form.type}
            onChange={handleChange}
            placeholder="e.g. Ceiling fan, Drone, PCB motor..."
            className={inputCls}
          />
        </Field>

        <Field label="Dev Progress %">
          <input
            name="devProgressPercent"
            type="number"
            min="0"
            max="100"
            value={form.devProgressPercent}
            onChange={handleChange}
            placeholder="0 – 100"
            className={inputCls}
          />
        </Field>

        <Field label="Development Completed">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              name="devCompleted"
              type="checkbox"
              checked={form.devCompleted}
              onChange={handleChange}
              className="w-4 h-4 accent-orange rounded"
            />
            <span className="text-sm text-text-secondary">Mark as dev-completed</span>
          </label>
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
