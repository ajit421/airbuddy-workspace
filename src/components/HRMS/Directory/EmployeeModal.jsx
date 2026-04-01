/**
 * EmployeeModal.jsx
 * HRMS Module — Add / Edit Employee modal.
 *
 * Props:
 *   isOpen    {boolean}       — controls visibility
 *   onClose   {function}      — called when the modal should dismiss
 *   onSaved   {function}      — called after a successful save so the parent can refresh
 *   employee  {Object|null}   — if set, the modal is in "edit" mode; null = "create" mode
 *   isAdmin   {boolean}       — when true the Salary Base field is visible
 */

import { useState, useEffect } from 'react';
import { addEmployee, updateEmployee } from '../../../services/hrmsService';

// ─── Constants ───────────────────────────────────────────────────────────────
const DEPARTMENTS = ['Engineering', 'HR', 'Design', 'Sales', 'Finance', 'Operations', 'Marketing'];

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

// Shared input className
const inputCls = `w-full px-3 py-2 rounded-lg bg-background border border-border
  text-text-primary text-sm placeholder:text-text-muted
  focus:outline-none focus:ring-2 focus:ring-orange/50 focus:border-orange
  transition-colors`;

// ─── Component ───────────────────────────────────────────────────────────────
export default function EmployeeModal({ isOpen, onClose, onSaved, employee, isAdmin }) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    email: '',
    department: '',
    designation: '',
    salaryBase: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  // Derived flag — are we editing an existing record or creating a new one?
  const isEditing = Boolean(employee);

  // Pre-fill the form when the modal opens in edit mode
  useEffect(() => {
    if (employee) {
      setForm({
        name:        employee.name        || '',
        email:       employee.email       || '',
        department:  employee.department  || '',
        designation: employee.designation || '',
        // salaryBase may be a number; convert to string for the input
        salaryBase:  employee.salaryBase != null ? String(employee.salaryBase) : '',
      });
    } else {
      // Reset for create mode
      setForm({ name: '', email: '', department: '', designation: '', salaryBase: '' });
    }
    setError('');
  }, [employee, isOpen]); // re-run whenever the modal's open state or target employee changes

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation
    if (!form.name.trim())  return setError('Name is required.');
    if (!form.email.trim()) return setError('Email is required.');

    // Build the payload — only include salaryBase if admin and value provided
    const payload = {
      name:        form.name.trim(),
      email:       form.email.trim(),
      department:  form.department  || '',
      designation: form.designation || '',
    };
    if (isAdmin && form.salaryBase !== '') {
      const parsed = parseFloat(form.salaryBase);
      if (isNaN(parsed) || parsed < 0) return setError('Salary Base must be a valid positive number.');
      payload.salaryBase = parsed;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateEmployee(employee.id, payload);
      } else {
        await addEmployee(payload);
      }
      onSaved(); // tell the parent to refresh the list
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Don't render anything when closed (keeps DOM clean)
  if (!isOpen) return null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} // close on backdrop click
    >
      {/* Modal panel */}
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl
                      flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">
              {isEditing ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              {isEditing ? 'Update HR details for this team member.' : 'Create a new employee record.'}
            </p>
          </div>
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary
                       hover:bg-background transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Form ───────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">

          {/* Name */}
          <Field label="Full Name" required>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Ajit Kumar"
              className={inputCls}
              autoComplete="off"
            />
          </Field>

          {/* Email */}
          <Field label="Email Address" required>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="e.g. ajit@airbuddy.in"
              className={inputCls}
              autoComplete="off"
              // Disable email editing in edit mode — email is an identity field
              disabled={isEditing}
            />
            {isEditing && (
              <p className="text-xs text-text-muted mt-0.5">Email cannot be changed after creation.</p>
            )}
          </Field>

          {/* Department */}
          <Field label="Department">
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              className={inputCls}
            >
              <option value="">— Select Department —</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>

          {/* Designation */}
          <Field label="Designation">
            <input
              type="text"
              name="designation"
              value={form.designation}
              onChange={handleChange}
              placeholder="e.g. Senior Engineer"
              className={inputCls}
              autoComplete="off"
            />
          </Field>

          {/* Salary Base — ADMIN ONLY: rendered only when isAdmin is true */}
          {isAdmin && (
            <Field label="Salary Base (₹ / month)">
              <input
                type="number"
                name="salaryBase"
                value={form.salaryBase}
                onChange={handleChange}
                placeholder="e.g. 45000"
                min="0"
                step="500"
                className={inputCls}
              />
              <p className="text-xs text-text-muted mt-0.5">
                Visible to admins only. Leave blank to keep unchanged.
              </p>
            </Field>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </form>

        {/* ── Footer / Actions ────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-background/50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-text-secondary
                       border border-border hover:bg-surface transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="employee-form" // won't work across elements — use onClick instead
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white
                       bg-orange hover:bg-orange-hover transition-colors
                       disabled:opacity-60 flex items-center gap-2"
          >
            {saving && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
