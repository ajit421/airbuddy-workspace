import { useState, useMemo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { getPriorityColor } from '../../utils/permissions';
import { formatDate, toDate } from '../../utils/dateHelpers';
import TaskDetailModal from './TaskDetailModal';
import ListView from './ListView';

const localizer = momentLocalizer(moment);

export default function CalendarView() {
  const { tasks, loading, allUsers } = useTasks();
  const { isAdmin } = useAuth();
  const [view, setView] = useState(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState(null);
  const [showList, setShowList] = useState(false);

  // Convert tasks to calendar events
  const events = useMemo(() => {
    return tasks.map(task => {
      const start = toDate(task.startDate) || new Date();
      const end = toDate(task.dueDate) || start;
      
      let title = task.title;
      if (isAdmin && task.assignedTo?.length > 0) {
        const names = task.assignedTo.map(uid => allUsers[uid]?.name?.split(' ')[0] || 'Unknown').join(', ');
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
  }, [tasks, isAdmin, allUsers]);

  const eventStyleGetter = (event) => {
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

  const handleSelectEvent = (event) => {
    setSelectedTask(event.resource);
  };

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
          {/* View Toggle */}
          <div className="flex items-center bg-surface border border-border rounded-lg p-1 gap-1">
            {[
              { label: 'Month', value: Views.MONTH },
              { label: 'Week', value: Views.WEEK },
              { label: 'Day', value: Views.DAY },
            ].map(v => (
              <button
                key={v.value}
                onClick={() => setView(v.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === v.value
                    ? 'bg-orange text-white'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surfaceHover'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* List Toggle */}
          <button
            onClick={() => setShowList(p => !p)}
            className={`btn-secondary text-xs ${showList ? 'border-orange text-orange' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            List View
          </button>
        </div>
      </div>

      {/* Priority Legend */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span className="font-medium">Priority:</span>
        {[
          { label: 'High', color: '#EF4444' },
          { label: 'Medium', color: '#F59E0B' },
          { label: 'Low', color: '#3B82F6' },
        ].map(p => (
          <div key={p.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.color + '50', borderLeft: `2px solid ${p.color}` }} />
            <span>{p.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar or List */}
      {showList ? (
        <ListView tasks={tasks} onTaskClick={setSelectedTask} />
      ) : (
        <div className="card p-4 min-h-[600px]">
          <Calendar
            localizer={localizer}
            events={events}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            style={{ height: 560 }}
            popup
            selectable={false}
            toolbar={true}
          />
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
}
