import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToNodeHistory, getNodeHistoryPage } from '../../services/roadmapHistoryService';
import { timeFromNow, formatDateTime } from '../../utils/dateHelpers';

/**
 * RoadmapHistoryLog.jsx — Phase 17
 * Paginated audit history viewer for roadmapNodes/{nodeId}/history subcollection.
 *
 * Behaviour:
 *  - Real-time subscription for the first 20 entries (newest-first).
 *  - "Load more" button fetches subsequent pages (non-realtime, one-time read).
 *  - Displays action icon, entity type badge, changed fields diff, changedBy, timestamp.
 *  - History is read-only — all writes happen via Cloud Functions (Admin SDK).
 *
 * Props:
 *  - nodeId {string} Parent roadmap node ID
 */
export default function RoadmapHistoryLog({ nodeId }) {
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc,   setLastDoc]   = useState(null);
  const [hasMore,   setHasMore]   = useState(false);
  const [error,     setError]     = useState('');

  const unsubRef = useRef(null);
  // Track IDs already shown so real-time updates don't duplicate "load more" entries
  const realtimeIds = useRef(new Set());

  // ── Initial real-time subscription ──────────────────────────────────────────
  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    setEntries([]);
    setLastDoc(null);
    setHasMore(false);
    realtimeIds.current = new Set();

    unsubRef.current = subscribeToNodeHistory(
      nodeId,
      (data) => {
        setEntries(data);
        realtimeIds.current = new Set(data.map((e) => e.id));
        // After first data arrive, we don't know hasMore from subscription alone —
        // set hasMore=true optimistically only when page is "full"
        setHasMore(data.length >= 20);
        setLoading(false);
      },
      (err) => {
        console.error('[RoadmapHistoryLog] subscribe error:', err);
        setError('Failed to load history.');
        setLoading(false);
      },
      20,
    );

    return () => { unsubRef.current?.(); };
  }, [nodeId]);

  // ── Load more (one-time paginated fetch) ─────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nodeId || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getNodeHistoryPage(nodeId, lastDoc, 20);
      // Filter out any IDs already shown by the real-time subscription
      const newEntries = result.entries.filter((e) => !realtimeIds.current.has(e.id));
      setEntries((prev) => [...prev, ...newEntries]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('[RoadmapHistoryLog] loadMore error:', err);
      setError('Failed to load more history.');
    } finally {
      setLoadingMore(false);
    }
  }, [nodeId, lastDoc, loadingMore]);

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-7 h-7 rounded-full bg-surfaceHover flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-surfaceHover rounded w-2/3" />
              <div className="h-3 bg-surfaceHover rounded w-1/2" />
              <div className="h-8 bg-surfaceHover rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 p-6 text-center">
        <span className="text-2xl">⚠️</span>
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); }}
          className="btn-secondary text-xs"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-surfaceHover border border-border flex items-center justify-center">
          <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <div>
          <p className="text-text-secondary font-semibold text-sm">No history yet</p>
          <p className="text-text-muted text-xs mt-1 leading-relaxed">
            Changes to this node and its tasks will appear here.
          </p>
        </div>
      </div>
    );
  }

  // ── History list ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <ol className="relative border-l border-border ml-3 space-y-1">
          {entries.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} />
          ))}
        </ol>

        {/* Load more */}
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              id="rm-history-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="btn-secondary text-xs px-4"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-orange/40 border-t-orange rounded-full animate-spin" />
                  Loading…
                </span>
              ) : 'Load more'}
            </button>
          </div>
        )}

        {/* End of log */}
        {!hasMore && entries.length > 0 && (
          <p className="text-center text-text-muted text-[10px] mt-4">
            — End of audit log —
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Single history entry ────────────────────────────────────────────────────── */
function HistoryEntry({ entry }) {
  const [showAbsTime, setShowAbsTime] = useState(false);

  const { icon, color, label } = getActionMeta(entry.action);
  const changedFields      = entry.changedFields      ?? [];
  const systemChangedFields = entry.systemChangedFields ?? [];
  const isTaskEntry        = entry.entityType === 'task';

  return (
    <li className="mb-5 ml-4">
      {/* Timeline dot */}
      <span
        className={`absolute -left-[9px] flex items-center justify-center w-[18px] h-[18px] rounded-full border ${color.dot} mt-0.5`}
        aria-hidden="true"
      >
        <span className="text-[9px]">{icon}</span>
      </span>

      {/* Card */}
      <div className="ml-2 bg-surfaceHover/60 border border-border rounded-xl p-3 space-y-2">

        {/* Header row */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Entity badge */}
            {isTaskEntry && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold
                bg-blue-500/10 text-blue-400 border border-blue-500/20">
                TASK
              </span>
            )}
            {/* Action label */}
            <span className={`text-xs font-semibold ${color.text}`}>{label}</span>
            {/* Subject title */}
            {(entry.taskTitle || entry.nodeTitle) && (
              <span className="text-xs text-text-muted truncate max-w-[130px]" title={entry.taskTitle || entry.nodeTitle}>
                — {entry.taskTitle || entry.nodeTitle}
              </span>
            )}
          </div>

          {/* Timestamp */}
          <button
            className="text-[10px] text-text-muted hover:text-text-secondary transition-colors flex-shrink-0 text-right"
            onClick={() => setShowAbsTime((v) => !v)}
            title={showAbsTime ? 'Show relative time' : 'Show exact time'}
          >
            {showAbsTime
              ? formatDateTime(entry.timestamp)
              : timeFromNow(entry.timestamp)}
          </button>
        </div>

        {/* Changed by */}
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-orange/20 text-orange text-[9px]
            flex items-center justify-center font-bold flex-shrink-0">
            {entry.changedBy === 'system'
              ? '⚙'
              : (entry.changedBy ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="text-[10px] text-text-muted truncate">
            {entry.changedBy === 'system' ? 'System (Cloud Function)' : entry.changedBy}
          </span>
        </div>

        {/* Field diffs (non-system) */}
        {changedFields.length > 0 && (
          <div className="space-y-1.5">
            {changedFields.map((cf, idx) => (
              <FieldDiff key={idx} cf={cf} />
            ))}
          </div>
        )}

        {/* System/rollup field changes */}
        {systemChangedFields.length > 0 && (
          <div className="space-y-1">
            {systemChangedFields.map((sf, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span className="font-mono text-text-muted/60">{humanFieldName(sf.field)}</span>
                <span>→</span>
                <span className="text-text-secondary font-medium">{sf.newValue || '—'}</span>
                <span className="ml-auto italic text-text-muted/50">system</span>
              </div>
            ))}
          </div>
        )}

        {/* Creation/deletion with no individual field diffs */}
        {changedFields.length === 0 && systemChangedFields.length === 0 &&
          (entry.action === 'created' || entry.action === 'deleted' ||
           entry.action === 'task_created' || entry.action === 'task_deleted') && (
          <p className="text-[10px] text-text-muted italic">
            {entry.action.includes('deleted') ? 'Node/task removed.' : 'Node/task created.'}
          </p>
        )}
      </div>
    </li>
  );
}

/* ── Field diff row ─────────────────────────────────────────────────────────── */
function FieldDiff({ cf }) {
  const hasPrev = cf.previousValue !== '' && cf.previousValue !== null && cf.previousValue !== undefined;
  return (
    <div className="rounded-lg bg-surface border border-border/50 px-2.5 py-2 text-[10px] space-y-1">
      <span className="font-semibold text-text-secondary tracking-wide uppercase">
        {humanFieldName(cf.field)}
      </span>
      <div className="space-y-0.5">
        {hasPrev && (
          <div className="flex items-start gap-1.5">
            <span className="text-red-400/70 font-mono flex-shrink-0">−</span>
            <span className="text-red-400/80 line-through break-all">{cf.previousValue || '—'}</span>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <span className="text-green-400/70 font-mono flex-shrink-0">+</span>
          <span className="text-green-400 break-all">{cf.newValue || '—'}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function getActionMeta(action) {
  switch (action) {
    case 'created':
      return { icon: '✦', color: { dot: 'bg-green-500/20 border-green-500/40', text: 'text-green-400' }, label: 'Node created' };
    case 'updated':
      return { icon: '✎', color: { dot: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-400' }, label: 'Node updated' };
    case 'archived':
      return { icon: '⊘', color: { dot: 'bg-yellow-500/20 border-yellow-500/40', text: 'text-yellow-400' }, label: 'Node archived' };
    case 'deleted':
      return { icon: '✕', color: { dot: 'bg-red-500/20 border-red-500/40', text: 'text-red-400' }, label: 'Node deleted' };
    case 'task_created':
      return { icon: '✦', color: { dot: 'bg-green-500/20 border-green-500/40', text: 'text-green-400' }, label: 'Task created' };
    case 'task_updated':
      return { icon: '✎', color: { dot: 'bg-blue-500/20 border-blue-500/40', text: 'text-blue-400' }, label: 'Task updated' };
    case 'task_deleted':
      return { icon: '✕', color: { dot: 'bg-red-500/20 border-red-500/40', text: 'text-red-400' }, label: 'Task deleted' };
    default:
      return { icon: '●', color: { dot: 'bg-border border-borderLight', text: 'text-text-muted' }, label: action };
  }
}

function humanFieldName(field) {
  const MAP = {
    title:               'Title',
    description:         'Description',
    status:              'Status',
    priority:            'Priority',
    startDate:           'Start Date',
    dueDate:             'Due Date',
    assignedTo:          'Assignees',
    tags:                'Tags',
    dependencies:        'Dependencies',
    order:               'Order',
    isArchived:          'Archived',
    progress:            'Progress',
    childCount:          'Child Count',
    childCompletedCount: 'Completed Children',
    completionNote:      'Completion Note',
  };
  return MAP[field] ?? field;
}
