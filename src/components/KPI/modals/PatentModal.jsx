/**
 * PatentModal.jsx
 * KPI Module — Add / Edit IP entry modal.
 * Handles Patents, Trademarks, and Software/Calculator entries.
 *
 * Props:
 *   isOpen   {boolean}      — controls visibility
 *   onClose  {function}     — called when the modal should dismiss
 *   onSaved  {function}     — called after a successful save
 *   item     {Object|null}  — null = create mode; object = edit mode
 *
 * ipType field (Section 4):
 *   "Patent"              — title, filingStage, appNumber, fieldOfInvention
 *   "Trademark"           — title, trademarkClass, filingStage (TM-specific stages)
 *   "Software/Calculator" — toolName, status, repoOrToolLink
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiIP, updateKpiIP } from '../../../services/kpiService';

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

export const TRADEMARK_FILING_STAGES = [
  'Filed',
  'Registered',
  'Opposed',
  'Rejected',
];

export const SOFTWARE_STATUSES = ['In Dev', 'Live', 'Deprecated'];

export const IP_TYPES = ['Patent', 'Trademark', 'Software/Calculator'];

const EMPTY_FORM = {
  ipType: 'Patent',
  // Patent & Trademark shared
  title: '',
  filingStage: 'Idea',
  // Patent specific
  appNumber: '',
  fieldOfInvention: '',
  // Trademark specific
  trademarkClass: '',
  // Software/Calculator specific
  toolName: '',
  status: 'In Dev',
  repoOrToolLink: '',
};

export default function PatentModal({ isOpen, onClose, onSaved, item }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        ipType:           item.ipType           || 'Patent',
        title:            item.title            || '',
        filingStage:      item.filingStage      || 'Idea',
        appNumber:        item.appNumber        || '',
        fieldOfInvention: item.fieldOfInvention || '',
        trademarkClass:   item.trademarkClass   || '',
        toolName:         item.toolName         || '',
        status:           item.status           || 'In Dev',
        repoOrToolLink:   item.repoOrToolLink   || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError('');
  }, [item, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'ipType') {
      // Reset stage/status when switching types
      setForm((prev) => ({
        ...prev,
        ipType: value,
        filingStage: value === 'Trademark' ? 'Filed' : 'Idea',
        status: 'In Dev',
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let payload = { ipType: form.ipType };

    if (form.ipType === 'Patent') {
      if (!form.title.trim()) return setError('Patent title is required.');
      payload = {
        ...payload,
        title:            form.title.trim(),
        filingStage:      form.filingStage || 'Idea',
        appNumber:        form.appNumber.trim(),
        fieldOfInvention: form.fieldOfInvention.trim(),
      };
    } else if (form.ipType === 'Trademark') {
      if (!form.title.trim()) return setError('Trademark name is required.');
      payload = {
        ...payload,
        title:          form.title.trim(),
        trademarkClass: form.trademarkClass.trim(),
        filingStage:    form.filingStage || 'Filed',
      };
    } else if (form.ipType === 'Software/Calculator') {
      if (!form.toolName.trim()) return setError('Tool name is required.');
      payload = {
        ...payload,
        // Use toolName as the canonical title for sorting
        title:          form.toolName.trim(),
        toolName:       form.toolName.trim(),
        status:         form.status || 'In Dev',
        repoOrToolLink: form.repoOrToolLink.trim(),
      };
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiIP(item.id, payload);
      } else {
        await addKpiIP(payload);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = isEditing
    ? `Edit ${item?.ipType || 'IP'}`
    : `Add IP Entry`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* IP Type selector — always shown */}
        <Field label="IP Type" required>
          <select name="ipType" value={form.ipType} onChange={handleChange} className={inputCls}>
            {IP_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        {/* ── Patent fields ── */}
        {form.ipType === 'Patent' && (
          <>
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
          </>
        )}

        {/* ── Trademark fields ── */}
        {form.ipType === 'Trademark' && (
          <>
            <Field label="Trademark Name" required>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. AirBuddy™"
                className={inputCls}
              />
            </Field>

            <Field label="Trademark Class">
              <input
                name="trademarkClass"
                value={form.trademarkClass}
                onChange={handleChange}
                placeholder="e.g. Class 7 (Machinery)"
                className={inputCls}
              />
            </Field>

            <Field label="Filing Stage">
              <select name="filingStage" value={form.filingStage} onChange={handleChange} className={inputCls}>
                {TRADEMARK_FILING_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {/* ── Software / Calculator fields ── */}
        {form.ipType === 'Software/Calculator' && (
          <>
            <Field label="Tool Name" required>
              <input
                name="toolName"
                value={form.toolName}
                onChange={handleChange}
                placeholder="e.g. Pravah CFD Calculator"
                className={inputCls}
              />
            </Field>

            <Field label="Status">
              <select name="status" value={form.status} onChange={handleChange} className={inputCls}>
                {SOFTWARE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>

            <Field label="Repo / Tool Link">
              <input
                name="repoOrToolLink"
                value={form.repoOrToolLink}
                onChange={handleChange}
                placeholder="https://..."
                className={inputCls}
              />
            </Field>
          </>
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add IP Entry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
