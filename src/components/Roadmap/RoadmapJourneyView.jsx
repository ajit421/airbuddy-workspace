import { useEffect, useMemo, useState } from 'react';
import { formatDate, getDueDateColor, getDueDateLabel } from '../../utils/dateHelpers';
import { subscribeToChildren } from '../../services/roadmapService';

/**
 * RoadmapJourneyView.jsx
 * Gamified "level map" view of the roadmap milestones — a
 * Duolingo/Candy-Crush style winding path with level nodes, an XP bar,
 * and a "you are here" marker. Alternate to RoadmapTree's list view.
 *
 * Starts at the root-level milestones (matches the "N milestones" framing
 * in the page header). A milestone with sub-quests can be drilled into —
 * clicking "Explore N sub-quests" swaps the path to that node's children,
 * with a breadcrumb bar to navigate back out.
 *
 * Props:
 *  - nodes       {array}    Root-level milestone nodes (already filtered)
 *  - selectedId  {string}   Currently selected node id
 *  - onSelect    {function} (node) => void — open detail panel
 *  - onEdit      {function} (node) => void — admin edit
 *  - onDelete    {function} (node) => void — admin archive
 *  - canEdit     {boolean}
 */

const ROW_HEIGHT = 168;   // px per level, drives both layout + SVG path scale
const X_CYCLE    = [22, 50, 78, 50]; // percent positions the path winds through

const PRIORITY_STARS = { critical: 3, high: 2, medium: 1, low: 1 };

const STATUS_THEME = {
  completed: {
    ring:   'from-status-success to-emerald-400',
    glow:   'shadow-[0_0_28px_rgba(34,197,94,0.45)]',
    border: 'border-status-success',
    text:   'text-status-success',
  },
  'in-progress': {
    ring:   'from-orange to-orange-hover',
    glow:   'shadow-glow',
    border: 'border-orange',
    text:   'text-orange',
  },
  blocked: {
    ring:   'from-status-danger to-red-400',
    glow:   'shadow-[0_0_28px_rgba(239,68,68,0.4)]',
    border: 'border-status-danger',
    text:   'text-status-danger',
  },
  pending: {
    ring:   'from-border to-borderLight',
    glow:   '',
    border: 'border-border',
    text:   'text-text-muted',
  },
};

function xFor(index) {
  return X_CYCLE[index % X_CYCLE.length];
}

/** Smooth vertical S-curve through node centers, scaled to fill the container. */
function buildPathD(count) {
  if (count < 2) return '';
  const pts = Array.from({ length: count }, (_, i) => ({
    x: xFor(i),
    y: i * ROW_HEIGHT + ROW_HEIGHT / 2,
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur  = pts[i];
    const midY = (prev.y + cur.y) / 2;
    d += ` C ${prev.x} ${midY}, ${cur.x} ${midY}, ${cur.x} ${cur.y}`;
  }
  return d;
}

export default function RoadmapJourneyView({
  nodes = [],
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  canEdit = false,
}) {
  // Drill-down stack: [] = showing root milestones (the `nodes` prop).
  // Each entry {id, title} represents one level of "entered" a milestone's
  // own sub-quests. The last entry's children are subscribed to live.
  const [drillStack, setDrillStack] = useState([]);
  const [drillChildren, setDrillChildren] = useState(null); // null = loading
  const currentParent = drillStack[drillStack.length - 1] ?? null;

  useEffect(() => {
    if (!currentParent) {
      setDrillChildren(null);
      return;
    }
    setDrillChildren(null); // show loading state while switching levels
    const unsub = subscribeToChildren(
      currentParent.id,
      (children) => setDrillChildren(children),
      () => setDrillChildren([])
    );
    return unsub;
  }, [currentParent?.id]);

  const activeNodes = currentParent ? (drillChildren ?? []) : nodes;

  const handleDrillIn  = (node) => setDrillStack((s) => [...s, { id: node.id, title: node.title }]);
  const handleDrillTo  = (index) => setDrillStack((s) => s.slice(0, index + 1));
  const handleDrillOut = () => setDrillStack((s) => s.slice(0, -1));

  const stats = useMemo(() => {
    const total     = activeNodes.length;
    const completed = activeNodes.filter((n) => n.status === 'completed').length;
    const avgProgress = total
      ? Math.round(activeNodes.reduce((sum, n) => sum + (n.progress ?? 0), 0) / total)
      : 0;
    const stars = activeNodes.reduce(
      (sum, n) => sum + (n.status === 'completed' ? (PRIORITY_STARS[n.priority] ?? 1) : 0),
      0
    );
    const currentIndex = activeNodes.findIndex((n) => n.status === 'in-progress');
    return { total, completed, avgProgress, stars, currentIndex };
  }, [activeNodes]);

  const pathD = useMemo(() => buildPathD(activeNodes.length), [activeNodes.length]);
  const containerHeight = Math.max(activeNodes.length, 1) * ROW_HEIGHT + 96;

  if (nodes.length === 0) return null;

  return (
    <div className="animate-fade-in">
      {/* ── Breadcrumb (only shown once drilled into a milestone) ──────────── */}
      {drillStack.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setDrillStack([])}
            className="text-text-secondary hover:text-orange font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Journey
          </button>
          {drillStack.map((entry, i) => (
            <span key={entry.id} className="flex items-center gap-1.5">
              <span className="text-text-muted">/</span>
              <button
                onClick={() => handleDrillTo(i)}
                className={`font-medium hover:text-orange ${i === drillStack.length - 1 ? 'text-orange' : 'text-text-secondary'}`}
              >
                {entry.title}
              </button>
            </span>
          ))}
        </div>
      )}

      {activeNodes.length === 0 && currentParent ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-text-secondary text-sm font-medium">
            {drillChildren === null ? 'Loading sub-quests…' : `No sub-quests under "${currentParent.title}" yet`}
          </p>
          <button onClick={handleDrillOut} className="text-orange text-xs hover:underline">
            ← Back
          </button>
        </div>
      ) : (
      <>
      {/* ── XP / stats header ─────────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-orange to-orange-hover flex items-center justify-center shadow-glow flex-shrink-0">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-text-primary font-bold text-sm sm:text-base">
                Level {stats.completed} of {stats.total}
              </p>
              <p className="text-text-muted text-xs">{stats.avgProgress}% overall progress</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0" title={`${stats.stars} stars earned`}>
            {Array.from({ length: Math.min(stats.stars, 5) }).map((_, i) => (
              <svg key={i} className="w-5 h-5 text-orange" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.196-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.062 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z" />
              </svg>
            ))}
            {stats.stars > 5 && <span className="text-xs text-text-muted font-semibold">+{stats.stars - 5}</span>}
            {stats.stars === 0 && <span className="text-xs text-text-muted">No stars yet — complete a milestone!</span>}
          </div>
        </div>

        {/* XP bar */}
        <div className="mt-4">
          <div className="h-2.5 w-full rounded-full bg-background overflow-hidden border border-borderLight">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange to-orange-hover transition-all duration-500"
              style={{ width: `${stats.avgProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Winding path ─────────────────────────────────────────────────── */}
      <div className="relative mx-auto max-w-2xl" style={{ height: containerHeight }}>

        {/* Start flag */}
        <div
          className="absolute flex flex-col items-center gap-1 text-text-muted"
          style={{ left: `${xFor(0)}%`, top: 8, transform: 'translate(-50%, 0)' }}
        >
          <span className="text-[10px] uppercase tracking-wider font-semibold">Start</span>
        </div>

        {/* Decorative connecting path */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 100 ${activeNodes.length * ROW_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ top: 48 }}
        >
          <path
            d={pathD}
            fill="none"
            stroke="#30363D"
            strokeWidth="1.2"
            strokeDasharray="1.5 2.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Level nodes */}
        {activeNodes.map((node, i) => (
          <JourneyNode
            key={node.id}
            node={node}
            index={i}
            x={xFor(i)}
            top={i * ROW_HEIGHT + 48}
            isCurrent={i === stats.currentIndex}
            isSelected={selectedId === node.id}
            onSelect={onSelect}
            onDrillIn={handleDrillIn}
            onEdit={onEdit}
            onDelete={onDelete}
            canEdit={canEdit}
          />
        ))}

        {/* Finish trophy */}
        <div
          className="absolute flex flex-col items-center gap-1"
          style={{ left: `${xFor(activeNodes.length)}%`, top: activeNodes.length * ROW_HEIGHT + 56, transform: 'translate(-50%, 0)' }}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
            stats.completed === stats.total && stats.total > 0
              ? 'bg-gradient-to-br from-orange to-orange-hover border-orange shadow-glow'
              : 'bg-surface border-border'
          }`}>
            <svg className={`w-6 h-6 ${stats.completed === stats.total && stats.total > 0 ? 'text-white' : 'text-text-muted'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 4.5v15m6-15v15M4.5 9h15M4.5 15h15" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 3h8a1 1 0 011 1v2a5 5 0 01-5 5 5 5 0 01-5-5V4a1 1 0 011-1z" />
            </svg>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Finish</span>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/* ── Single level node ────────────────────────────────────────────────────── */
function JourneyNode({ node, index, x, top, isCurrent, isSelected, onSelect, onDrillIn, onEdit, onDelete, canEdit }) {
  const theme       = STATUS_THEME[node.status] ?? STATUS_THEME.pending;
  const isPending    = node.status === 'pending';
  const hasChildren  = (node.childCount ?? 0) > 0;
  const stars        = PRIORITY_STARS[node.priority] ?? 1;
  const dueDateColor = getDueDateColor(node.dueDate, node.status);
  const dueDateLabel = getDueDateLabel(node.dueDate, node.status);

  return (
    <div
      className="absolute flex flex-col items-center gap-2 group"
      style={{ left: `${x}%`, top, transform: 'translate(-50%, 0)', width: 200 }}
    >
      {isCurrent && (
        <span className="mb-1 px-2 py-0.5 rounded-full bg-orange text-white text-[10px] font-bold uppercase tracking-wide animate-pulse-slow">
          You are here
        </span>
      )}

      {/* Level circle */}
      <button
        onClick={() => onSelect && onSelect(node)}
        className={`
          relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full flex items-center justify-center
          bg-gradient-to-br ${theme.ring} border-[3px] ${isSelected ? 'border-white/70' : theme.border}
          ${theme.glow} transition-transform duration-200 hover:scale-105
          ${isCurrent ? 'scale-110' : ''} ${isPending ? 'opacity-70' : ''}
        `}
        title={node.title}
      >
        {node.status === 'completed' ? (
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : node.status === 'blocked' ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.75-2.97l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" />
          </svg>
        ) : node.status === 'in-progress' ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5 3l14 9-14 9V3z" />
          </svg>
        ) : (
          <span className="text-white font-bold text-lg">{index + 1}</span>
        )}

        {/* Progress ring */}
        <svg className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] -rotate-90 pointer-events-none">
          <circle cx="50%" cy="50%" r="46%" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
          <circle
            cx="50%" cy="50%" r="46%" fill="none" stroke="white" strokeWidth="3"
            strokeDasharray={`${(node.progress ?? 0) * 2.9} 1000`}
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      </button>

      {/* Priority stars */}
      <div className="flex items-center gap-0.5 -mt-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <svg key={i} className={`w-2.5 h-2.5 ${i < stars ? 'text-orange' : 'text-border'}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.287 3.957c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.176 0l-3.367 2.446c-.784.57-1.838-.196-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.062 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.286-3.958z" />
          </svg>
        ))}
      </div>

      {/* Label card */}
      <div className={`
        relative w-full rounded-xl border px-3 py-2 text-center transition-colors
        ${isSelected ? 'border-orange bg-orange-muted' : 'border-border bg-surface group-hover:border-orange/40'}
      `}>
        <button onClick={() => onSelect && onSelect(node)} className="w-full">
          <p className="text-text-primary text-xs font-semibold leading-snug line-clamp-2">{node.title}</p>
          {node.dueDate && (
            <p className={`text-[10px] mt-0.5 ${dueDateColor}`}>
              {formatDate(node.dueDate)}{dueDateLabel ? ` · ${dueDateLabel}` : ''}
            </p>
          )}
        </button>
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); onDrillIn && onDrillIn(node); }}
            className="mt-1 w-full flex items-center justify-center gap-1 text-[10px] text-orange hover:text-orange-hover font-medium"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Explore {node.childCount} sub-quest{node.childCount === 1 ? '' : 's'}
          </button>
        )}

        {canEdit && (
          <div className="absolute -top-2 -right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit && onEdit(node); }}
              className="w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center hover:text-orange"
              title="Edit"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete && onDelete(node); }}
              className={`w-5 h-5 rounded-full bg-surface border border-border flex items-center justify-center ${hasChildren ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-400'}`}
              title={hasChildren ? 'Cannot archive: node has children' : 'Archive node'}
              disabled={hasChildren}
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8M10 12v4M14 12v4" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
