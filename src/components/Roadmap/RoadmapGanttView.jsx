import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRoadmapGantt } from '../../hooks/useRoadmapGantt';
import { formatDate } from '../../utils/dateHelpers';
import {
  DAY_WIDTH, GANTT_ZOOMS, computeRange, buildTimelineHeader,
  dayDiff, filterGanttRows, hideCollapsed, initials,
} from '../../utils/ganttHelpers';
import GanttExportMenu from './GanttExportMenu';

/**
 * RoadmapGanttView.jsx
 * Third roadmap view: the whole milestone tree on a timeline.
 *
 * Owns its data (useRoadmapGantt) so the all-nodes listener only runs while
 * this view is on screen. Clicks go through the same onSelect funnel as the
 * List and Journey views, so a root opens the side panel and a child opens
 * Task Details.
 *
 * Layout: one scroll box with a sticky header row and a sticky left column.
 * Every bar is positioned in days from range.start times the zoom's day width,
 * and the grid lines, weekend shading and today line share one absolutely
 * positioned layer behind the rows, so 48 rows do not render 48 copies of it.
 *
 * Root milestones carry no dates today; their bar spans their children
 * (row.derived) and is drawn dashed and thinner so nobody reads it as a
 * planned date.
 *
 * Props:
 *  - filters   { search, status, priority }  the page toolbar's filter state
 *  - onSelect  (node) => void                CompanyRoadmap.handleSelect
 */

const ROW_H     = 36;
const HEADER_H  = 44;
const ZOOM_STORAGE_KEY = 'roadmap-gantt-zoom';
const ZOOM_LABEL = { week: 'Week', month: 'Month', quarter: 'Quarter' };

// Same palette as RoadmapNodeCard's status border and dot, so List and Gantt
// read the same.
const BAR_THEME = {
  pending:       { track: 'bg-yellow-500/15 border-yellow-500/60', fill: 'bg-yellow-400/80', dot: 'bg-yellow-400' },
  'in-progress': { track: 'bg-blue-500/15 border-blue-500/60',     fill: 'bg-blue-400/80',   dot: 'bg-blue-400' },
  completed:     { track: 'bg-green-500/15 border-green-500/60',   fill: 'bg-green-400/80',  dot: 'bg-green-400' },
  blocked:       { track: 'bg-red-500/15 border-red-500/60',       fill: 'bg-red-400/80',    dot: 'bg-red-400' },
};
const themeFor = (status) => BAR_THEME[status] ?? BAR_THEME.pending;

const STATUS_LABEL = {
  pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed', blocked: 'Blocked',
};

const readStoredZoom = () => {
  try {
    const z = localStorage.getItem(ZOOM_STORAGE_KEY);
    return GANTT_ZOOMS.includes(z) ? z : 'week';
  } catch {
    return 'week';
  }
};

/** 'Search "pcb", status in-progress, 1 branch collapsed', or '' when none. */
const describeFilters = ({ search = '', status = 'all', priority = 'all' } = {}, collapsedCount = 0) =>
  [
    search.trim() && `search "${search.trim()}"`,
    status !== 'all' && `status ${status}`,
    priority !== 'all' && `priority ${priority}`,
    collapsedCount > 0 && `${collapsedCount} ${collapsedCount === 1 ? 'branch' : 'branches'} collapsed`,
  ].filter(Boolean).join(', ');


export default function RoadmapGanttView({ filters, onSelect }) {
  const { rows, userNames, today, loading, error } = useRoadmapGantt();
  const [zoom, setZoom]           = useState(readStoredZoom);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [tooltip, setTooltip]     = useState(null);   // { row, x, y }
  const scrollRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(ZOOM_STORAGE_KEY, zoom); } catch { /* private mode */ }
  }, [zoom]);

  const filtered = useMemo(() => filterGanttRows(rows, filters), [rows, filters]);
  const visible  = useMemo(() => hideCollapsed(filtered, collapsed), [filtered, collapsed]);

  const dayW   = DAY_WIDTH[zoom];
  const range  = useMemo(() => computeRange(filtered, zoom, today), [filtered, zoom, today]);
  const header = useMemo(() => buildTimelineHeader(range, zoom), [range, zoom]);
  const timelineW = range.days * dayW;
  const todayOffset = dayDiff(range.start, today);
  const hasDates = filtered.some((r) => r.start);

  const toggle = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Put today about a third of the way into the visible timeline, on first
  // render and whenever the zoom changes the scale.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    const left = el.querySelector('[data-gantt-left]')?.offsetWidth ?? 0;
    const viewport = el.clientWidth - left;
    el.scrollLeft = Math.max(0, todayOffset * dayW - viewport / 3);
  }, [zoom, loading, todayOffset, dayW]);

  const showTooltip = useCallback((row, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ row, x: rect.left + rect.width / 2, y: rect.top });
  }, []);
  const hideTooltip = useCallback(() => setTooltip(null), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <div className="w-6 h-6 border-2 border-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Loading timeline…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-red-400 text-sm font-medium">Failed to load the timeline</p>
        <p className="text-text-muted text-xs">{error?.message ?? 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="card p-0 flex flex-col h-full min-h-[320px] overflow-hidden">
      {/* ── Gantt toolbar: zoom, legend, export ─────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Zoom">
          {GANTT_ZOOMS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`px-2.5 h-6 rounded-md text-xs font-medium transition-colors ${
                zoom === z ? 'bg-surfaceHover text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>

        <Legend />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-text-muted text-xs hidden sm:inline">
            {visible.length} {visible.length === 1 ? 'row' : 'rows'}
          </span>
          <GanttExportMenu
            rows={visible}
            userNames={userNames}
            today={today}
            filterSummary={describeFilters(filters, collapsed.size)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyMessage text="No milestones match your filters." />
      ) : !hasDates ? (
        <EmptyMessage text="No dated milestones yet. Add a start or due date to a milestone to place it on the timeline." />
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative" onScroll={hideTooltip}>
          <div className="relative" style={{ width: 'max-content', minWidth: '100%' }}>

            {/* ── Header ──────────────────────────────────────────────── */}
            <div className="flex sticky top-0 z-20 bg-surface border-b border-border" style={{ height: HEADER_H }}>
              <div
                data-gantt-left
                className="sticky left-0 z-30 bg-surface border-r border-border flex items-end px-3 pb-1.5 gap-2 w-[150px] sm:w-[340px] flex-shrink-0 text-[10px] uppercase tracking-wide text-text-muted font-semibold"
              >
                <span className="w-7 flex-shrink-0">WBS</span>
                <span className="flex-1">Milestone</span>
                <span className="w-14 text-center hidden sm:block">Owner</span>
                <span className="w-9 text-right hidden sm:block">%</span>
              </div>
              <div className="relative flex-shrink-0" style={{ width: timelineW }}>
                {header.months.map((m) => (
                  <div
                    key={m.key}
                    className="absolute top-0 h-[22px] border-l border-border px-1.5 text-[11px] font-semibold text-text-secondary leading-[22px] truncate"
                    style={{ left: m.offset * dayW, width: m.days * dayW }}
                  >
                    {m.label}
                  </div>
                ))}
                {header.ticks.map((t) => (
                  <div
                    key={t.key}
                    className={`absolute top-[22px] h-[22px] border-l border-borderLight text-[10px] leading-[22px] text-center overflow-hidden ${
                      t.weekend ? 'text-text-muted/60' : 'text-text-muted'
                    } ${t.key === today ? 'text-orange font-semibold' : ''}`}
                    style={{ left: t.offset * dayW, width: t.days * dayW }}
                  >
                    {zoom === 'quarter' && t.days * dayW < 18 ? '' : t.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Body ────────────────────────────────────────────────── */}
            <div className="relative">
              {/* Grid layer: week lines, weekend shading, today line */}
              <div
                className="absolute top-0 bottom-0 left-[150px] sm:left-[340px] pointer-events-none"
                style={{ width: timelineW }}
                aria-hidden="true"
              >
                {zoom === 'week' && header.ticks.filter((t) => t.weekend).map((t) => (
                  <div key={t.key} className="absolute top-0 bottom-0 bg-white/[0.02]"
                    style={{ left: t.offset * dayW, width: dayW }} />
                ))}
                {(zoom === 'week' ? header.ticks.filter((t) => t.offset % 7 === 0) : header.ticks).map((t) => (
                  <div key={`l-${t.key}`} className="absolute top-0 bottom-0 border-l border-borderLight"
                    style={{ left: t.offset * dayW }} />
                ))}
                {todayOffset >= 0 && todayOffset < range.days && (
                  <div className="absolute top-0 bottom-0 w-px bg-orange z-10"
                    style={{ left: todayOffset * dayW + dayW / 2 }}>
                    <span className="absolute top-0 left-1 text-[9px] font-semibold text-orange bg-surface/90 px-1 rounded">
                      Today
                    </span>
                  </div>
                )}
              </div>

              {visible.map((row) => (
                <GanttRow
                  key={row.id}
                  row={row}
                  rangeStart={range.start}
                  dayW={dayW}
                  timelineW={timelineW}
                  userNames={userNames}
                  isCollapsed={collapsed.has(row.id)}
                  onToggle={toggle}
                  onSelect={onSelect}
                  onHover={showTooltip}
                  onLeave={hideTooltip}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {tooltip && <BarTooltip {...tooltip} userNames={userNames} />}
    </div>
  );
}

/* ── One row: sticky label cell + timeline cell ─────────────────────────── */
const GanttRow = memo(function GanttRow({
  row, rangeStart, dayW, timelineW, userNames, isCollapsed, onToggle, onSelect, onHover, onLeave,
}) {
  const theme  = themeFor(row.status);
  const isRoot = row.depth === 0;
  const names  = row.assignedTo.map((uid) => userNames.get(uid) || uid);

  let bar = null;
  if (row.start && row.end) {
    const left  = dayDiff(rangeStart, row.start) * dayW;
    const width = Math.max((dayDiff(row.start, row.end) + 1) * dayW, 4);
    const label = `${row.title}: ${formatDate(row.start)} to ${formatDate(row.end)}, ${row.progress}%`;
    const handlers = {
      onClick:      () => onSelect(row.node),
      onMouseEnter: (e) => onHover(row, e),
      onMouseLeave: onLeave,
      onFocus:      (e) => onHover(row, e),
      onBlur:       onLeave,
      'aria-label': label,
    };

    if (row.isMilestone) {
      bar = (
        <button
          {...handlers}
          className={`absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rotate-45 border ${theme.dot} ${
            row.overdue ? 'ring-2 ring-status-danger' : 'border-black/30'
          } focus:outline-none focus-visible:ring-2 focus-visible:ring-orange`}
          style={{ left: left + dayW / 2 }}
        />
      );
    } else if (row.derived) {
      bar = (
        <button
          {...handlers}
          className="absolute top-1/2 h-2.5 -mt-[5px] rounded-full border border-dashed border-orange/70 bg-orange/10 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          style={{ left, width }}
        >
          <span className="block h-full bg-orange/60" style={{ width: `${row.progress}%` }} />
        </button>
      );
    } else {
      bar = (
        <button
          {...handlers}
          className={`absolute top-1/2 h-5 -mt-2.5 rounded-md border overflow-hidden flex items-center ${theme.track} ${
            row.overdue ? 'ring-2 ring-status-danger' : ''
          } hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange`}
          style={{ left, width }}
        >
          <span className={`absolute inset-y-0 left-0 ${theme.fill}`} style={{ width: `${row.progress}%` }} />
          {width >= 44 && (
            <span className="relative px-1.5 text-[10px] font-semibold text-text-primary leading-none">
              {row.progress}%
            </span>
          )}
        </button>
      );
    }
  }

  return (
    <div className="flex border-b border-borderLight/60 hover:bg-surfaceHover/40 group" style={{ height: ROW_H }}>
      <div
        className={`sticky left-0 z-10 flex items-center gap-2 px-3 w-[150px] sm:w-[340px] flex-shrink-0 border-r border-border bg-surface group-hover:bg-surfaceHover ${
          isRoot ? 'font-semibold' : ''
        }`}
      >
        <span className="w-7 flex-shrink-0 text-[10px] text-text-muted font-mono hidden sm:block">{row.wbs}</span>
        <div className="flex items-center gap-1 min-w-0 flex-1" style={{ paddingLeft: Math.min(row.depth, 4) * 12 }}>
          {row.hasChildren ? (
            <button
              onClick={() => onToggle(row.id)}
              className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-text-muted hover:text-text-primary"
              aria-label={isCollapsed ? `Expand ${row.title}` : `Collapse ${row.title}`}
              aria-expanded={!isCollapsed}
            >
              <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <span className={`w-1.5 h-1.5 mx-[5px] rounded-full flex-shrink-0 ${theme.dot}`} />
          )}
          <button
            onClick={() => onSelect(row.node)}
            className={`truncate text-left text-xs hover:text-orange ${isRoot ? 'text-orange' : 'text-text-primary'}`}
            title={row.title}
          >
            {row.title}
          </button>
        </div>
        <div className="w-14 hidden sm:flex justify-center -space-x-1.5 flex-shrink-0" title={names.join(', ')}>
          {names.slice(0, 2).map((n, i) => (
            <span key={i} className="w-5 h-5 rounded-full bg-orange/20 border border-surface text-orange text-[8px] font-bold flex items-center justify-center">
              {initials(n)}
            </span>
          ))}
          {names.length > 2 && (
            <span className="w-5 h-5 rounded-full bg-surfaceHover border border-surface text-text-secondary text-[8px] flex items-center justify-center">
              +{names.length - 2}
            </span>
          )}
        </div>
        <span className="w-9 text-right text-[11px] text-text-secondary hidden sm:block flex-shrink-0">{row.progress}%</span>
      </div>

      <div className="relative flex-shrink-0" style={{ width: timelineW }}>
        {bar ?? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted italic">No dates</span>
        )}
      </div>
    </div>
  );
});

/* ── Hover card for a bar ───────────────────────────────────────────────── */
function BarTooltip({ row, x, y, userNames }) {
  const names = row.assignedTo.map((uid) => userNames.get(uid) || uid);
  // Flip below the bar when it is near the top of the window.
  const below = y < 170;
  return (
    <div
      className="fixed z-50 w-64 pointer-events-none rounded-lg border border-border bg-surface shadow-xl p-3 text-xs animate-fade-in"
      style={{ left: Math.min(Math.max(x, 140), window.innerWidth - 140), top: below ? y + 28 : y - 8, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
      role="tooltip"
    >
      <p className="font-semibold text-text-primary mb-1.5 leading-snug">{row.title}</p>
      <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 text-text-secondary">
        <dt className="text-text-muted">Start</dt><dd>{formatDate(row.start)}</dd>
        <dt className="text-text-muted">Due</dt><dd>{formatDate(row.end)}</dd>
        <dt className="text-text-muted">Status</dt><dd>{STATUS_LABEL[row.status] ?? row.status}</dd>
        <dt className="text-text-muted">Progress</dt><dd>{row.progress}%</dd>
        <dt className="text-text-muted">Assigned</dt><dd>{names.length ? names.join(', ') : 'Nobody'}</dd>
      </dl>
      {row.overdue && <p className="mt-1.5 text-red-400 font-medium">Overdue by {row.daysOverdue} {row.daysOverdue === 1 ? 'day' : 'days'}</p>}
      {row.derived && <p className="mt-1.5 text-text-muted">Dates taken from the milestones under it.</p>}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden md:flex items-center gap-3 text-[11px] text-text-muted">
      {Object.entries(STATUS_LABEL).map(([key, label]) => (
        <span key={key} className="flex items-center gap-1">
          <span className={`w-2.5 h-2.5 rounded-sm ${BAR_THEME[key].dot}`} />{label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="w-2.5 h-2.5 rounded-sm ring-2 ring-status-danger" />Overdue
      </span>
      <span className="flex items-center gap-1">
        <span className="w-4 h-2 rounded-full border border-dashed border-orange/70" />From children
      </span>
    </div>
  );
}

function EmptyMessage({ text }) {
  return (
    <div className="flex items-center justify-center py-16 px-6">
      <p className="text-text-muted text-sm text-center max-w-sm">{text}</p>
    </div>
  );
}
