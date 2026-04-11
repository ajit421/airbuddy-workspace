/**
 * AttendanceManager.jsx
 * HRMS Module — Attendance Manager view.
 *
 * Features:
 *  - Employee: own last-30-days heatmap + log, with custom date range picker
 *  - Admin: all-employees overview table + drill-down into any employee's log
 *           with custom date range picker
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getAttendanceDateRange,
  getAllEmployeesAttendanceSummary,
  getAllEmployees,
  getMyLeaves,
} from '../../../services/hrmsService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts) {
  if (!ts) return null;
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcHours(punchIn, punchOut) {
  if (!punchIn || !punchOut) return null;
  const inD  = typeof punchIn.toDate  === 'function' ? punchIn.toDate()  : new Date(punchIn);
  const outD = typeof punchOut.toDate === 'function' ? punchOut.toDate() : new Date(punchOut);
  const diffMs = outD - inD;
  if (diffMs <= 0) return null;
  const totalMins = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}h ${m}m`;
}

function calcTotalMinutes(punchIn, punchOut) {
  if (!punchIn || !punchOut) return 0;
  const inD  = typeof punchIn.toDate  === 'function' ? punchIn.toDate()  : new Date(punchIn);
  const outD = typeof punchOut.toDate === 'function' ? punchOut.toDate() : new Date(punchOut);
  const diffMs = outD - inD;
  return diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
}

function isWeekend(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function buildLast30Days() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function enumerateDaysBetween(startDate, endDate) {
  const dates = [];
  const curr = new Date(startDate);
  const last = new Date(endDate);
  while (curr <= last) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/** Today's date as YYYY-MM-DD */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 30 days ago as YYYY-MM-DD */
function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-orange border-t-transparent animate-spin" />
      <p className="text-text-muted text-sm">Loading attendance data…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-text-primary font-semibold">Failed to load attendance</p>
        <p className="text-text-muted text-sm mt-1">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold hover:bg-orange-hover transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

function StatusBadge({ punchIn, punchOut, leave }) {
  if (leave) return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
      On Leave
    </span>
  );
  if (!punchIn) return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface text-text-muted border border-border">
      Absent
    </span>
  );
  if (!punchOut) return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange/10 text-orange border border-orange/30">
      In Progress
    </span>
  );
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30">
      Present
    </span>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────
function DateRangePicker({ startDate, endDate, onStartChange, onEndChange, onApply, loading }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">Start Date</label>
        <input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="input-field py-2 text-sm bg-surface"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted uppercase tracking-wide">End Date</label>
        <input
          type="date"
          value={endDate}
          min={startDate}
          max={today()}
          onChange={(e) => onEndChange(e.target.value)}
          className="input-field py-2 text-sm bg-surface"
        />
      </div>
      <button
        onClick={onApply}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold
                   hover:bg-orange-hover transition-colors disabled:opacity-50"
      >
        <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Loading…' : 'Apply'}
      </button>
    </div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
function AttendanceHeatmap({ days, recordMap, approvedLeavesMap }) {
  const sorted = [...days].reverse();
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">Activity Heatmap</h3>
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((dateStr) => {
          const rec     = recordMap[dateStr];
          const leave   = approvedLeavesMap[dateStr];
          const present = rec && rec.punchIn && rec.punchOut;
          const inProg  = rec && rec.punchIn && !rec.punchOut;
          const hours   = rec ? calcHours(rec.punchIn, rec.punchOut) : null;
          const label   = `${fmtDate(dateStr)}${
            leave ? ` · On Leave (${leave.type})` : present ? ` · ${hours ?? '—'}` : inProg ? ' · In Progress' : ' · Absent'
          }`;
          let squareCls = 'bg-border/50';
          if (leave)        squareCls = 'bg-purple-500';
          else if (inProg)  squareCls = 'bg-orange opacity-80';
          else if (present) squareCls = 'bg-green-500';
          return (
            <div
              key={dateStr}
              title={label}
              className={`w-4 h-4 rounded-sm transition-transform hover:scale-125 cursor-default ${squareCls}`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          { cls: 'bg-green-500',  label: 'Present'     },
          { cls: 'bg-orange',     label: 'In Progress' },
          { cls: 'bg-purple-500', label: 'On Leave'    },
          { cls: 'bg-border/50',  label: 'Absent'      },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${cls}`} />
            <span className="text-xs text-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Employee Attendance Log Table ────────────────────────────────────────────
function AttendanceTable({ days, recordMap, approvedLeavesMap }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">Detailed Log</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              {['Date', 'Check In', 'Check Out', 'Total Hours', 'Status'].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {days.map((dateStr) => {
              const rec     = recordMap[dateStr];
              const leave   = approvedLeavesMap[dateStr];
              const inTime  = rec ? fmtTime(rec.punchIn)  : null;
              const outTime = rec ? fmtTime(rec.punchOut) : null;
              const hours   = rec ? calcHours(rec.punchIn, rec.punchOut) : null;
              return (
                <tr key={dateStr} className="hover:bg-background/60 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <p className="font-medium text-text-primary">{fmtDate(dateStr)}</p>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">
                    {inTime ?? <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">
                    {outTime ?? <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-text-primary">
                    {hours ?? <span className="text-text-muted font-normal">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <StatusBadge punchIn={rec?.punchIn ?? null} punchOut={rec?.punchOut ?? null} leave={leave} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Stats Row ────────────────────────────────────────────────────────
function SummaryStats({ displayDays, recordMap, approvedLeavesMap }) {
  const presentCount = displayDays.filter((d) => recordMap[d]?.punchIn && recordMap[d]?.punchOut).length;
  const inProgCount  = displayDays.filter((d) => recordMap[d]?.punchIn && !recordMap[d]?.punchOut).length;
  const onLeaveCount = displayDays.filter((d) => approvedLeavesMap[d] && !recordMap[d]).length;
  const absentCount  = displayDays.filter((d) => !recordMap[d] && !approvedLeavesMap[d] && !isWeekend(d)).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: 'Present',     value: presentCount,  color: 'text-green-400',  bg: 'bg-green-500/10'  },
        { label: 'In Progress', value: inProgCount,   color: 'text-orange',     bg: 'bg-orange/10'     },
        { label: 'On Leave',    value: onLeaveCount,  color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Absent',      value: absentCount,   color: 'text-red-400',    bg: 'bg-red-500/10'    },
      ].map(({ label, value, color, bg }) => (
        <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3`}>
          <p className={`text-2xl font-black ${color}`}>{value}</p>
          <p className="text-xs font-semibold text-text-muted mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Admin: All-Employees Table ───────────────────────────────────────────────
function AdminAttendanceTable({ summaries, dateRange, onDrillDown }) {
  const rangeDays = enumerateDaysBetween(dateRange.start, dateRange.end)
    .filter(d => !isWeekend(d));
  const totalWorkdays = rangeDays.length;

  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-1">All Employees Overview</h3>
      <p className="text-xs text-text-muted mb-4">
        Working days in range: <span className="font-semibold text-text-secondary">{totalWorkdays}</span>
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              {['Employee', 'Present', 'Absent', 'Avg Hours/Day', 'Attendance %', ''].map((h) => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summaries.map(({ employee, records }) => {
              const recordMap = {};
              records.forEach(r => { if (r.date) recordMap[r.date] = r; });

              const presentDays = rangeDays.filter(d => recordMap[d]?.punchIn && recordMap[d]?.punchOut).length;
              const absentDays  = rangeDays.filter(d => !recordMap[d]).length;
              const totalMins   = records.reduce((sum, r) => sum + calcTotalMinutes(r.punchIn, r.punchOut), 0);
              const avgMins     = presentDays > 0 ? Math.round(totalMins / presentDays) : 0;
              const avgH        = Math.floor(avgMins / 60);
              const avgM        = avgMins % 60;
              const pct         = totalWorkdays > 0 ? Math.round((presentDays / totalWorkdays) * 100) : 0;
              const pctColor    = pct >= 85 ? 'text-green-400' : pct >= 60 ? 'text-orange' : 'text-red-400';

              return (
                <tr key={employee.uid || employee.id} className="hover:bg-background/60 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {employee.avatar ? (
                        <img src={employee.avatar} alt={employee.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-orange/20 flex items-center justify-center shrink-0">
                          <span className="text-orange text-xs font-bold">
                            {(employee.name || employee.email || '?')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-text-primary">{employee.name || '—'}</p>
                        <p className="text-xs text-text-muted">{employee.email || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-green-400">{presentDays}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-red-400">{absentDays}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-text-secondary">
                    {presentDays > 0 ? `${avgH}h ${avgM}m` : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 85 ? 'bg-green-500' : pct >= 60 ? 'bg-orange' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${pctColor}`}>{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <button
                      onClick={() => onDrillDown(employee, records)}
                      className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View Log
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {summaries.length === 0 && (
          <p className="text-center py-10 text-text-muted text-sm">No employee data found.</p>
        )}
      </div>
    </div>
  );
}

// ─── Admin Drill-Down Modal ────────────────────────────────────────────────────
function EmployeeDrillDown({ employee, records, dateRange, onClose }) {
  const rangeDays = enumerateDaysBetween(dateRange.start, dateRange.end);
  const displayDays = rangeDays.filter(d => !isWeekend(d) || records.find(r => r.date === d));

  const recordMap = {};
  records.forEach(r => { if (r.date) recordMap[r.date] = r; });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            {employee.avatar ? (
              <img src={employee.avatar} alt={employee.name} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-orange/20 flex items-center justify-center">
                <span className="text-orange font-bold">{(employee.name || '?')[0].toUpperCase()}</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-text-primary">{employee.name || employee.email}</h2>
              <p className="text-xs text-text-muted">{fmtDate(dateRange.start)} – {fmtDate(dateRange.end)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-background transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          <AttendanceHeatmap days={displayDays} recordMap={recordMap} approvedLeavesMap={{}} />
          <div className="border-t border-border" />
          <AttendanceTable days={displayDays} recordMap={recordMap} approvedLeavesMap={{}} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AttendanceManager() {
  const { userProfile, isAdmin } = useAuth();
  const uid = userProfile?.uid;

  // ── Employee view state ──
  const [records, setRecords]   = useState([]);
  const [leaves, setLeaves]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // ── Admin view state ──
  const [adminSummaries, setAdminSummaries] = useState([]);
  const [adminLoading, setAdminLoading]     = useState(false);
  const [adminError, setAdminError]         = useState(null);
  const [drillDownTarget, setDrillDownTarget] = useState(null); // { employee, records }

  // ── Date range (shared for both views) ──
  const [startDate, setStartDate] = useState(thirtyDaysAgo());
  const [endDate, setEndDate]     = useState(today());
  // Applied range (only changes when user clicks Apply)
  const [appliedStart, setAppliedStart] = useState(thirtyDaysAgo());
  const [appliedEnd, setAppliedEnd]     = useState(today());

  // ── Employee fetch ──
  const fetchMyAttendance = useCallback(async (start, end) => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const [attData, leavesData] = await Promise.all([
        getAttendanceDateRange(uid, start, end),
        getMyLeaves(uid),
      ]);
      setRecords(attData);
      setLeaves(leavesData);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  // ── Admin fetch ──
  const fetchAdminData = useCallback(async (start, end) => {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const employees = await getAllEmployees();
      const summaries = await getAllEmployeesAttendanceSummary(employees, start, end);
      // Sort by name
      summaries.sort((a, b) => (a.employee.name || '').localeCompare(b.employee.name || ''));
      setAdminSummaries(summaries);
    } catch (err) {
      setAdminError(err.message || 'An unexpected error occurred.');
    } finally {
      setAdminLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchAdminData(appliedStart, appliedEnd);
    } else {
      fetchMyAttendance(appliedStart, appliedEnd);
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    if (isAdmin) {
      fetchAdminData(startDate, endDate);
    } else {
      fetchMyAttendance(startDate, endDate);
    }
  };

  // Employee-view computed data
  const allDays = enumerateDaysBetween(appliedStart, appliedEnd).reverse(); // newest first

  const recordMap = {};
  records.forEach((r) => { if (r.date) recordMap[r.date] = r; });

  const approvedLeavesMap = {};
  leaves.forEach((l) => {
    if (l.status === 'approved') {
      enumerateDaysBetween(l.startDate, l.endDate).forEach(d => { approvedLeavesMap[d] = l; });
    }
  });

  const displayDays = allDays.filter(d => !isWeekend(d) || recordMap[d] || approvedLeavesMap[d]);

  const isLoading = isAdmin ? adminLoading : loading;
  const hasError  = isAdmin ? adminError   : error;
  const onRetry   = isAdmin
    ? () => fetchAdminData(appliedStart, appliedEnd)
    : () => fetchMyAttendance(appliedStart, appliedEnd);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-background min-h-screen text-text-primary">

      {/* ── Drill-Down Modal (admin only) ─────────────────────────────────── */}
      {drillDownTarget && (
        <EmployeeDrillDown
          employee={drillDownTarget.employee}
          records={drillDownTarget.records}
          dateRange={{ start: appliedStart, end: appliedEnd }}
          onClose={() => setDrillDownTarget(null)}
        />
      )}

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gradient">Attendance Manager</h1>
          <p className="text-text-muted text-sm mt-1">
            {isAdmin
              ? 'Admin view — all employees attendance overview'
              : 'Your attendance log for the selected date range'}
          </p>
        </div>

        {/* Date Range Picker */}
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          onApply={handleApply}
          loading={isLoading}
        />
      </div>

      {/* ── Applied Range Label ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-sm text-text-muted">
          Showing: <span className="font-semibold text-text-secondary">{fmtDate(appliedStart)}</span>
          {' '}→{' '}
          <span className="font-semibold text-text-secondary">{fmtDate(appliedEnd)}</span>
        </span>
      </div>

      {/* ── Employee View: Summary Stats ──────────────────────────────────── */}
      {!isAdmin && !loading && !error && (
        <div className="mb-6">
          <SummaryStats
            displayDays={displayDays}
            recordMap={recordMap}
            approvedLeavesMap={approvedLeavesMap}
          />
        </div>
      )}

      {/* ── Admin View: Summary Stats (overall) ──────────────────────────── */}
      {isAdmin && !adminLoading && !adminError && adminSummaries.length > 0 && (() => {
        const rangeDays = enumerateDaysBetween(appliedStart, appliedEnd).filter(d => !isWeekend(d));
        const totalWorkdays = rangeDays.length;
        const totalEmployees = adminSummaries.length;
        const totalPresent = adminSummaries.reduce((sum, { records: recs }) => {
          const rm = {};
          recs.forEach(r => { if (r.date) rm[r.date] = r; });
          return sum + rangeDays.filter(d => rm[d]?.punchIn && rm[d]?.punchOut).length;
        }, 0);
        const avgAttPct = totalEmployees > 0 && totalWorkdays > 0
          ? Math.round((totalPresent / (totalEmployees * totalWorkdays)) * 100)
          : 0;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Employees', value: totalEmployees,  color: 'text-blue-400',  bg: 'bg-blue-500/10'  },
              { label: 'Working Days',    value: totalWorkdays,   color: 'text-text-primary', bg: 'bg-surface'   },
              { label: 'Total Present',   value: totalPresent,    color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: 'Avg Attendance',  value: `${avgAttPct}%`, color: avgAttPct >= 80 ? 'text-green-400' : avgAttPct >= 60 ? 'text-orange' : 'text-red-400', bg: 'bg-surface' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3`}>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-xs font-semibold text-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Main Card ─────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">

        {isLoading && <Spinner />}
        {!isLoading && hasError && <ErrorState message={hasError} onRetry={onRetry} />}

        {!isLoading && !hasError && (
          <div className="p-6 flex flex-col gap-8">

            {/* ── Admin: All-Employees Table ── */}
            {isAdmin && (
              <AdminAttendanceTable
                summaries={adminSummaries}
                dateRange={{ start: appliedStart, end: appliedEnd }}
                onDrillDown={(employee, records) => setDrillDownTarget({ employee, records })}
              />
            )}

            {/* ── Employee: Heatmap + Table ── */}
            {!isAdmin && (
              <>
                <AttendanceHeatmap days={displayDays} recordMap={recordMap} approvedLeavesMap={approvedLeavesMap} />
                <div className="border-t border-border" />
                <AttendanceTable days={displayDays} recordMap={recordMap} approvedLeavesMap={approvedLeavesMap} />
              </>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
