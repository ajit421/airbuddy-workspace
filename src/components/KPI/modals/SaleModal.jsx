/**
 * SaleModal.jsx
 * KPI Module — Add / Edit Sale modal.
 *
 * Props:
 *   isOpen    {boolean}      — controls visibility
 *   onClose   {function}     — called when the modal should dismiss
 *   onSaved   {function}     — called after a successful save
 *   item      {Object|null}  — null = create mode; object = edit mode
 *   products  {Array}        — list of product objects for the picker dropdown
 *   clients   {Array}        — list of client objects for the client picker dropdown
 *
 * New fields (Section 5):
 *   type     — "B2B Sale" | "Paid Pilot"
 *   clientId — kpi_clients document ID (optional link to a client)
 */

import { useState, useEffect } from 'react';
import Modal from '../../shared/Modal';
import { addKpiSale, updateKpiSale } from '../../../services/kpiService';

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

export const SALE_TYPES = ['B2B Sale', 'Paid Pilot'];

const EMPTY_FORM = {
  productId: '',
  clientId: '',
  type: '',
  unitsSold: '',
  salesProgressPercent: '',
  launched: false,
};

export default function SaleModal({ isOpen, onClose, onSaved, item, products = [], clients = [] }) {
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const isEditing = Boolean(item);

  useEffect(() => {
    if (item) {
      setForm({
        productId:            item.productId            || '',
        clientId:             item.clientId             || '',
        type:                 item.type                 || '',
        unitsSold:            item.unitsSold            != null ? String(item.unitsSold) : '',
        salesProgressPercent: item.salesProgressPercent != null ? String(item.salesProgressPercent) : '',
        launched:             item.launched             ?? false,
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

    if (!form.productId) return setError('Please select a product.');

    const units = Number(form.unitsSold);
    if (form.unitsSold !== '' && (isNaN(units) || units < 0)) {
      return setError('Units Sold must be a non-negative number.');
    }

    const pct = Number(form.salesProgressPercent);
    if (form.salesProgressPercent !== '' && (isNaN(pct) || pct < 0 || pct > 100)) {
      return setError('Sales Progress % must be a number between 0 and 100.');
    }

    const payload = {
      productId:            form.productId,
      clientId:             form.clientId  || '',
      type:                 form.type      || '',
      unitsSold:            form.unitsSold !== '' ? units : 0,
      salesProgressPercent: form.salesProgressPercent !== '' ? pct : 0,
      launched:             form.launched,
    };

    setSaving(true);
    try {
      if (isEditing) {
        await updateKpiSale(item.id, payload);
      } else {
        await addKpiSale(payload);
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
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Sale Entry' : 'Add Sale Entry'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Field label="Sale Type">
          <select name="type" value={form.type} onChange={handleChange} className={inputCls}>
            <option value="">— Select type —</option>
            {SALE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <Field label="Product" required>
          <select name="productId" value={form.productId} onChange={handleChange} className={inputCls}>
            <option value="">— Select a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Client">
          <select name="clientId" value={form.clientId} onChange={handleChange} className={inputCls}>
            <option value="">— No client linked —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Units Sold">
          <input
            name="unitsSold"
            type="number"
            min="0"
            value={form.unitsSold}
            onChange={handleChange}
            placeholder="e.g. 250"
            className={inputCls}
          />
        </Field>

        <Field label="Sales Progress %">
          <input
            name="salesProgressPercent"
            type="number"
            min="0"
            max="100"
            value={form.salesProgressPercent}
            onChange={handleChange}
            placeholder="0 – 100"
            className={inputCls}
          />
        </Field>

        <Field label="Launched">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              name="launched"
              type="checkbox"
              checked={form.launched}
              onChange={handleChange}
              className="w-4 h-4 accent-orange rounded"
            />
            <span className="text-sm text-text-secondary">Mark as launched</span>
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
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Sale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
