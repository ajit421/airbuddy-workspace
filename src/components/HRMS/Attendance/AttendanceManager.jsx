/**
 * AttendanceManager.jsx
 * HRMS Module — Attendance Manager view.
 *
 * Features:
 *  - Monthly Activity Heatmap (pure Tailwind CSS grid, no external libs)
 *  - Detailed attendance log table for the last 30 days
 *  - Fetches data from Firestore via hrmsService.getAttendanceLast30Days()
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getAttendanceLast30Days, getMyLeaves } from '../../../services/hrmsService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Firestore Timestamp (or null) to a readable time string. */
function fmtTime(ts) {
  if (!ts) return null;
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Format a Firestore Timestamp (or null) to a readable date string. */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Calculate total hours between two Firestore Timestamps. Returns "Xh Ym" or null. */
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

/** Determine if a YYYY-MM-DD string is a weekend (Sat/Sun). */
function isWeekend(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  return day === 0 || day === 6;
}

/** Build the last 30 calendar day strings (today first). */
function buildLast30Days() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days; // index 0 = today
}

/** Expand startDate to endDate into an array of YYYY-MM-DD strings */
function enumerateDaysBetweenDates(startDate, endDate) {
  let dates = [];
  const currDate = new Date(startDate);
  const lastDate = new Date(endDate);
  while(currDate <= lastDate) {
    dates.push(currDate.toISOString().slice(0,10));
    currDate.setDate(currDate.getDate() + 1);
  }
  return dates;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Loading spinner */
function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-orange border-t-transparent animate-spin" />
      <p className="text-text-muted text-sm">Loading attendance data…</p>
    </div>
  );
}

/** Error state with retry */
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
        className="px-4 py-2 rounded-lg bg-orange text-white text-sm font-semibold
                   hover:bg-orange-hover transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

/** Status badge for the log table */
function StatusBadge({ punchIn, punchOut, leave }) {
  if (leave) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                       bg-purple-500/10 text-purple-400 border border-purple-500/30">
        On Leave
      </span>
    );
  }
  if (!punchIn) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                       bg-surface text-text-muted border border-border">
        Absent
      </span>
    );
  }
  if (!punchOut) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                       bg-orange/10 text-orange border border-orange/30">
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                     bg-green-500/10 text-green-400 border border-green-500/30">
      Present
    </span>
  );
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────
/**
 * Pure CSS-grid / Tailwind heatmap.
 * Maps the 30 day window into small squares:
 *   - Present (punchIn + punchOut): bg-green-500
 *   - In progress (punchIn only):   bg-orange
 *   - On Leave:                     bg-purple-500
 *   - Absent:                       bg-surface-hover (via bg-border)
 * Each square has a `title` tooltip showing date + hours.
 */
function AttendanceHeatmap({ days, recordMap, approvedLeavesMap }) {
  // days: ['YYYY-MM-DD', ...] — index 0 = today
  // Display oldest → newest (reverse)
  const sorted = [...days].reverse();

  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">Monthly Activity Heatmap</h3>

      {/* Grid of day squares — wrap at 10 per row for a compact calendar feel */}
      <div className="flex flex-wrap gap-1.5">
        {sorted.map((dateStr) => {
          const rec     = recordMap[dateStr];
          const leave   = approvedLeavesMap[dateStr];
          const present = rec && rec.punchIn && rec.punchOut;
          const inProg  = rec && rec.punchIn && !rec.punchOut;
          const hours   = rec ? calcHours(rec.punchIn, rec.punchOut) : null;

          // Tooltip title
          const label = `${fmtDate(dateStr)}${
            leave ? ` · On Leave (${leave.type})` : present ? ` · ${hours ?? '—'}` : inProg ? ' · In Progress' : ' · Absent'
          }`;

          // Square colour
          let squareCls = 'bg-border/50'; // default: absent
          if (leave)            squareCls = 'bg-purple-500';
          else if (inProg)      squareCls = 'bg-orange opacity-80';
          else if (present)     squareCls = 'bg-green-500';

          return (
            <div
              key={dateStr}
              title={label}
              className={`w-4 h-4 rounded-sm transition-transform hover:scale-125 cursor-default ${squareCls}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          { cls: 'bg-green-500',   label: 'Present'     },
          { cls: 'bg-orange',      label: 'In Progress' },
          { cls: 'bg-purple-500',  label: 'On Leave'    },
          { cls: 'bg-border/50',   label: 'Absent'      },
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

// ─── Attendance Log Table ─────────────────────────────────────────────────────
function AttendanceTable({ days, recordMap, approvedLeavesMap }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-text-primary mb-3">Detailed Log</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              {['Date', 'Check In', 'Check Out', 'Total Hours', 'Status'].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3.5 text-left text-xs font-semibold text-text-muted
                             uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {days.map((dateStr) => {
              const rec    = recordMap[dateStr];
              const leave  = approvedLeavesMap[dateStr];
              const inTime = rec ? fmtTime(rec.punchIn)  : null;
              const outTime= rec ? fmtTime(rec.punchOut) : null;
              const hours  = rec ? calcHours(rec.punchIn, rec.punchOut) : null;

              return (
                <tr
                  key={dateStr}
                  className="hover:bg-background/60 transition-colors"
                >
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-text-primary">{fmtDate(dateStr)}</p>
                    </div>
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AttendanceManager() {
  const { userProfile } = useAuth();
  const uid = userProfile?.uid;

  const [records, setRecords]   = useState([]);
  const [leaves, setLeaves]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Build the 30-day window once (stable reference)
  const days = buildLast30Days(); // index 0 = today

  const fetchRecords = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError(null);
    try {
      const [attData, leavesData] = await Promise.all([
        getAttendanceLast30Days(uid),
        getMyLeaves(uid)
      ]);
      setRecords(attData);
      setLeaves(leavesData);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Build a lookup map: { 'YYYY-MM-DD': recordObject }
  const recordMap = {};
  records.forEach((r) => {
    if (r.date) recordMap[r.date] = r;
  });

  // Build a lookup map for approved leaves
  const approvedLeavesMap = {};
  leaves.forEach((l) => {
    if (l.status === 'approved') {
      const dts = enumerateDaysBetweenDates(l.startDate, l.endDate);
      dts.forEach(d => approvedLeavesMap[d] = l);
    }
  });

  // Filter 30 days window: Keep weekdays, OR days with punch-in, OR days with approved leave
  const displayDays = days.filter(d => !isWeekend(d) || recordMap[d] || approvedLeavesMap[d]);

  // Compute summary stats
  const presentCount  = displayDays.filter((d) => recordMap[d]?.punchIn && recordMap[d]?.punchOut).length;
  const inProgCount   = displayDays.filter((d) => recordMap[d]?.punchIn && !recordMap[d]?.punchOut).length;
  const onLeaveCount  = displayDays.filter((d) => approvedLeavesMap[d] && !recordMap[d]).length;
  const absentCount   = displayDays.filter((d) => !recordMap[d] && !approvedLeavesMap[d] && !isWeekend(d)).length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-background min-h-screen text-text-primary">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gradient">Attendance Manager</h1>
          <p className="text-text-muted text-sm mt-1">Your attendance log for the last 30 days</p>
        </div>
        <button
          onClick={fetchRecords}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border
                     text-text-secondary text-sm hover:bg-surface transition-colors
                     disabled:opacity-50 self-start sm:self-auto"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Summary stat chips ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Present',     value: presentCount,  color: 'text-green-400', bg: 'bg-green-500/10'  },
          { label: 'In Progress', value: inProgCount,   color: 'text-orange',    bg: 'bg-orange/10'     },
          { label: 'On Leave',    value: onLeaveCount,  color: 'text-purple-400',bg: 'bg-purple-500/10' },
          { label: 'Absent',      value: absentCount,   color: 'text-red-400',   bg: 'bg-red-500/10'   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-border rounded-xl px-4 py-3`}>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-text-muted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Main Card ────────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">

        {loading && <Spinner />}
        {!loading && error && <ErrorState message={error} onRetry={fetchRecords} />}

        {!loading && !error && (
          <div className="p-6 flex flex-col gap-8">
            {/* Heatmap */}
            <AttendanceHeatmap days={displayDays} recordMap={recordMap} approvedLeavesMap={approvedLeavesMap} />

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Log table */}
            <AttendanceTable days={displayDays} recordMap={recordMap} approvedLeavesMap={approvedLeavesMap} />
          </div>
        )}
      </div>
    </div>
  );
}
