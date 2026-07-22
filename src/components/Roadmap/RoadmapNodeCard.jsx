import { memo } from 'react';
import { PriorityBadge, StatusBadge, ProgressBar } from '../shared/TaskCard';
import { formatDate, getDueDateColor, getDueDateLabel } from '../../utils/dateHelpers';

/**
 * RoadmapNodeCard.jsx
 * Single roadmap node card — the visual building block of the tree.
 * Reuses PriorityBadge, StatusBadge, ProgressBar from shared/TaskCard.jsx.
 *
 * Phase 19 — Performance:
 *  Wrapped in React.memo with a custom areEqual comparator.
 *  Why custom? — The `node` prop is a Firestore document object. Even when
 *  data is unchanged, a new snapshot creates a new object reference, so the
 *  default shallow-equal would always return false and re-render every card.
 *  The custom comparator checks only the fields that affect rendered output,
 *  so cards only re-render when their actual data changes.
 *
 *  onToggle / onSelect / onEdit / onDelete are useCallback-stable (Phase 19
 *  Step 1 made toggleExpand stable; handlers in CompanyRoadmap are already
 *  wrapped in useCallback), so they are excluded from the comparator.
 *
 * Props:
 *  - node          {object}   Full roadmap node data from Firestore
 *  - depth         {number}   Nesting depth (0 = root)
 *  - isExpanded    {boolean}  Whether this node's children are shown
 *  - onToggle      {function} Called when user clicks the expand/collapse chevron
 *  - onSelect      {function} Called when user clicks the card body
 *  - isSelected    {boolean}  Whether this node is the currently selected one
 *  - onEdit        {function} Admin: open edit modal
 *  - onDelete      {function} Admin: archive node
 *  - canEdit       {boolean}  Whether the current user can edit roadmap structure
 */

const STATUS_BORDER = {
  pending:       'border-yellow-500/60',
  'in-progress': 'border-blue-500/60',
  completed:     'border-green-500/60',
  blocked:       'border-red-500/60',
  archived:      'border-text-muted/40',
};

const STATUS_DOT = {
  pending:       'bg-yellow-400',
  'in-progress': 'bg-blue-400',
  completed:     'bg-green-400',
  blocked:       'bg-red-400',
  archived:      'bg-text-muted',
};

function RoadmapNodeCard({
  node,
  depth = 0,
  isExpanded = false,
  onToggle,
  onSelect,
  isSelected = false,
  onEdit,
  onDelete,
  canEdit = false,
}) {
  if (!node) return null;

  const hasChildren  = (node.childCount ?? 0) > 0 || (node.childCompletedCount ?? 0) > 0;
  const borderColor  = STATUS_BORDER[node.status] ?? 'border-border';
  const dotColor     = STATUS_DOT[node.status]    ?? 'bg-text-muted';
  const dueDateColor = getDueDateColor(node.dueDate, node.status);
  const dueDateLabel = getDueDateLabel(node.dueDate, node.status);
  const isRoot       = depth === 0;

  return (
    <div
      className={`
        group relative flex items-stretch gap-0 rounded-xl border transition-all duration-200 animate-fade-in
        ${isSelected
          ? 'border-orange bg-orange-muted shadow-glow'
          : 'border-border bg-surface hover:border-orange/40 hover:bg-surfaceHover hover:shadow-card'}
      `}
    >
      {/* Left status border accent */}
      <div className={`w-1 flex-shrink-0 rounded-l-xl ${borderColor} border-l-4 border-y-0 border-r-0`} />

      {/* Main card content */}
      <div className="flex-1 flex flex-col gap-2.5 px-3 py-3 min-w-0">

        {/* Header row */}
        <div className="flex items-start gap-2">

          {/* Expand / collapse chevron */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggle && onToggle(node.id); }}
            className={`
              flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center rounded
              transition-all duration-200
              ${hasChildren
                ? 'text-text-secondary hover:text-orange hover:bg-orange-muted cursor-pointer'
                : 'text-transparent cursor-default pointer-events-none'}
            `}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand children') : ''}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-0'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Status dot */}
          <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${dotColor}`} />

          {/* Title */}
          <button
            onClick={() => onSelect && onSelect(node)}
            className="flex-1 text-left min-w-0"
          >
            <h3 className={`
              font-semibold text-sm leading-snug line-clamp-2 transition-colors
              ${isSelected ? 'text-orange' : 'text-text-primary group-hover:text-orange'}
            `}>
              {node.title}
            </h3>
            {node.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {node.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="badge bg-surface border border-borderLight text-text-muted text-[10px] px-1.5 py-0">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>

          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <PriorityBadge priority={node.priority} />
            <StatusBadge   status={node.status} />
          </div>

          {/* Admin action buttons */}
          {canEdit && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(node); }}
                className="btn-ghost p-1 rounded-md"
                title="Edit node"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete && onDelete(node); }}
                className={`btn-ghost p-1 rounded-md ${(node.childCount ?? 0) > 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-red-400'}`}
                title={(node.childCount ?? 0) > 0 ? 'Cannot archive: node has children' : 'Archive node'}
                disabled={(node.childCount ?? 0) > 0}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8M10 12v4M14 12v4" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Progress + due date row */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar progress={node.progress} />
          </div>
          <span className="text-xs text-text-muted font-medium flex-shrink-0 w-8 text-right">
            {node.progress ?? 0}%
          </span>
        </div>

        {/* Footer: due date + child count */}
        <div className="flex items-center justify-between text-xs">
          <span className={`${dueDateColor} font-medium`}>
            {node.dueDate ? formatDate(node.dueDate) : ''}
            {dueDateLabel && node.dueDate && (
              <span className="ml-1.5 text-text-muted font-normal">({dueDateLabel})</span>
            )}
          </span>
          {hasChildren && (
            <span className="text-text-muted flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 7h18M3 12h18M3 17h18" />
              </svg>
              {node.childCompletedCount ?? 0}/{node.childCount ?? 0} done
            </span>
          )}
          {isRoot && (
            <span className="text-text-muted text-[10px] uppercase tracking-wide font-medium">
              depth 0
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 19 — Custom memo comparator.
 * Returns true (skip re-render) when all visible-output fields are equal.
 * Function props (onToggle, onSelect, onEdit, onDelete) are excluded because
 * they are stable references (useCallback with empty/stable deps).
 */
function areNodePropsEqual(prev, next) {
  // Fast path: same node reference (shouldn't happen with Firestore but cheap check)
  if (prev.node === next.node &&
      prev.isSelected  === next.isSelected  &&
      prev.isExpanded  === next.isExpanded  &&
      prev.canEdit     === next.canEdit) return true;

  return (
    prev.isSelected               === next.isSelected               &&
    prev.isExpanded               === next.isExpanded               &&
    prev.canEdit                  === next.canEdit                  &&
    prev.depth                    === next.depth                    &&
    prev.node?.id                 === next.node?.id                 &&
    prev.node?.title              === next.node?.title              &&
    prev.node?.status             === next.node?.status             &&
    prev.node?.priority           === next.node?.priority           &&
    prev.node?.progress           === next.node?.progress           &&
    prev.node?.dueDate            === next.node?.dueDate            &&
    prev.node?.childCount         === next.node?.childCount         &&
    prev.node?.childCompletedCount=== next.node?.childCompletedCount&&
    (prev.node?.tags?.join('|') ?? '') === (next.node?.tags?.join('|') ?? '')
  );
}

export default memo(RoadmapNodeCard, areNodePropsEqual);
