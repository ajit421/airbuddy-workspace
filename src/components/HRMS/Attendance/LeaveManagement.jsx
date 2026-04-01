/**
 * LeaveManagement.jsx
 * HRMS — Leave Management (role-based view)
 *
 * Employee view:
 *  - Apply for leave form (Sick / Casual / Unpaid) with validation
 *  - My Leave History table with status badges
 *
 * Admin view (in addition to employee view):
 *  - Pending Approvals table with Approve / Reject buttons
 *  - Optimistic UI: approved/rejected rows vanish instantly before Firestore confirms
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  applyForLeave,
  getMyLeaves,
  getAllPendingLeaves,
  updateLeaveStatus,
} from '../../../services/hrmsService';

// ─── Constants ────────────────────────────────────────────────────────────────
const LEAVE_TYPES = [
  { value: 'sick',    label: 'Sick Leave'   },
  { value: 'casual',  label: 'Casual Leave' },
  { value: 'unpaid',  label: 'Unpaid Leave' },
];

const TODAY = new Date().toISOString().slice(0, 10);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Count calendar days (inclusive) between two YYYY-MM-DD strings. */
function dayCount(start, end) {
  if (!start || !end) return 0;
  const diff = new Date(end) - new Date(start);
  return Math.max(0, Math.floor(diff / 86400000) + 1);
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    pending:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    approved: 'bg-green-500/10  text-green-400  border-green-500/30',
    rejected: 'bg-red-500/10   text-red-400    border-red-500/30',
  };
  const cls = map[status] ?? map.pending;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs
                      font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Leave Type Chip ──────────────────────────────────────────────────────────
function TypeChip({ type }) {
  const map = {
    sick:   'bg-blue-500/10 text-blue-400',
    casual: 'bg-purple-500/10 text-purple-400',
    unpaid: 'bg-orange/10 text-orange',
  };
  const label = LEAVE_TYPES.find((t) => t.value === type)?.label ?? type;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs
                      font-semibold ${map[type] ?? ''}`}>
      {label}
    </span>
  );
}

// ─── Section Card wrapper ─────────────────────────────────────────────────────
function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
        <div>
          <h2 className="font-bold text-text-primary">{title}</h2>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyRow({ cols, message }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10 text-center text-text-muted text-sm">
        {message}
      </td>
    </tr>
  );
}

// ─── Apply-for-leave form ─────────────────────────────────────────────────────
function ApplyLeaveForm({ onSubmitted }) {
  const { userProfile } = useAuth();
  const [form, setForm] = useState({
    type: 'sick', startDate: '', endDate: '', reason: '',
  });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!form.startDate || !form.endDate) {
      return setError('Start and end dates are required.');
    }
    if (form.endDate < form.startDate) {
      return setError('End date cannot be before start date.');
    }
    if (!form.reason.trim()) {
      return setError('Please provide a reason for your leave.');
    }

    setLoading(true);
    try {
      await applyForLeave({
        uid:           userProfile.uid,
        applicantName: userProfile.name || userProfile.email,
        type:          form.type,
        startDate:     form.startDate,
        endDate:       form.endDate,
        reason:        form.reason.trim(),
      });
      setSuccess('Leave application submitted successfully!');
      setForm({ type: 'sick', startDate: '', endDate: '', reason: '' });
      onSubmitted(); // refresh history
    } catch (err) {
      setError(err.message || 'Failed to submit leave request.');
    } finally {
      setLoading(false);
    }
  };

  const days = dayCount(form.startDate, form.endDate);

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {/* Row 1: type + date range */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Leave Type */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1.5">
            Leave Type
          </label>
          <select
            value={form.type}
            onChange={(e) => set('type', e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2
                       text-sm text-text-primary focus:outline-none focus:border-orange
                       transition-colors"
          >
            {LEAVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1.5">
            Start Date
          </label>
          <input
            type="date"
            min={TODAY}
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2
                       text-sm text-text-primary focus:outline-none focus:border-orange
                       transition-colors"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-2">
            End Date
            {days > 0 && (
              <span className="text-orange font-bold">{days} day{days !== 1 ? 's' : ''}</span>
            )}
          </label>
          <input
            type="date"
            min={form.startDate || TODAY}
            value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2
                       text-sm text-text-primary focus:outline-none focus:border-orange
                       transition-colors"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-xs font-semibold text-text-muted mb-1.5">
          Reason
        </label>
        <textarea
          rows={3}
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
          placeholder="Briefly describe the reason for your leave…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2
                     text-sm text-text-primary focus:outline-none focus:border-orange
                     transition-colors resize-none"
        />
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10
                        border border-red-500/20 rounded-lg px-4 py-2.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0
              1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10
                        border border-green-500/20 rounded-lg px-4 py-2.5">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1
              0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0
              001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange text-white
                     text-sm font-bold hover:bg-orange-hover transition-colors
                     disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white
                             rounded-full animate-spin" />
          )}
          {loading ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    </form>
  );
}

// ─── My Leave History table ───────────────────────────────────────────────────
function MyLeaveHistory({ leaves, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-orange border-t-transparent
                        rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-background">
            {['Type', 'Start', 'End', 'Days', 'Reason', 'Status'].map((h) => (
              <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold
                                     text-text-muted uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leaves.length === 0
            ? <EmptyRow cols={6} message="You haven't applied for any leave yet." />
            : leaves.map((l) => (
              <tr key={l.id} className="hover:bg-background/60 transition-colors">
                <td className="px-5 py-3.5 whitespace-nowrap"><TypeChip type={l.type} /></td>
                <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">{fmtDate(l.startDate)}</td>
                <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">{fmtDate(l.endDate)}</td>
                <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-text-primary">
                  {dayCount(l.startDate, l.endDate)}
                </td>
                <td className="px-5 py-3.5 text-text-secondary max-w-xs">
                  <p className="truncate" title={l.reason}>{l.reason || '—'}</p>
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <StatusBadge status={l.status} />
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

// ─── Admin Pending Approvals ──────────────────────────────────────────────────
function PendingApprovals({ adminUid }) {
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [actioning, setActioning] = useState(null); // leaveId being actioned

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllPendingLeaves();
      setPending(data);
    } catch (err) {
      console.error('[LeaveManagement] fetchPending:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleAction = async (leaveId, status) => {
    setActioning(leaveId);
    // Optimistic update — remove the row immediately
    setPending((prev) => prev.filter((l) => l.id !== leaveId));
    try {
      await updateLeaveStatus(leaveId, status, adminUid);
    } catch (err) {
      // Roll back on failure: re-fetch
      console.error('[LeaveManagement] handleAction failed:', err);
      fetchPending();
    } finally {
      setActioning(null);
    }
  };

  return (
    <SectionCard
      title="⏳ Pending Approvals"
      subtitle="Review and action employee leave requests"
      action={
        <button
          onClick={fetchPending}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                     text-text-secondary text-xs hover:bg-background transition-colors
                     disabled:opacity-50"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-orange border-t-transparent
                          rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                {['Employee', 'Type', 'Start', 'End', 'Days', 'Reason', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold
                                         text-text-muted uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.length === 0
                ? <EmptyRow cols={7} message="🎉 No pending leave requests — all caught up!" />
                : pending.map((l) => (
                  <tr key={l.id}
                      className={`hover:bg-background/60 transition-all
                        ${actioning === l.id ? 'opacity-40' : ''}`}>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <p className="font-semibold text-text-primary">{l.applicantName || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <TypeChip type={l.type} />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">
                      {fmtDate(l.startDate)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">
                      {fmtDate(l.endDate)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-text-primary">
                      {dayCount(l.startDate, l.endDate)}
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary max-w-xs">
                      <p className="truncate" title={l.reason}>{l.reason || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {/* Approve */}
                        <button
                          disabled={actioning === l.id}
                          onClick={() => handleAction(l.id, 'approved')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg
                                     bg-green-500/10 text-green-400 border border-green-500/30
                                     text-xs font-semibold hover:bg-green-500/20
                                     transition-colors disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                              d="M5 13l4 4L19 7" />
                          </svg>
                          Approve
                        </button>
                        {/* Reject */}
                        <button
                          disabled={actioning === l.id}
                          onClick={() => handleAction(l.id, 'rejected')}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg
                                     bg-red-500/10 text-red-400 border border-red-500/30
                                     text-xs font-semibold hover:bg-red-500/20
                                     transition-colors disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                              d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LeaveManagement() {
  const { userProfile, isAdmin } = useAuth();
  const uid = userProfile?.uid;

  const [myLeaves, setMyLeaves]       = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError]     = useState('');

  // Stat counts derived from my leaves
  const totalLeaves    = myLeaves.length;
  const approvedLeaves = myLeaves.filter((l) => l.status === 'approved').length;
  const pendingLeaves  = myLeaves.filter((l) => l.status === 'pending').length;
  const totalDays      = myLeaves
    .filter((l) => l.status === 'approved')
    .reduce((acc, l) => acc + dayCount(l.startDate, l.endDate), 0);

  const fetchMyLeaves = useCallback(async () => {
    if (!uid) return;
    setHistLoading(true);
    setHistError('');
    try {
      const data = await getMyLeaves(uid);
      setMyLeaves(data);
    } catch (err) {
      console.error('[LeaveManagement] fetchMyLeaves:', err);
      setHistError(err.message || 'Failed to load leave history.');
    } finally {
      setHistLoading(false);
    }
  }, [uid]);

  useEffect(() => { fetchMyLeaves(); }, [fetchMyLeaves]);

  return (
    <div className="p-6 bg-background min-h-screen text-text-primary space-y-6 animate-fade-in">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-black text-gradient">Leave Management</h1>
        <p className="text-text-muted text-sm mt-1">Apply for leave and track your requests</p>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Applied',    value: totalLeaves,    color: 'text-text-primary',  bg: 'bg-border/20'       },
          { label: 'Approved',         value: approvedLeaves, color: 'text-green-400',     bg: 'bg-green-500/10'   },
          { label: 'Pending',          value: pendingLeaves,  color: 'text-yellow-400',    bg: 'bg-yellow-500/10'  },
          { label: 'Days Approved',    value: totalDays,      color: 'text-orange',        bg: 'bg-orange/10'      },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Apply for Leave ─────────────────────────────────────────────────── */}
      <SectionCard
        title="📝 Apply for Leave"
        subtitle="Fill in the form below — your manager will be notified"
      >
        <ApplyLeaveForm onSubmitted={fetchMyLeaves} />
      </SectionCard>

      {/* ── My Leave History ────────────────────────────────────────────────── */}
      <SectionCard
        title="🗂 My Leave History"
        subtitle={`${totalLeaves} application${totalLeaves !== 1 ? 's' : ''} submitted`}
        action={
          <button
            onClick={fetchMyLeaves}
            disabled={histLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border
                       text-text-secondary text-xs hover:bg-background transition-colors
                       disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${histLoading ? 'animate-spin' : ''}`}
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                   0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        }
      >
        {histError && (
          <div className="mx-6 mt-4 flex items-center gap-2 text-red-400 text-sm
                          bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0
                11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd" />
            </svg>
            {histError}
          </div>
        )}
        <MyLeaveHistory leaves={myLeaves} loading={histLoading} />
      </SectionCard>

      {/* ── Admin: Pending Approvals ─────────────────────────────────────────── */}
      {isAdmin && <PendingApprovals adminUid={uid} />}
    </div>
  );
}
