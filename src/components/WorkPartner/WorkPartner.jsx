import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { ProgressBar } from '../shared/TaskCard';
import { formatDate } from '../../utils/dateHelpers';

const WorkPartnerCard = ({ task, currentUid }) => {
  const coworkers = (task.assignedTo || []).filter(uid => uid !== currentUid);

  return (
    <div className="card-hover p-5">
      {/* Task Info */}
      <div className="mb-4">
        <h3 className="font-bold text-text-primary mb-1 line-clamp-2">{task.title}</h3>
        {task.module && (
          <p className="text-xs text-text-muted uppercase tracking-wide font-semibold">{task.module}</p>
        )}
        <p className="text-xs text-text-secondary mt-1">Due: {formatDate(task.dueDate)}</p>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>Progress</span>
          <span className="font-semibold text-text-primary">{task.progress || 0}%</span>
        </div>
        <ProgressBar progress={task.progress} />
      </div>

      {/* Co-workers label */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          Working with you ({coworkers.length})
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {coworkers.slice(0, 5).map((uid, i) => (
            <div
              key={uid}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/60 to-purple-500/60 border-2 border-background flex items-center justify-center text-xs font-bold text-white"
              style={{ marginLeft: i > 0 ? '-8px' : '0', zIndex: 5 - i }}
              title={uid}
            >
              ?
            </div>
          ))}
          {coworkers.length > 5 && (
            <span className="text-xs text-text-muted font-medium ml-1">+{coworkers.length - 5} more</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default function WorkPartner() {
  const { tasks, loading } = useTasks();
  const { user } = useAuth();

  const sharedTasks = tasks.filter(
    t => Array.isArray(t.assignedTo) && t.assignedTo.length > 1 && t.assignedTo.includes(user?.uid)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-text-primary">Work Partner</h1>
        <p className="text-sm text-text-secondary mt-1">People working with you on shared tasks</p>
      </div>

      {sharedTasks.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🤝</div>
          <h3 className="text-lg font-bold text-text-primary mb-2">No shared tasks currently</h3>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            When you and a colleague are assigned to the same task, they'll appear here as your work partners.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sharedTasks.map(task => (
            <WorkPartnerCard key={task.id} task={task} currentUid={user?.uid} />
          ))}
        </div>
      )}
    </div>
  );
}
