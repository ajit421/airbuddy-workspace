/**
 * RoadmapKpiStrip.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Roadmap analytics section inserted into KpiDashboard.jsx (Phase 16).
 *
 * Layout:
 *   Row 1 — 4 stat cards: Completion %, Delayed, Upcoming, Critical/Blocked
 *   Row 2 — 3 chart widgets: Node Status Doughnut, Task Priority Bar, Top Contributors
 *   Row 3 — 2 list widgets: Recent Activity, Upcoming Deadlines
 *
 * All data from useRoadmapKpi() — 2 Firestore reads total, rest is client-side.
 * Charts use chart.js/react-chartjs-2 (already registered in Charts.jsx).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { useRoadmapKpi } from '../../hooks/useRoadmapKpi';
import { useTasks } from '../../context/TaskContext';
import { ProgressMeter } from '../shared/Charts';
import { timeFromNow } from '../../utils/dateHelpers';

// Ensure chart.js elements are registered (idempotent)
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ── Shared chart.js theme ──────────────────────────────────────────────────
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#8B949E', font: { family: 'Inter', size: 11 }, padding: 12 },
    },
    tooltip: {
      backgroundColor: '#1C2128',
      borderColor: '#30363D',
      borderWidth: 1,
      titleColor: '#E6EDF3',
      bodyColor: '#8B949E',
      padding: 8,
      cornerRadius: 8,
    },
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────

/** Skeleton shimmer card */
function SkeletonCard() {
  return <div className="stat-card animate-pulse bg-surfaceHover h-24" />;
}

/** Single stat card */
function StatCard({ value, label, sublabel, accent = 'text-orange', iconBg = 'bg-orange/15', icon }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconBg} ${accent}`}>{icon}</div>
      <div>
        <p className={`text-2xl font-black ${accent}`}>{value}</p>
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {sublabel && <p className="text-xs text-text-muted mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

/** Node status doughnut */
function NodeStatusDoughnut({ nodesByStatus }) {
  const { pending, inProgress, completed, blocked } = nodesByStatus;
  const total = pending + inProgress + completed + blocked;

  const data = {
    labels: ['Pending', 'In Progress', 'Completed', 'Blocked'],
    datasets: [{
      data: [pending, inProgress, completed, blocked],
      backgroundColor: ['#F59E0B', '#3B82F6', '#22C55E', '#EF4444'],
      borderColor: ['#161B22', '#161B22', '#161B22', '#161B22'],
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };

  const options = {
    ...chartDefaults,
    cutout: '68%',
    plugins: {
      ...chartDefaults.plugins,
      legend: { ...chartDefaults.plugins.legend, position: 'bottom' },
    },
  };

  return (
    <div className="card p-5 flex flex-col gap-3">
      <p className="text-sm font-bold text-text-primary">Node Status</p>
      {/* Phase 18: clamp height so chart shrinks on narrow mobile screens */}
      <div className="relative" style={{ height: 'clamp(160px, 30vw, 200px)' }}>
        <Doughnut data={data} options={options} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-black text-text-primary">{total}</span>
          <span className="text-[10px] text-text-muted">Nodes</span>
        </div>
      </div>
    </div>
  );
}

/** Task priority bar chart */
function TaskPriorityBar({ tasksByPriority }) {
  const { critical, high, medium, low } = tasksByPriority;

  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low'],
    datasets: [{
      label: 'Tasks',
      data: [critical, high, medium, low],
      backgroundColor: [
        'rgba(239,68,68,0.75)',
        'rgba(249,115,22,0.75)',
        'rgba(245,158,11,0.75)',
        'rgba(59,130,246,0.75)',
      ],
      borderColor: ['#EF4444', '#F97316', '#F59E0B', '#3B82F6'],
      borderWidth: 1,
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const options = {
    ...chartDefaults,
    scales: {
      x: {
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 11 } },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#8B949E', font: { family: 'Inter', size: 11 }, stepSize: 1 },
        grid: { color: '#21262D' },
        border: { color: '#30363D' },
      },
    },
    plugins: { ...chartDefaults.plugins, legend: { display: false } },
  };

  return (
    <div className="card p-5 flex flex-col gap-3">
      <p className="text-sm font-bold text-text-primary">Tasks by Priority</p>
      {/* Phase 18: clamp height so chart shrinks on narrow mobile screens */}
      <div style={{ height: 'clamp(160px, 30vw, 200px)' }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}

/** Top contributors list */
function TopContributors({ contributors, allUsers }) {
  const max = contributors[0]?.completedCount || 1;

  return (
    <div className="card p-5 flex flex-col gap-4">
      <p className="text-sm font-bold text-text-primary">Top Contributors</p>
      {contributors.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No completed tasks yet.</p>
      ) : (
        <div className="space-y-3">
          {contributors.map((c, i) => {
            const user = allUsers[c.uid];
            const name = user?.name ?? c.uid.slice(0, 8);
            const avatar = user?.avatar;
            const pct = Math.round((c.completedCount / max) * 100);

            return (
              <div key={c.uid} className="flex items-center gap-3">
                {/* Rank */}
                <span className="text-xs font-bold text-text-muted w-4 flex-shrink-0">
                  {i + 1}
                </span>
                {/* Avatar */}
                {avatar ? (
                  <img src={avatar} alt={name} className="w-7 h-7 rounded-full flex-shrink-0 object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-orange-muted border border-orange/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange text-[10px] font-bold">{name[0]?.toUpperCase()}</span>
                  </div>
                )}
                {/* Name + bar */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-text-primary truncate">{name}</p>
                    <span className="text-[10px] text-text-muted flex-shrink-0 ml-2">
                      {c.completedCount}/{c.totalCount}
                    </span>
                  </div>
                  <ProgressMeter value={pct} color="#22C55E" showValue={false} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Recent activity list */
function RecentActivity({ nodes }) {
  const STATUS_DOT = {
    completed:    'bg-green-400',
    'in-progress': 'bg-blue-400',
    pending:      'bg-yellow-400',
    blocked:      'bg-red-400',
    archived:     'bg-border',
  };

  return (
    <div className="card p-5 flex flex-col gap-4">
      <p className="text-sm font-bold text-text-primary">Recent Activity</p>
      {nodes.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No recent activity.</p>
      ) : (
        <div className="space-y-3">
          {nodes.map((n) => {
            const dotCls = STATUS_DOT[n.status] || 'bg-border';
            const updatedAt = n.updatedAt?.toDate?.() ?? (n.updatedAt ? new Date(n.updatedAt) : null);
            return (
              <div key={n.id} className="flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotCls}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{n.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-text-muted capitalize">{n.status}</span>
                    {n.progress > 0 && (
                      <>
                        <span className="text-[10px] text-text-muted">·</span>
                        <span className="text-[10px] text-text-muted">{n.progress}%</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-text-muted flex-shrink-0 mt-0.5">
                  {updatedAt ? timeFromNow(updatedAt) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Upcoming deadlines list */
function UpcomingDeadlines({ nodes }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const PRIORITY_COLOR = {
    critical: 'text-red-400 bg-red-500/10',
    high:     'text-orange bg-orange/10',
    medium:   'text-yellow-400 bg-yellow-500/10',
    low:      'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className="card p-5 flex flex-col gap-4">
      <p className="text-sm font-bold text-text-primary">Upcoming Deadlines</p>
      {nodes.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-4">No upcoming deadlines in 14 days.</p>
      ) : (
        <div className="space-y-3">
          {nodes.map((n) => {
            const due = n.dueDate?.toDate?.() ?? new Date(n.dueDate);
            const diffMs   = due - today;
            const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const priCls   = PRIORITY_COLOR[n.priority] || PRIORITY_COLOR.medium;
            const urgentCls = daysLeft <= 2 ? 'text-red-400' : daysLeft <= 5 ? 'text-yellow-400' : 'text-text-muted';

            return (
              <div key={n.id} className="flex items-center gap-3">
                {/* Days badge */}
                <div className={`flex-shrink-0 w-10 text-center`}>
                  <p className={`text-sm font-black ${urgentCls}`}>{daysLeft}d</p>
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">{n.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold capitalize ${priCls}`}>
                      {n.priority}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RoadmapKpiStrip() {
  const {
    stats,
    topContributors,
    nodesByStatus,
    tasksByPriority,
    recentActivity,
    upcomingDeadlines,
    loading,
    error,
  } = useRoadmapKpi();

  const { allUsers } = useTasks();

  if (error) {
    return (
      <div className="mt-6 p-4 rounded-xl border border-red-500/20 bg-red-500/10">
        <p className="text-sm text-red-400">⚠️ Could not load roadmap analytics: {error}</p>
      </div>
    );
  }

  return (
    <section className="mt-8 space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
          <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-black text-text-primary">Roadmap Analytics</h2>
          <p className="text-xs text-text-muted">Live company roadmap performance metrics</p>
        </div>
      </div>

      {/* ── Row 1: Stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading ? (
          Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            {/* Completion % */}
            <StatCard
              value={`${stats.completionPct}%`}
              label="Completion"
              sublabel={`${stats.completedNodes}/${stats.totalNodes} milestones`}
              accent="text-teal-400"
              iconBg="bg-teal-500/15"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />

            {/* Delayed tasks */}
            <StatCard
              value={stats.delayedTasks}
              label="Delayed Tasks"
              sublabel="Past due date"
              accent={stats.delayedTasks > 0 ? 'text-red-400' : 'text-text-muted'}
              iconBg={stats.delayedTasks > 0 ? 'bg-red-500/15' : 'bg-surfaceHover'}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />

            {/* Upcoming deadlines */}
            <StatCard
              value={stats.upcomingTasks}
              label="Due This Week"
              sublabel="Next 7 days"
              accent={stats.upcomingTasks > 0 ? 'text-yellow-400' : 'text-text-muted'}
              iconBg={stats.upcomingTasks > 0 ? 'bg-yellow-500/15' : 'bg-surfaceHover'}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
            />

            {/* Critical / Blocked */}
            <StatCard
              value={stats.criticalNodes}
              label="Critical / Blocked"
              sublabel={`${stats.totalNodes} total nodes`}
              accent={stats.criticalNodes > 0 ? 'text-orange' : 'text-text-muted'}
              iconBg={stats.criticalNodes > 0 ? 'bg-orange/15' : 'bg-surfaceHover'}
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          </>
        )}
      </div>

      {/* ── Row 2: Charts ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="card h-64 animate-pulse bg-surfaceHover" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NodeStatusDoughnut nodesByStatus={nodesByStatus} />
          <TaskPriorityBar tasksByPriority={tasksByPriority} />
          <TopContributors contributors={topContributors} allUsers={allUsers} />
        </div>
      )}

      {/* ── Row 3: Lists ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className="card h-52 animate-pulse bg-surfaceHover" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RecentActivity nodes={recentActivity} />
          <UpcomingDeadlines nodes={upcomingDeadlines} />
        </div>
      )}
    </section>
  );
}
