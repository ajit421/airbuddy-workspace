import { useState, useEffect, useRef } from 'react';
import { useRoadmapNode } from '../../hooks/useRoadmapNode';
import { useAuth }        from '../../context/AuthContext';
import { canEditRoadmapStructure } from '../../utils/permissions';
import { formatDate, getDueDateColor, getDueDateLabel } from '../../utils/dateHelpers';
import { PriorityBadge, StatusBadge, ProgressBar } from '../shared/TaskCard';
import RoadmapBreadcrumb      from './RoadmapBreadcrumb';
import RoadmapTaskCard        from './RoadmapTaskCard';
import RoadmapTaskModal       from './RoadmapTaskModal';
import RoadmapCommentsTab     from './RoadmapCommentsTab';
import RoadmapAttachmentsTab  from './RoadmapAttachmentsTab';
import RoadmapHistoryLog      from './RoadmapHistoryLog';
import { subscribeToRoadmapTasks } from '../../services/roadmapTaskService';
import { subscribeToAllUsers }     from '../../services/teamMembersService';

/**
 * RoadmapNodeDetail.jsx
 * Slide-in right-side panel shown when a roadmap node is selected.
 * Tabbed layout: Overview | Tasks | Comments | History.
 *
 * Phase 11 scope:
 *  - Overview tab: full node metadata (breadcrumb, description, dates, assignees, progress, tags)
 *  - Tasks / Comments / History tabs: placeholder cards (implemented in Phases 12, 13, 17)
 *
 * Props:
 *  - nodeId      {string}   Selected node ID
 *  - onClose     {function} Close the panel
 *  - onEdit      {function} Open RoadmapNodeModal in edit mode (passed up to parent)
 *  - onAddChild  {function} Open RoadmapNodeModal for a new child (passed up to parent)
 *  - onNavigate  {function} Navigate to a different node by ID (breadcrumb clicks)
 */

const TABS = ['Overview', 'Tasks', 'Comments', 'Attachments', 'History'];

const STATUS_COLOR = {
  pending:       'text-yellow-400 bg-yellow-500/10 border-yellow-500/25',
  'in-progress': 'text-blue-400   bg-blue-500/10   border-blue-500/25',
  completed:     'text-green-400  bg-green-500/10  border-green-500/25',
  blocked:       'text-red-400    bg-red-500/10    border-red-500/25',
  archived:      'text-text-muted bg-surface       border-border',
};

export default function RoadmapNodeDetail({
  nodeId,
  onClose,
  onEdit,
  onAddChild,
  onNavigate,
}) {
  const [activeTab, setActiveTab] = useState('Overview');
  const { userProfile }           = useAuth();
  const canEdit                   = canEditRoadmapStructure(userProfile);
  const { node, loading }         = useRoadmapNode(nodeId);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <aside className="flex flex-col h-full bg-surface border-l border-border">
        <PanelHeader onClose={onClose} loading />
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-surfaceHover rounded-lg animate-pulse" />
          ))}
        </div>
      </aside>
    );
  }

  // ── Node not found ─────────────────────────────────────────────────────────
  if (!node) {
    return (
      <aside className="flex flex-col h-full bg-surface border-l border-border">
        <PanelHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-text-muted text-sm text-center">Node not found or has been archived.</p>
        </div>
      </aside>
    );
  }

  const dueDateColor = getDueDateColor(node.dueDate, node.status);
  const dueDateLabel = getDueDateLabel(node.dueDate, node.status);
  const hasChildren  = (node.childCount ?? 0) > 0;

  return (
    <aside className="flex flex-col h-full bg-surface border-l border-border overflow-hidden">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border space-y-2">
        {/* Breadcrumb */}
        <RoadmapBreadcrumb node={node} onNavigate={onNavigate} />

        {/* Title + close */}
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-text-primary font-bold text-base leading-snug line-clamp-3 min-w-0">
            {node.title}
          </h2>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 flex-shrink-0 rounded-lg"
            aria-label="Close panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status + Priority row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge   status={node.status}   />
          <PriorityBadge priority={node.priority} />
          {node.depth === 0 && (
            <span className="badge bg-orange-muted text-orange border border-orange/30 text-[10px]">Root</span>
          )}
        </div>

        {/* Admin action buttons */}
        {canEdit && (
          <div className="flex items-center gap-2 pt-1">
            <button
              id="rm-detail-edit-btn"
              onClick={() => onEdit?.(node)}
              className="btn-secondary flex-1 justify-center text-xs h-7"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            <button
              id="rm-detail-add-child-btn"
              onClick={() => onAddChild?.(node)}
              className="btn-primary flex-1 justify-center text-xs h-7"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Child
            </button>
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors
              ${activeTab === tab
                ? 'text-orange border-b-2 border-orange'
                : 'text-text-muted hover:text-text-secondary'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab body (scrollable) ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'Overview' && (
          <OverviewTab node={node} dueDateColor={dueDateColor} dueDateLabel={dueDateLabel} hasChildren={hasChildren} />
        )}
        {activeTab === 'Tasks' && (
          <TasksTab nodeId={nodeId} node={node} />
        )}
        {activeTab === 'Comments' && (
          <RoadmapCommentsTab nodeId={nodeId} />
        )}
        {activeTab === 'Attachments' && (
          <RoadmapAttachmentsTab nodeId={nodeId} />
        )}
        {activeTab === 'History' && (
          <RoadmapHistoryLog nodeId={nodeId} />
        )}
      </div>
    </aside>
  );
}

/* ── Overview tab ───────────────────────────────────────────────────────────── */
function OverviewTab({ node, dueDateColor, dueDateLabel, hasChildren }) {
  return (
    <div className="p-4 space-y-5">

      {/* Progress */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Progress</span>
          <span className="text-sm font-bold text-text-primary">{node.progress ?? 0}%</span>
        </div>
        <ProgressBar progress={node.progress} />
        {hasChildren && (
          <p className="text-xs text-text-muted mt-1">
            {node.childCompletedCount ?? 0} of {node.childCount ?? 0} child nodes completed
          </p>
        )}
      </section>

      {/* Description */}
      {node.description && (
        <section>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Description</h3>
          <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {node.description}
          </p>
        </section>
      )}

      {/* Dates */}
      <section>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Timeline</h3>
        <div className="space-y-2">
          <MetaRow label="Start Date">
            <span className="text-text-primary text-xs">
              {node.startDate ? formatDate(node.startDate) : <span className="text-text-muted italic">Not set</span>}
            </span>
          </MetaRow>
          <MetaRow label="Due Date">
            <span className={`text-xs font-medium ${node.dueDate ? dueDateColor : 'text-text-muted italic'}`}>
              {node.dueDate ? (
                <>{formatDate(node.dueDate)} <span className="text-text-muted font-normal">({dueDateLabel})</span></>
              ) : 'Not set'}
            </span>
          </MetaRow>
        </div>
      </section>

      {/* Assignees */}
      <section>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
          Assigned To ({node.assignedTo?.length ?? 0})
        </h3>
        {node.assignedTo?.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {node.assignedTo.map((uid) => (
              <span
                key={uid}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surfaceHover border border-border text-xs text-text-secondary"
              >
                <span className="w-4 h-4 rounded-full bg-orange/20 text-orange text-[9px] flex items-center justify-center font-bold flex-shrink-0">
                  {uid.charAt(0).toUpperCase()}
                </span>
                {uid}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-muted italic">No assignees</p>
        )}
      </section>

      {/* Tags */}
      {node.tags?.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {node.tags.map((tag) => (
              <span key={tag} className="badge bg-surfaceHover border border-borderLight text-text-muted text-xs">
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Metadata */}
      <section>
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Details</h3>
        <div className="space-y-2">
          <MetaRow label="Depth">
            <span className="text-text-primary text-xs">Level {node.depth ?? 0}{node.depth === 0 ? ' (Root)' : ''}</span>
          </MetaRow>
          <MetaRow label="Children">
            <span className="text-text-primary text-xs">{node.childCount ?? 0}</span>
          </MetaRow>
          <MetaRow label="Node ID">
            <span className="text-text-muted text-[10px] font-mono truncate max-w-[140px]" title={node.id}>{node.id}</span>
          </MetaRow>
        </div>
      </section>
    </div>
  );
}

/* ── Tasks tab ──────────────────────────────────────────────────────────────── */
function TasksTab({ nodeId, node }) {
  const { userProfile }  = useAuth();
  const isAdmin          = canEditRoadmapStructure(userProfile);

  const [tasks,       setTasks]       = useState([]);
  const [tasksLoading,setTasksLoading]= useState(true);
  const [allUsers,    setAllUsers]    = useState([]);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editTask,    setEditTask]    = useState(null); // null = create, obj = edit

  const unsubTasksRef = useRef(null);
  const unsubUsersRef = useRef(null);

  // Subscribe to tasks realtime
  useEffect(() => {
    if (!nodeId) return;
    setTasksLoading(true);
    unsubTasksRef.current = subscribeToRoadmapTasks(
      nodeId,
      (data) => { setTasks(data); setTasksLoading(false); },
      (err)  => { console.error('[TasksTab] subscribeToRoadmapTasks:', err); setTasksLoading(false); }
    );
    return () => { unsubTasksRef.current?.(); };
  }, [nodeId]);

  // Subscribe to users (for assignee display names)
  useEffect(() => {
    unsubUsersRef.current = subscribeToAllUsers(
      (users) => setAllUsers(users),
      (err)   => console.error('[TasksTab] subscribeToAllUsers:', err)
    );
    return () => { unsubUsersRef.current?.(); };
  }, []);

  const handleEdit = (task) => { setEditTask(task); setModalOpen(true); };
  const handleAdd  = ()     => { setEditTask(null); setModalOpen(true); };
  const handleClose = ()    => { setModalOpen(false); setEditTask(null); };

  // Task counts
  const total     = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Tasks tab header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
        <span className="text-xs text-text-muted">
          {total > 0 ? `${completed}/${total} completed` : 'No tasks yet'}
        </span>
        {isAdmin && (
          <button
            id="rm-tasks-add-btn"
            onClick={handleAdd}
            className="btn-primary h-7 text-xs"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tasksLoading ? (
          // Loading skeletons
          [1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surfaceHover rounded-xl animate-pulse" />
          ))
        ) : tasks.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-orange-muted border border-orange/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-text-secondary text-sm font-medium">No tasks yet</p>
              <p className="text-text-muted text-xs mt-1">
                {isAdmin ? 'Add the first task to this milestone.' : 'No tasks have been assigned to this node yet.'}
              </p>
            </div>
            {isAdmin && (
              <button onClick={handleAdd} className="btn-primary text-xs">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add First Task
              </button>
            )}
          </div>
        ) : (
          // Task cards
          tasks.map((task) => (
            <RoadmapTaskCard
              key={task.id}
              task={task}
              nodeId={nodeId}
              allUsers={allUsers}
              onEdit={handleEdit}
            />
          ))
        )}
      </div>

      {/* Progress summary bar (only when tasks exist) */}
      {total > 0 && (
        <div className="flex-shrink-0 px-4 py-2.5 border-t border-border">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wide">Task Progress</span>
            <span className="text-[10px] text-text-muted ml-auto">{Math.round((completed / total) * 100)}%</span>
          </div>
          <ProgressBar progress={Math.round((completed / total) * 100)} />
        </div>
      )}

      {/* Admin create/edit task modal */}
      <RoadmapTaskModal
        isOpen={modalOpen}
        onClose={handleClose}
        nodeId={nodeId}
        nodeName={node?.title ?? ''}
        task={editTask}
      />
    </div>
  );
}

/* ── Placeholder tab ────────────────────────────────────────────────────────── */
function PlaceholderTab({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 p-6 text-center">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-text-secondary font-semibold text-sm">{title}</p>
        <p className="text-text-muted text-xs mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ── Reusable meta row ──────────────────────────────────────────────────────── */
function MetaRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-text-muted flex-shrink-0 w-20">{label}</span>
      <div className="flex-1 min-w-0 text-right">{children}</div>
    </div>
  );
}

/* ── Panel header (also used for loading skeleton) ──────────────────────────── */
function PanelHeader({ onClose, loading }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
      {loading ? (
        <div className="h-4 w-32 bg-surfaceHover rounded animate-pulse" />
      ) : (
        <span className="text-xs text-text-muted font-semibold uppercase tracking-wide">Node Detail</span>
      )}
      <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg" aria-label="Close panel">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
