import { useState, useMemo, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
// ME-5 fix: switched from momentLocalizer (adds ~67 KB gzipped) to dateFnsLocalizer.
// date-fns is already a production dep used elsewhere in the project.
import { format, parse, startOfWeek, getDay } from 'date-fns';
import enIN from 'date-fns/locale/en-IN';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { getPriorityColor } from '../../utils/permissions';
import { formatDate, toDate } from '../../utils/dateHelpers';
import TaskDetailModal from './TaskDetailModal';
import ListView from './ListView';
import { getMyLeaves, getAllLeaves } from '../../services/hrmsService';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Monday
  getDay,
  locales: { 'en-IN': enIN },
});

// ─── Leave status style map ────────────────────────────────────────────────────
const LEAVE_STYLES = {
  approved: {
    backgroundColor: 'rgba(168, 85, 247, 0.25)',
    borderLeft: '3px solid #a855f7',
    color: '#E6EDF3',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
  },
  pending: {
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
    borderLeft: '3px solid #f97316',
    color: '#E6EDF3',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
  },
  rejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderLeft: '3px solid #ef4444',
    color: '#9ca3af',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
  },
};

// ─── Leave Info Panel (lightweight modal) ─────────────────────────────────────
function LeaveInfoPanel({ leave, onClose }) {
  if (!leave) return null;

  const statusStyles = {
    approved: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    pending:  'bg-orange/10 text-orange border-orange/30',
    rejected: 'bg-red-500/10 text-red-400 border-red-500/30',
  };
  const statusStyle = statusStyles[leave.status] || statusStyles.pending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {/* <span className="text-xl">🌴</span> */}
            <h3 className="text-base font-bold text-text-primary">Leave Request</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-background transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4">
          {/* Leave type + status */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Type</p>
              <p className="text-sm font-semibold text-text-primary capitalize">{leave.type} Leave</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${statusStyle}`}>
              {leave.status}
            </span>
          </div>

          {/* Applicant (admin view only) */}
          {leave.applicantName && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Employee</p>
              <p className="text-sm text-text-primary">{leave.applicantName}</p>
            </div>
          )}

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">From</p>
              <p className="text-sm text-text-primary">{formatDate(leave.startDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">To</p>
              <p className="text-sm text-text-primary">{formatDate(leave.endDate)}</p>
            </div>
          </div>

          {/* Reason */}
          {leave.reason && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Reason</p>
              <p className="text-sm text-text-secondary leading-relaxed">{leave.reason}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CalendarView() {
  const { tasks, loading, allUsers } = useTasks();
  const { isAdmin, effectiveUid } = useAuth();
  const [view, setView] = useState(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showList, setShowList] = useState(false);

  // ── Leave data ────────────────────────────────────────────────────────────────
  const [leaves, setLeaves] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leavesError, setLeavesError] = useState(null);

  useEffect(() => {
    if (!effectiveUid) return;
    setLeavesLoading(true);
    setLeavesError(null);

    const fetcher = isAdmin ? getAllLeaves() : getMyLeaves(effectiveUid);
    fetcher
      .then(setLeaves)
      .catch((err) => {
        console.error('[CalendarView] Failed to fetch leaves:', err);
        setLeavesError('Could not load leave data.');
      })
      .finally(() => setLeavesLoading(false));
  }, [effectiveUid, isAdmin]);

  // ── Convert tasks + leaves to calendar events ─────────────────────────────────
  const events = useMemo(() => {
    // Task events
    const taskEvents = tasks.map((task) => {
      const start = toDate(task.startDate) || new Date();
      const end = toDate(task.dueDate) || start;

      let title = task.title;
      if (isAdmin && task.assignedTo?.length > 0) {
        const names = task.assignedTo
          .map((uid) => allUsers[uid]?.name?.split(' ')[0] || 'Unknown')
          .join(', ');
        title = `${task.title} (${names})`;
      }

      return {
        id: task.id,
        title,
        start,
        end,
        resource: task,
        allDay: true,
      };
    });

    // Leave events — leave dates are stored as YYYY-MM-DD strings
    const leaveEvents = leaves.map((leave) => {
      const start = new Date(leave.startDate);
      const end   = new Date(leave.endDate);
      const emoji = leave.status === 'approved' ? '✅' : leave.status === 'rejected' ? '❌' : '⏳';
      const namePrefix = isAdmin && leave.applicantName ? `${leave.applicantName}: ` : '';
      return {
        id: `leave-${leave.id}`,
        title: `${emoji} ${namePrefix}${leave.type} Leave`,
        start,
        end,
        allDay: true,
        resource: { ...leave, _type: 'leave' },
      };
    });

    return [...taskEvents, ...leaveEvents];
  }, [tasks, leaves, isAdmin, allUsers]);

  // ── Dynamic calendar height ───────────────────────────────────────────────────
  const calendarHeight = useMemo(() => {
    if (events.length === 0 || view !== Views.MONTH) return 650;
    const dayCounts = {};
    events.forEach((ev) => {
      const key = ev.start.toDateString();
      dayCounts[key] = (dayCounts[key] || 0) + 1;
    });
    const maxEventsInADay = Math.max(...Object.values(dayCounts), 1);
    const rowHeight = 30 + maxEventsInADay * 28;
    return Math.max(650, rowHeight * 6);
  }, [events, view]);

  // ── Event style ───────────────────────────────────────────────────────────────
  const eventStyleGetter = (event) => {
    if (event.resource?._type === 'leave') {
      const status = event.resource.status || 'pending';
      return { style: LEAVE_STYLES[status] || LEAVE_STYLES.pending };
    }
    const color = getPriorityColor(event.resource?.priority);
    return {
      style: {
        backgroundColor: `${color}30`,
        borderLeft: `3px solid ${color}`,
        color: '#E6EDF3',
        borderRadius: '6px',
        fontWeight: 500,
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  };

  // ── Event click handler ───────────────────────────────────────────────────────
  const handleSelectEvent = (event) => {
    if (event.resource?._type === 'leave') {
      setSelectedLeave(event.resource);
    } else {
      setSelectedTask(event.resource);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Calendar</h1>
          <p className="text-sm text-text-secondary">View and manage your tasks on the calendar</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Main View Toggle */}
          <div className="flex items-center bg-surface border border-border rounded-lg p-1 gap-1">
            <button
              onClick={() => setShowList(false)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${!showList
                ? 'bg-orange text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Calendar
            </button>
            <button
              onClick={() => setShowList(true)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${showList
                ? 'bg-orange text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              List View
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted">
        {/* Priority legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-secondary">Priority:</span>
          {[
            { label: 'High',   color: '#EF4444' },
            { label: 'Medium', color: '#F59E0B' },
            { label: 'Low',    color: '#3B82F6' },
          ].map((p) => (
            <div key={p.label} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: p.color + '50', borderLeft: `2px solid ${p.color}` }}
              />
              <span>{p.label}</span>
            </div>
          ))}
        </div>

        {/* Leave legend */}
        <div className="flex items-center gap-3">
          <span className="font-semibold text-text-secondary">Leave:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(168,85,247,0.35)', borderLeft: '2px solid #a855f7' }} />
            <span>Approved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(249,115,22,0.35)', borderLeft: '2px solid #f97316' }} />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderLeft: '2px solid #ef4444' }} />
            <span>Rejected</span>
          </div>
        </div>
      </div>

      {/* Leaves loading/error notice (non-blocking) */}
      {leavesLoading && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <div className="w-3 h-3 rounded-full border border-purple-400 border-t-transparent animate-spin" />
          Loading leave data…
        </div>
      )}
      {leavesError && !leavesLoading && (
        <p className="text-xs text-red-400">{leavesError}</p>
      )}

      {/* Calendar or List */}
      {showList ? (
        <ListView tasks={tasks} leaves={leaves} onTaskClick={setSelectedTask} />
      ) : (
        <div className="card p-4 min-h-[600px] overflow-x-auto">
          <div style={{ minWidth: '800px' }}>
            <Calendar
              localizer={localizer}
              events={events}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              style={{ height: calendarHeight }}
              popup={false}
              selectable={false}
              toolbar={true}
            />
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

      {/* Leave Info Panel */}
      {selectedLeave && (
        <LeaveInfoPanel leave={selectedLeave} onClose={() => setSelectedLeave(null)} />
      )}
    </div>
  );
}
