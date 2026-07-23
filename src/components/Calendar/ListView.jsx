import { useState, useMemo } from 'react';
import { formatDate, toDate } from '../../utils/dateHelpers';
import { PriorityBadge, StatusBadge } from '../shared/TaskCard';

// ─── Leave Status Badge ────────────────────────────────────────────────────────
function LeaveStatusBadge({ status }) {
  const styles = {
    approved: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    pending:  'bg-orange/10 text-orange border-orange/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${
        styles[status] || styles.pending
      }`}
    >
      {status}
    </span>
  );
}

// ─── Leave Type Badge ──────────────────────────────────────────────────────────
function LeaveTypeBadge({ type }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20 capitalize">
      🌴 {type}
    </span>
  );
}

export default function ListView({ tasks, leaves = [], onTaskClick }) {
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [startFilter, setStartFilter] = useState('');
  const [endFilter, setEndFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        const matchesSearch = !search || t.title?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        const startDate = toDate(t.startDate);
        const matchesStart = !startFilter || (startDate && startDate >= new Date(startFilter));
        const matchesEnd = !endFilter || (startDate && startDate <= new Date(endFilter));
        return matchesSearch && matchesStatus && matchesStart && matchesEnd;
      })
      .sort((a, b) => {
        const da = toDate(a.startDate) || new Date(0);
        const db_ = toDate(b.startDate) || new Date(0);
        return sortDir === 'asc' ? da - db_ : db_ - da;
      });
  }, [tasks, search, sortDir, startFilter, endFilter, statusFilter]);

  // Only show non-rejected leaves in list (or all if no filter applied)
  // Leaves are not filtered by the task filters — shown as a separate block.
  const sortedLeaves = useMemo(() => {
    return [...leaves].sort((a, b) =>
      sortDir === 'asc'
        ? (a.startDate ?? '').localeCompare(b.startDate ?? '')
        : (b.startDate ?? '').localeCompare(a.startDate ?? '')
    );
  }, [leaves, sortDir]);

  return (
    <div className="card space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <input
            className="input-field"
            placeholder="🔍 Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select-field w-36"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <input type="date" className="input-field w-40" value={startFilter} onChange={(e) => setStartFilter(e.target.value)} />
        <input type="date" className="input-field w-40" value={endFilter} onChange={(e) => setEndFilter(e.target.value)} />
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-background">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide w-8">
                #
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                Task
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">
                Module
              </th>
              <th
                className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide cursor-pointer hover:text-orange transition-colors"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              >
                Start Date {sortDir === 'asc' ? '↑' : '↓'}
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden sm:table-cell">
                Priority
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderLight">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-muted text-sm">
                  No tasks match your filters
                </td>
              </tr>
            ) : (
              filtered.map((task, _) => (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="hover:bg-surfaceHover cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {task.status === 'in-progress' ? (
                      <span className="w-2 h-2 rounded-full bg-orange inline-block animate-pulse-dot" title="Live" />
                    ) : task.status === 'completed' ? (
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
                      </svg>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-text-primary line-clamp-1">{task.title}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary hidden md:table-cell text-xs">{task.module || '—'}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(task.startDate)}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">{filtered.length} of {tasks.length} tasks shown</p>

      {/* ── Leaves Section ──────────────────────────────────────────────────────── */}
      {sortedLeaves.length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            {/* <span>🌴</span> */}
            Leave Requests
            <span className="text-xs font-normal text-text-muted">({sortedLeaves.length})</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-purple-500/20">
            <table className="w-full text-sm">
              <thead className="bg-purple-500/5">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Type
                  </th>
                  {/* Show employee name column only for admin */}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">
                    Employee
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                    From
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                    To
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {sortedLeaves.map((leave) => (
                  <tr
                    key={leave.id}
                    className="hover:bg-purple-500/5 transition-colors border-l-2 border-l-purple-500/30"
                    style={{ cursor: 'default' }}
                  >
                    <td className="px-4 py-3">
                      <LeaveTypeBadge type={leave.type} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs hidden md:table-cell">
                      {leave.applicantName || '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {formatDate(leave.startDate)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-xs">
                      {formatDate(leave.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <LeaveStatusBadge status={leave.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
