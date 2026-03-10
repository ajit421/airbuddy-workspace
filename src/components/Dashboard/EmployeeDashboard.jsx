import { useState } from 'react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { DonutChart, BarChart, LineChart } from '../shared/Charts';
import TaskCard from '../shared/TaskCard';
import TaskDetailModal from '../Calendar/TaskDetailModal';
import SelfTaskModal from './SelfTaskModal';
import { getDueDateLabel, getDueDateColor } from '../../utils/dateHelpers';

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

export default function EmployeeDashboard() {
  const { tasks, loading, getTasksByStatus, getUpcomingTasks } = useTasks();
  const { userProfile } = useAuth();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isSelfTaskModalOpen, setIsSelfTaskModalOpen] = useState(false);

  const total = tasks.length;
  const completed = getTasksByStatus('completed').length;
  const pending = getTasksByStatus('pending').length;
  const inProgress = getTasksByStatus('in-progress').length;
  const upcoming = getUpcomingTasks(7).length;

  const nextTasks = [...tasks]
    .filter(t => t.status !== 'completed')
    .sort((a, b) => {
      const da = a.dueDate?.toDate ? a.dueDate.toDate() : new Date(a.dueDate);
      const db_ = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
      return da - db_;
    });

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
          <p className="text-sm text-text-secondary mt-1">Here's your workspace overview for today.</p>
        </div>
        
        <button 
          onClick={() => setIsSelfTaskModalOpen(true)}
          className="btn-primary text-sm shrink-0 shadow-orange-glow whitespace-nowrap"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          New Personal Task
        </button>
      </div>

      {/* Stats Cards */}
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
          sublabel={total > 0 ? `${Math.round((completed/total)*100)}% rate` : '0% rate'}
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
          {tasks.length > 0 ? (
            <DonutChart tasks={tasks} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No tasks yet</div>
          )}
        </div>

        {/* Bar Chart */}
        <div className="card">
          <h3 className="section-title mb-4">Weekly Workload</h3>
          {tasks.length > 0 ? (
            <BarChart tasks={tasks} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data yet</div>
          )}
        </div>

        {/* Line Chart */}
        <div className="card">
          <h3 className="section-title mb-4">Monthly Progress</h3>
          {tasks.length > 0 ? (
            <LineChart tasks={tasks} />
          ) : (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Upcoming Tasks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">Upcoming Tasks</h3>
          <span className="text-xs text-text-muted">{nextTasks.length} task{nextTasks.length !== 1 ? 's' : ''}</span>
        </div>

        {nextTasks.length === 0 ? (
          <div className="card text-center py-10">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-semibold text-text-primary">All caught up!</p>
            <p className="text-sm text-text-muted mt-1">No pending tasks right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {nextTasks.map(task => (
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
