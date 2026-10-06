/**
 * PermissionsManager.jsx
 * Admin Panel → Permissions tab. A real admin clicks an employee and chooses
 * what that person can see and do (src/utils/permissionCatalog.js).
 *
 * Shown only to real admins outside "Viewing as Employee" mode; the rules let
 * only admins write users/{uid}.permissions either way.
 */

import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import Modal from '../shared/Modal';
import { formatDate } from '../../utils/dateHelpers';
import {
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_PRESETS,
  countGranted,
} from '../../utils/permissionCatalog';
import { updateUserPermissions, normalizePermissions } from '../../services/permissionService';

const Avatar = ({ user, size = 'w-10 h-10' }) => (
  user.avatar
    ? <img src={user.avatar} className={`${size} rounded-full border-2 border-border flex-shrink-0`} alt="" />
    : (
      <div className={`${size} rounded-full bg-orange-muted border-2 border-orange/30 flex items-center justify-center text-orange font-bold flex-shrink-0`}>
        {user.name?.[0]?.toUpperCase() || '?'}
      </div>
    )
);

const labelFor = (key) => PERMISSION_CATALOG.find((p) => p.key === key)?.label || key;

const grantedKeys = (user) => PERMISSION_KEYS.filter((k) => user.permissions?.[k] === true);

// ─── Summary line for one person ─────────────────────────────
const AccessSummary = ({ user }) => {
  if (user.role === 'admin') {
    return <span className="badge-orange">Full access (admin)</span>;
  }
  const keys = grantedKeys(user);
  if (keys.length === 0) {
    return <span className="text-xs text-text-muted">Standard employee access</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-orange/10 text-orange border border-orange/20">
          {labelFor(k)}
        </span>
      ))}
    </div>
  );
};

// ─── The per-employee editor (modal body) ─────────────────────
const PermissionEditor = ({ user, users, onClose }) => {
  const { effectiveUid } = useAuth();
  const [selection, setSelection] = useState(() => normalizePermissions(user.permissions));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key) => setSelection((prev) => ({ ...prev, [key]: !prev[key] }));

  const setGroup = (group, value) => setSelection((prev) => {
    const next = { ...prev };
    PERMISSION_CATALOG.filter((p) => p.group === group).forEach((p) => { next[p.key] = value; });
    return next;
  });

  const applyKeys = (keys) => setSelection(normalizePermissions(Object.fromEntries(keys.map((k) => [k, true]))));

  const copyFrom = (uid) => {
    const source = users.find((u) => u.uid === uid);
    if (source) setSelection(normalizePermissions(source.permissions));
  };

  const updatedByName = user.permissionsUpdatedBy
    ? (users.find((u) => u.uid === user.permissionsUpdatedBy)?.name || 'an admin')
    : null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await updateUserPermissions(user.uid, selection, effectiveUid);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const otherEmployees = users.filter((u) => u.uid !== user.uid && u.role !== 'admin');
  const grantedCount = countGranted(selection);

  return (
    <div className="space-y-5">
      {/* Who */}
      <div className="flex items-center gap-3">
        <Avatar user={user} />
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate">{user.name || 'Unnamed'}</p>
          <p className="text-xs text-text-muted truncate">{user.email}</p>
        </div>
        <span className="ml-auto text-xs text-text-secondary whitespace-nowrap">
          {grantedCount} of {PERMISSION_KEYS.length} granted
        </span>
      </div>

      {/* Presets + copy */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-text-muted self-center mr-1">Presets:</span>
          {Object.entries(PERMISSION_PRESETS).map(([name, keys]) => (
            <button key={name} type="button" onClick={() => applyKeys(keys)} className="btn-secondary text-xs px-2.5 py-1">
              {name}
            </button>
          ))}
        </div>
        {otherEmployees.length > 0 && (
          <select
            className="select-field text-xs sm:ml-auto sm:w-56"
            value=""
            onChange={(e) => copyFrom(e.target.value)}
          >
            <option value="">Copy from another employee…</option>
            {otherEmployees.map((u) => <option key={u.uid} value={u.uid}>{u.name || u.email}</option>)}
          </select>
        )}
      </div>

      {/* Checkbox groups */}
      {PERMISSION_GROUPS.map((group) => {
        const items = PERMISSION_CATALOG.filter((p) => p.group === group);
        if (items.length === 0) return null;
        const allOn = items.every((p) => selection[p.key]);
        return (
          <div key={group} className="rounded-xl border border-border">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background rounded-t-xl">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">{group}</p>
              <button type="button" onClick={() => setGroup(group, !allOn)} className="text-xs text-orange hover:underline">
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <ul className="divide-y divide-borderLight">
              {items.map((p) => (
                <li key={p.key}>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-surfaceHover transition-colors">
                    <input
                      type="checkbox"
                      checked={selection[p.key]}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5 w-4 h-4 accent-orange flex-shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary">{p.label}</span>
                      <span className="block text-xs text-text-muted mt-0.5">{p.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {/* Footer */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 pt-1">
        <p className="text-xs text-text-muted sm:mr-auto">
          {updatedByName
            ? `Last changed by ${updatedByName}${user.permissionsUpdatedAt ? ` on ${formatDate(user.permissionsUpdatedAt)}` : ''}`
            : 'Never changed'}
        </p>
        <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
        <button type="button" onClick={handleSave} className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save permissions'}
        </button>
      </div>
    </div>
  );
};

// ─── Tab ──────────────────────────────────────────────────────
export default function PermissionsManager({ users }) {
  const { viewMode } = useViewMode();
  const [search, setSearch] = useState('');
  const [by, setBy] = useState('employee'); // 'employee' | 'permission'
  const [editingUid, setEditingUid] = useState(null);

  // Look the person up by uid on every render, so the modal shows the live
  // snapshot (e.g. "Last changed by") rather than a copy taken at click time.
  const editing = users.find((u) => u.uid === editingUid) || null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, search]);

  const employees = users.filter((u) => u.role !== 'admin');

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm font-semibold text-text-primary">Who can see and do what</p>
        <p className="text-xs text-text-muted mt-0.5">
          Click an employee to choose which pages and actions they get. Admins always have full access.
          Changes apply immediately — the person does not need to sign in again.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 self-start">
          {[['employee', 'By employee'], ['permission', 'By permission']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBy(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${by === value
                ? 'bg-orange text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {by === 'employee' && (
          <input
            className="input-field flex-1"
            placeholder="🔍 Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>

      {/* By employee */}
      {by === 'employee' && viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                {['Member', 'Role', 'Access', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {filtered.map((u) => (
                <tr key={u.uid} className="hover:bg-surfaceHover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar user={u} size="w-8 h-8" />
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">{u.name}</p>
                        <p className="text-xs text-text-muted truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="badge-orange capitalize">{u.role}</span></td>
                  <td className="px-4 py-3"><AccessSummary user={u} /></td>
                  <td className="px-4 py-3 text-right">
                    {u.role !== 'admin' && (
                      <button type="button" onClick={() => setEditingUid(u.uid)} className="text-orange hover:underline text-xs font-semibold">
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {by === 'employee' && viewMode !== 'table' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((u) => {
            const isAdminUser = u.role === 'admin';
            return (
              <button
                key={u.uid}
                type="button"
                disabled={isAdminUser}
                onClick={() => setEditingUid(u.uid)}
                className={`card text-left space-y-3 ${isAdminUser ? 'cursor-default' : 'card-hover'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={u} />
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary text-sm truncate">{u.name}</p>
                    <p className="text-xs text-text-muted truncate">{u.email}</p>
                  </div>
                  {!isAdminUser && (
                    <span className="ml-auto text-xs text-text-secondary whitespace-nowrap">
                      {countGranted(u.permissions)} / {PERMISSION_KEYS.length}
                    </span>
                  )}
                </div>
                <AccessSummary user={u} />
              </button>
            );
          })}
        </div>
      )}

      {by === 'employee' && filtered.length === 0 && (
        <p className="text-center text-sm text-text-muted py-8">No one matches “{search}”.</p>
      )}

      {/* By permission: for each permission, who holds it */}
      {by === 'permission' && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                {['Permission', 'Employees who have it'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {PERMISSION_CATALOG.map((p) => {
                const holders = employees.filter((u) => u.permissions?.[p.key] === true);
                return (
                  <tr key={p.key}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-text-primary">{p.label}</p>
                      <p className="text-xs text-text-muted">{p.group}</p>
                    </td>
                    <td className="px-4 py-3">
                      {holders.length === 0
                        ? <span className="text-xs text-text-muted">Admins only</span>
                        : (
                          <div className="flex flex-wrap gap-1.5">
                            {holders.map((u) => (
                              <button
                                key={u.uid}
                                type="button"
                                onClick={() => setEditingUid(u.uid)}
                                className="text-xs px-2 py-0.5 rounded-full bg-orange/10 text-orange border border-orange/20 hover:bg-orange/20"
                              >
                                {u.name || u.email}
                              </button>
                            ))}
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditingUid(null)}
        title="Edit permissions"
        size="md"
      >
        {editing && (
          <PermissionEditor
            key={editing.uid}
            user={editing}
            users={users}
            onClose={() => setEditingUid(null)}
          />
        )}
      </Modal>
    </div>
  );
}
