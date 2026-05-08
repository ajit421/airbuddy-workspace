import { useState, useEffect, useRef } from 'react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { DonutChart, BarChart, LineChart } from '../shared/Charts';
import TaskCard from '../shared/TaskCard';
import TaskDetailModal from '../Calendar/TaskDetailModal';
import SelfTaskModal from './SelfTaskModal';
import { getDueDateLabel, getDueDateColor } from '../../utils/dateHelpers';
import TaskFilterBar from './TaskFilterBar';
import { useTaskFilters } from '../../hooks/useTaskFilters';
// HRMS Dashboard Widget — attendance punch service
import { recordPunch, getTodayAttendance } from '../../services/hrmsService';

const StatCard = ({ icon, label, value, color, sublabel }) => (
  <div className="stat-card">
    <div className={`stat-icon ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-black text-text-primary">{value}</p>
      <p className="text-sm font-semibold text-text-primary">{label}</p>
      {sublabel && <p className="text-xs text-text-muted mt-0.5">{sublabel}</p>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// HRMS Dashboard Widget — Quick Check In/Out card
// Self-contained: manages its own clock interval and check state.
// ─────────────────────────────────────────────────────────────────────────────
function QuickPunchWidget({ uid }) {
  // 'unknown' | 'in' | 'out' | 'done'
  const [punchStatus, setPunchStatus] = useState('unknown');
  const [todayRecord, setTodayRecord] = useState(null);
  const [punching, setPunching]       = useState(false);
  const [clockStr, setClockStr]       = useState('');
  const intervalRef = useRef(null);

  // Format a Firestore Timestamp or null to a time string like "09:32 AM"
  const fmtTime = (ts) => {
    if (!ts) return null;
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Live clock — updates every 30 seconds
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
    };
    tick();
    intervalRef.current = setInterval(tick, 30_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // Load today's record on mount
  useEffect(() => {
    if (!uid) return;
    getTodayAttendance(uid)
      .then((rec) => {
        setTodayRecord(rec);
        if (!rec)             setPunchStatus('unknown'); // not yet punched in
        else if (!rec.punchOut) setPunchStatus('in');   // punched in, no out yet
        else                    setPunchStatus('done');  // full shift recorded
      })
      .catch(() => setPunchStatus('unknown'));
  }, [uid]);

  const handlePunch = async () => {
    if (!uid || punching || punchStatus === 'done') return;
    setPunching(true);
    try {
      const result = await recordPunch(uid);
      if (result === 'in')  setPunchStatus('in');
      if (result === 'out') setPunchStatus('done');
      // Refresh the record to get timestamps
      const updated = await getTodayAttendance(uid);
      setTodayRecord(updated);
    } catch (e) {
      console.error('[QuickPunchWidget] punch failed:', e);
    } finally {
      setPunching(false);
    }
  };

  // Derive button appearance from state
  const btnConfig = {
    unknown: { label: 'Check In',        cls: 'bg-green-500 hover:bg-green-600 text-white', emoji: '🟢' },
    in:      { label: 'Check Out',       cls: 'bg-orange   hover:bg-orange-hover text-white', emoji: '🟠' },
    done:    { label: 'Shift Completed', cls: 'bg-surface  text-text-muted cursor-not-allowed border border-border', emoji: '✅' },
  };
  const btn = btnConfig[punchStatus] ?? btnConfig.unknown;

  return (
    // HRMS Dashboard Widget — container card
    <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Clock + greeting */}
      <div className="flex items-center gap-3 flex-1">
        <div className="w-10 h-10 rounded-xl bg-orange/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-black text-text-primary tabular-nums">{clockStr}</p>
          <p className="text-xs text-text-muted">
            {punchStatus === 'done'
              ? `Shift done · In ${fmtTime(todayRecord?.punchIn)} · Out ${fmtTime(todayRecord?.punchOut)}`
              : punchStatus === 'in'
              ? `Checked in at ${fmtTime(todayRecord?.punchIn)}`
              : 'You haven\'t checked in today'}
          </p>
        </div>
      </div>

      {/* Punch button */}
      <button
        onClick={handlePunch}
        disabled={punching || punchStatus === 'done'}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                    transition-colors disabled:opacity-70 flex-shrink-0 ${btn.cls}`}
      >
        {punching
          ? <span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
          : <span>{btn.emoji}</span>
        }
        {punching ? 'Recording…' : btn.label}
      </button>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { tasks, loading, getUpcomingTasks, allUsers } = useTasks();
  const { userProfile, isAdmin } = useAuth();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isSelfTaskModalOpen, setIsSelfTaskModalOpen] = useState(false);

  // timeFilter: 'month' | 'week' | 'day'
  const [timeFilter, setTimeFilter] = useState('month');

  const {
    state,
    filteredTasks: taskListTasks,
    workPartners,
    employeeList,
    setStatusFilter,
    setSortOrder,
    togglePriority,
    setWorkPartner,
    setEmployee,
    toggleFiltersOpen,
    resetFilters,
    isFilterActive,
    taskCountByStatus,
  } = useTaskFilters(tasks, allUsers, isAdmin);

  // Filter tasks based on selected timeframe
  const filteredTasks = tasks.filter(t => {
    // If no dates, keep it (or decide to exclude). We'll keep it for broad stats.
    const refDateValue = t.dueDate || t.startDate || t.createdAt;
    if (!refDateValue) return true;

    const refDate = refDateValue.toDate ? refDateValue.toDate() : new Date(refDateValue);
    const now = new Date();

    // reset times for day comparison
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (timeFilter === 'day') {
      const taskDay = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
      return taskDay.getTime() === startOfToday.getTime();
    }

    if (timeFilter === 'week') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return refDate >= sevenDaysAgo;
    }

    // month (last 30 days)
    if (timeFilter === 'month') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return refDate >= thirtyDaysAgo;
    }

    return true;
  });

  const total = filteredTasks.length;
  const completed = filteredTasks.filter(t => t.status === 'completed').length;
  const pending = filteredTasks.filter(t => t.status === 'pending').length;
  const inProgress = filteredTasks.filter(t => t.status === 'in-progress').length;

  // Upcoming deadlines logic usually ignores the backward filter, but we'll use global tasks for it.
  const upcoming = getUpcomingTasks(7).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Greeting & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
            <span className="text-gradient">{userProfile?.name?.split(' ')[0] || 'there'}</span> 👋
          </h1>
          <p className="text-sm text-text-secondary mt-1">Here's your workspace overview {timeFilter === 'day' ? 'for today' : `for this ${timeFilter}`}.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Time Filter Toggle */}
          <div className="flex items-center bg-surface border border-border rounded-lg p-1 gap-1">
            {['Month', 'Week', 'Day'].map(view => {
              const val = view.toLowerCase();
              return (
                <button
                  key={view}
                  onClick={() => setTimeFilter(val)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${timeFilter === val
                    ? 'bg-orange text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
                    }`}
                >
                  {view}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsSelfTaskModalOpen(true)}
            className="btn-primary text-sm shrink-0 shadow-orange-glow whitespace-nowrap"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            New Personal Task
          </button>
        </div>
      </div>

      {/* ── HRMS Dashboard Widget: Quick Check In/Out ─────────────────────── */}
      {/* Passes the uid from AuthContext; renders nothing if user is not loaded yet */}
      {userProfile?.uid && <QuickPunchWidget uid={userProfile.uid} />}
      {/* ─────────────────────────────────────────────────────────────────── */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<span className="text-xl">📋</span>}
          label="Total Tasks"
          value={total}
          color="bg-blue-500/10"
          sublabel="All assigned"
        />
        <StatCard
          icon={<span className="text-xl">✅</span>}
          label="Completed"
          value={completed}
          color="bg-green-500/10"
          sublabel={total > 0 ? `${Math.round((completed / total) * 100)}% rate` : '0% rate'}
        />
        <StatCard
          icon={<span className="text-xl">⏳</span>}
          label="Pending"
          value={pending + inProgress}
          color="bg-orange-muted"
          sublabel={`${inProgress} in progress`}
        />
        <StatCard
          icon={<span className="text-xl">🔔</span>}
          label="Due This Week"
          value={upcoming}
          color="bg-red-500/10"
          sublabel="Upcoming deadlines"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Donut Chart */}
        <div className="card">
          <h3 className="section-title mb-4">Task Status</h3>
          {filteredTasks.length > 0 ? (
            <DonutChart tasks={filteredTasks} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No tasks {timeFilter === 'day' ? 'today' : `this ${timeFilter}`}</div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="card">
          <h3 className="section-title mb-4">Workload</h3>
          {filteredTasks.length > 0 ? (
            <BarChart tasks={filteredTasks} timeRange={timeFilter} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data</div>
          )}
        </div>

        {/* Line Chart */}
        <div className="card">
          <h3 className="section-title mb-4">Progress Trend</h3>
          {filteredTasks.length > 0 ? (
            <LineChart tasks={filteredTasks} timeRange={timeFilter} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data</div>
          )}
        </div>
      </div>

      {/* Upcoming Tasks */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h3 className="section-title m-0">All Tasks</h3>
            <span className="text-xs text-text-muted">{taskCountByStatus.all} task{taskCountByStatus.all !== 1 ? 's' : ''} total</span>
          </div>
          <button
            onClick={toggleFiltersOpen}
            className={`
              relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              border transition-all
              ${state.filtersOpen
                ? 'bg-orange/10 border-orange/40 text-orange'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-orange/30'
              }
            `}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            Filters
            {isFilterActive && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-orange" />
            )}
          </button>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1 mb-4 bg-surface border border-border rounded-xl p-1 overflow-x-auto">
          {[
            { label: 'All', value: 'all', count: taskCountByStatus.all, color: '' },
            { label: 'In Progress', value: 'in-progress', count: taskCountByStatus['in-progress'], color: 'text-blue-400' },
            { label: 'Pending', value: 'pending', count: taskCountByStatus['pending'], color: 'text-orange' },
            { label: 'Completed', value: 'completed', count: taskCountByStatus['completed'], color: 'text-green-400' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${state.statusFilter === tab.value
                ? 'bg-orange text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
                }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${state.statusFilter === tab.value
                ? 'bg-white/20 text-white'
                : 'bg-border text-text-muted'
                }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <TaskFilterBar
          state={state}
          isAdmin={isAdmin}
          workPartners={workPartners}
          employeeList={employeeList}
          isFilterActive={isFilterActive}
          setSortOrder={setSortOrder}
          togglePriority={togglePriority}
          setWorkPartner={setWorkPartner}
          setEmployee={setEmployee}
          resetFilters={resetFilters}
        />

        {taskListTasks.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-4xl mb-3">
              {state.statusFilter === 'completed' ? '🎉' : state.statusFilter === 'in-progress' ? '🚀' : '📋'}
            </div>
            <p className="font-semibold text-text-primary">
              {state.statusFilter === 'completed'
                ? 'No completed tasks yet!'
                : state.statusFilter === 'in-progress'
                  ? 'Nothing in progress right now.'
                  : state.statusFilter === 'pending'
                    ? 'No pending tasks!'
                    : 'All caught up!'}
            </p>
            <p className="text-sm text-text-muted mt-1">
              {state.statusFilter === 'all' ? 'No tasks assigned yet.' : `Switch to another tab to see other tasks.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {taskListTasks.map(task => (
              <TaskCard key={task.id} task={task} onClick={setSelectedTask} />
            ))}
          </div>
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Self Task Modal */}
      <SelfTaskModal
        isOpen={isSelfTaskModalOpen}
        onClose={() => setIsSelfTaskModalOpen(false)}
      />
    </div>
  );
}
