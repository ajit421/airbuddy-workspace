/**
 * ProductModal.jsx
 * KPI Module — Add / Edit Product modal.
 *
 * Props:
 *   isOpen   {boolean}      — controls visibility
 *   onClose  {function}     — called when the modal should dismiss
 *   onSaved  {function}     — called after a successful save
 *   item     {Object|null}  — null = create mode; object = edit mode
 *
 * New fields (Section 1 & 3):
 *   stage       — "Design" | "Testing" | "Iteration" | "Design Freeze"
 *                 auto-derives devProgressPercent (no longer stored as a separate field)
 *   industryIds — string[] of kpi_industries doc IDs (multi-select checkboxes)
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiProduct, updateKpiProduct } from '../../../services/kpiService';
import { useKpi, DEV_STAGE_PROGRESS } from '../../../context/KpiContext';

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

export const DEV_STAGES = Object.keys(DEV_STAGE_PROGRESS);

const EMPTY_FORM = {
  name: '',
  type: '',
  stage: '',
  devCompleted: false,
  industryIds: [],
};

export default function ProductModal({ isOpen, onClose, onSaved, item }) {
  const { industries } = useKpi();
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        name:         item.name         || '',
        type:         item.type         || '',
        stage:        item.stage        || '',
        devCompleted: item.stage === 'Design Freeze' ? true : (item.devCompleted ?? false),
        industryIds:  Array.isArray(item.industryIds) ? item.industryIds : [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [item, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'stage') {
      // Auto-set devCompleted when stage reaches Design Freeze
      setForm((prev) => ({
        ...prev,
        stage: value,
        devCompleted: value === 'Design Freeze' ? true : prev.devCompleted,
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  const handleIndustryToggle = (industryId) => {
    setForm((prev) => {
      const current = prev.industryIds;
      return {
        ...prev,
        industryIds: current.includes(industryId)
          ? current.filter((id) => id !== industryId)
          : [...current, industryId],
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) return setError('Product name is required.');

    const payload = {
      name:        form.name.trim(),
      type:        form.type.trim() || '',
      stage:       form.stage || '',
      devCompleted: form.stage === 'Design Freeze' ? true : form.devCompleted,
      industryIds: form.industryIds,
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

        <Field label="Development Stage">
          <select name="stage" value={form.stage} onChange={handleChange} className={inputCls}>
            <option value="">— Not set —</option>
            {DEV_STAGES.map((s) => (
              <option key={s} value={s}>
                {s} ({DEV_STAGE_PROGRESS[s]}%)
              </option>
            ))}
          </select>
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
            <span className="text-sm text-text-secondary">
              Mark as dev-completed
              {form.stage === 'Design Freeze' && (
                <span className="ml-1 text-green-400 text-xs">(auto-set by Design Freeze stage)</span>
              )}
            </span>
          </label>
        </Field>

        {industries.length > 0 && (
          <Field label="Industry Variants">
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto border border-border rounded-lg px-3 py-2 bg-background">
              {industries.map((ind) => (
                <label key={ind.id} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.industryIds.includes(ind.id)}
                    onChange={() => handleIndustryToggle(ind.id)}
                    className="w-4 h-4 accent-orange rounded flex-shrink-0"
                  />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                    {ind.name}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1">
              {form.industryIds.length === 0
                ? 'No industries linked'
                : `${form.industryIds.length} industr${form.industryIds.length === 1 ? 'y' : 'ies'} linked`}
            </p>
          </Field>
        )}

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
