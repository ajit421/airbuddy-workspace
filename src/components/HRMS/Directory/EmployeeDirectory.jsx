/**
 * EmployeeDirectory.jsx
 * HRMS Module — Employee Directory view.
 *
 * Features:
 *  - Fetches all users from Firestore via hrmsService.getAllEmployees()
 *  - Client-side search (name / email) + department filter
 *  - Admin-only: "Add Employee" button, per-row "Edit" + "Delete" actions
 *  - Opens EmployeeModal for create / edit
 *  - Delete Employee with inline confirmation
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getAllEmployees, deleteEmployee } from '../../../services/hrmsService';
import EmployeeModal from './EmployeeModal';

// ─── Constants ───────────────────────────────────────────────────────────────
const DEPARTMENTS = ['All', 'Engineering', 'HR', 'Design', 'Sales', 'Finance', 'Operations', 'Marketing'];

// ─── Small helper components ──────────────────────────────────────────────────

/** Subtle badge used when an HRMS field has not been set yet. */
function UnassignedBadge() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium
                     bg-surface text-text-muted border border-border">
      Not Assigned
    </span>
  );
}

/** Role pill — colour-coded to match the existing app palette. */
function RoleBadge({ role }) {
  const isAdmin = role === 'admin';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize
        ${isAdmin
          ? 'bg-orange/10 text-orange border border-orange/30'
          : 'bg-surface text-text-secondary border border-border'
        }`}
    >
      {role || 'employee'}
    </span>
  );
}

/** Avatar — Google photo when available, coloured initial fallback. */
function Avatar({ name, avatar }) {
  const initial = name?.[0]?.toUpperCase() || '?';
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-orange/10 border border-orange/30
                    flex items-center justify-center flex-shrink-0">
      <span className="text-orange font-bold text-sm">{initial}</span>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-orange border-t-transparent animate-spin" />
      <p className="text-text-muted text-sm">Loading employees…</p>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-text-primary font-semibold">Failed to load employees</p>
        <p className="text-text-muted text-sm mt-1">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold
                   hover:bg-orange-hover transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
      <svg className="w-12 h-12 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857
             M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857
             m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <p className="text-text-muted text-sm">No employees match your filters.</p>
    </div>
  );
}

// ─── Format Firestore Timestamp ───────────────────────────────────────────────
function formatJoinDate(joinDate) {
  if (!joinDate) return null;
  const date = typeof joinDate.toDate === 'function' ? joinDate.toDate() : new Date(joinDate);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EmployeeDirectory() {
  // Auth context — used to conditionally show admin actions
  const { isAdmin } = useAuth();

  // ── Data state ───────────────────────────────────────────────────────────────
  const [employees, setEmployees]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]           = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]       = useState(false);
  const [selectedEmployee, setSelected] = useState(null); // null = create mode

  // ── Delete state ─────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId]     = useState(null); // uid being deleted
  const [confirmId, setConfirmId]       = useState(null); // uid awaiting confirm

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllEmployees();
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setEmployees(data);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = employees.filter((emp) => {
    // Text search — name or email
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q
      || emp.name?.toLowerCase().includes(q)
      || emp.email?.toLowerCase().includes(q);

    // Department filter
    const matchesDept = departmentFilter === 'All'
      || (emp.department || '') === departmentFilter;

    return matchesSearch && matchesDept;
  });

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    setSelected(null);
    setModalOpen(true);
  };
  const openEdit = (emp) => {
    setSelected(emp);
    setModalOpen(true);
  };
  const handleModalClose = () => {
    setModalOpen(false);
    setSelected(null);
  };

  // ── Delete handler ────────────────────────────────────────────────────────────
  const handleDelete = async (uid) => {
    setDeletingId(uid);
    try {
      await deleteEmployee(uid);
      // Remove from local state immediately (optimistic update)
      setEmployees((prev) => prev.filter((e) => e.id !== uid));
    } catch (err) {
      console.error('[EmployeeDirectory] Delete failed:', err);
      // Could surface a toast here; for now just log
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  // ── Table header columns ──────────────────────────────────────────────────────
  const headers = isAdmin
    ? ['Employee', 'Role', 'Department', 'Designation', 'Joined', 'Actions']
    : ['Employee', 'Role', 'Department', 'Designation', 'Joined'];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-background min-h-screen text-text-primary">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gradient">Employee Directory</h1>
          <p className="text-text-muted text-sm mt-1">
            {loading
              ? 'Fetching team members…'
              : `${employees.length} team member${employees.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Add Employee — admin only */}
        {isAdmin && !loading && !error && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange text-white
                       text-sm font-semibold hover:bg-orange-hover transition-colors
                       shadow-sm flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Employee
          </button>
        )}
      </div>

      {/* ── Control Bar (Search + Department Filter) ─────────────────────────── */}
      {!loading && !error && (
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface border border-border
                         text-text-primary text-sm placeholder:text-text-muted
                         focus:outline-none focus:ring-2 focus:ring-orange/50 focus:border-orange
                         transition-colors"
            />
          </div>

          {/* Department filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-border
                       text-text-primary text-sm
                       focus:outline-none focus:ring-2 focus:ring-orange/50 focus:border-orange
                       transition-colors sm:w-52"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Card Container ───────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">

        {/* Loading */}
        {loading && <TableSkeleton />}

        {/* Error */}
        {!loading && error && <ErrorState message={error} onRetry={fetchEmployees} />}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && <EmptyState />}

        {/* Table */}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background">
                  {headers.map((header) => (
                    <th
                      key={header}
                      className="px-5 py-3.5 text-left text-xs font-semibold text-text-muted
                                 uppercase tracking-wider whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {filtered.map((emp) => {
                  const joinDateStr = formatJoinDate(emp.joinDate);
                  const isDeleting  = deletingId === emp.id;
                  const isConfirming = confirmId === emp.id;

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-background/60 transition-colors group
                        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {/* Employee (avatar + name + email) */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar name={emp.name} avatar={emp.avatar} />
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate">
                              {emp.name || 'Unknown'}
                            </p>
                            <p className="text-xs text-text-muted truncate">{emp.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <RoleBadge role={emp.role} />
                      </td>

                      {/* Department */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {emp.department
                          ? <span className="text-text-primary">{emp.department}</span>
                          : <UnassignedBadge />
                        }
                      </td>

                      {/* Designation */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {emp.designation
                          ? <span className="text-text-primary">{emp.designation}</span>
                          : <UnassignedBadge />
                        }
                      </td>

                      {/* Join Date */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {joinDateStr
                          ? <span className="text-text-secondary">{joinDateStr}</span>
                          : <UnassignedBadge />
                        }
                      </td>

                      {/* Actions — admin only */}
                      {isAdmin && (
                        <td className="px-5 py-4 whitespace-nowrap">
                          {isConfirming ? (
                            /* Inline delete confirmation */
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-text-muted">Delete?</span>
                              <button
                                onClick={() => handleDelete(emp.id)}
                                disabled={isDeleting}
                                className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs
                                           font-semibold hover:bg-red-500/20 transition-colors"
                              >
                                {isDeleting ? '…' : 'Yes'}
                              </button>
                              <button
                                onClick={() => setConfirmId(null)}
                                className="px-2.5 py-1 rounded-lg bg-surface text-text-muted text-xs
                                           font-semibold hover:bg-background transition-colors border border-border"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* Edit button */}
                              <button
                                onClick={() => openEdit(emp)}
                                title="Edit employee"
                                className="p-1.5 rounded-lg text-text-muted hover:text-orange
                                           hover:bg-orange/10 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
                                       m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              {/* Delete button */}
                              <button
                                onClick={() => setConfirmId(emp.id)}
                                title="Delete employee"
                                className="p-1.5 rounded-lg text-text-muted hover:text-red-400
                                           hover:bg-red-500/10 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6
                                       m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Results count footer when filters are active */}
            {(searchQuery.trim() || departmentFilter !== 'All') && (
              <div className="px-5 py-3 border-t border-border text-xs text-text-muted">
                Showing {filtered.length} of {employees.length} employees
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Employee Modal (Add / Edit) ─────────────────────────────────────── */}
      <EmployeeModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        onSaved={fetchEmployees}   // refresh the list after any save
        employee={selectedEmployee}
        isAdmin={isAdmin}
      />
    </div>
  );
}
