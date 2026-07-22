import { useState, memo } from 'react';
import RoadmapNodeCard from './RoadmapNodeCard';

/**
 * RoadmapTree.jsx
 * Recursive expand/collapse tree renderer.
 *
 * Props:
 *  - nodes        {Array}    Nodes to render at this level
 *  - depth        {number}   Current depth level (0 = root)
 *  - treeState    {object}   { isExpanded, childrenMap, loadingIds, toggleExpand }
 *  - selectedId   {string}   Currently selected node ID
 *  - onSelect     {function} Called with node when user clicks a card body
 *  - onEdit       {function} Called with node when admin clicks edit
 *  - onDelete     {function} Called with node when admin clicks archive
 *  - canEdit      {boolean}  Whether the current user can edit roadmap structure
 *
 * Phase 18 — Responsive:
 *  Mobile indent cap: stop adding marginLeft beyond depth 2 on mobile to prevent
 *  cards being crushed below ~150px on 380px viewports.
 *
 * Phase 19 — Performance (virtualization shim):
 *  react-window requires fixed row heights and doesn't compose with our
 *  variable-height recursive tree. Instead we use an incremental "show more"
 *  shim that limits the initial DOM to RENDER_LIMIT nodes per level.
 *
 *  Thresholds:
 *   - Depth 0 (root): render first 50, "Show N more" reveals the rest in
 *     batches of 50. This prevents 200+ root-level DOM nodes.
 *   - Depth > 0 (children): limit 30 per expanded parent.
 *
 *  Why not react-window?
 *   react-window expects a flat list of fixed heights. Our tree is recursive
 *   and each card has variable height (tags, description, badges). Forcing
 *   fixed heights would require a full architectural rewrite to a flattened
 *   array with inline indentation — a separate future phase if needed.
 */

// Render limits per depth level (nodes shown before "Show more" appears)
const RENDER_LIMIT_ROOT     = 50;  // depth === 0
const RENDER_LIMIT_CHILDREN = 30;  // depth > 0
const PAGE_SIZE             = 50;  // how many more to reveal per click

/**
 * RoadmapTree — memoized to avoid re-rendering unchanged branches.
 * React.memo here checks the nodes array reference and treeState reference.
 * Because childrenMap is replaced with new Map() on every update, branches
 * whose children didn't change still get a new treeState ref. The real
 * protection against unnecessary DOM work is RoadmapNodeCard's own memo.
 */
function RoadmapTree({
  nodes = [],
  depth = 0,
  treeState,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  canEdit = false,
}) {
  const { isExpanded, childrenMap, loadingIds = new Set(), toggleExpand } = treeState ?? {};

  // Phase 19: track how many nodes are revealed at this level
  const limit = depth === 0 ? RENDER_LIMIT_ROOT : RENDER_LIMIT_CHILDREN;
  const [visibleCount, setVisibleCount] = useState(limit);

  if (!nodes || nodes.length === 0) return null;

  const visibleNodes = nodes.slice(0, visibleCount);
  const hiddenCount  = nodes.length - visibleCount;

  return (
    <ul className="flex flex-col gap-1.5" role="tree" aria-label={depth === 0 ? 'Company Roadmap' : undefined}>
      {visibleNodes.map((node) => {
        const expanded    = isExpanded?.(node.id) ?? false;
        const children    = childrenMap?.get(node.id) ?? [];
        const isLoading   = loadingIds?.has?.(node.id) ?? false;
        const hasChildren = (node.childCount ?? 0) > 0;

        return (
          <li key={node.id} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
            {/* Node card — memoized in Phase 19 */}
            <RoadmapNodeCard
              node={node}
              depth={depth}
              isExpanded={expanded}
              onToggle={toggleExpand}
              onSelect={onSelect}
              isSelected={selectedId === node.id}
              onEdit={onEdit}
              onDelete={onDelete}
              canEdit={canEdit}
            />

            {/* Children: shown when expanded */}
            {expanded && (
              <div
                className="mt-1.5 pl-4 sm:pl-5 relative"
                style={{
                  /*
                   * Phase 18 — Mobile indent cap:
                   * Full 14px indent only up to depth 2 (3 visible levels).
                   * Beyond that on mobile screens the cards would be crushed
                   * below ~150px wide on a 380px viewport.
                   */
                  marginLeft: depth < 3 ? '14px' : '6px',
                }}
              >
                {/* Vertical indent guide line */}
                <div className="absolute left-0 top-0 bottom-2 w-px bg-border/60" />

                {isLoading && children.length === 0 ? (
                  /* Loading spinner while first batch arrives */
                  <div className="flex items-center gap-2 py-3 pl-3 text-xs text-text-muted">
                    <div className="w-3.5 h-3.5 border border-orange border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Loading…
                  </div>
                ) : children.length > 0 ? (
                  /* Recurse into children */
                  <RoadmapTree
                    nodes={children}
                    depth={depth + 1}
                    treeState={treeState}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canEdit={canEdit}
                  />
                ) : (
                  /* Expanded but no children returned yet (childCount was stale) */
                  <p className="py-3 pl-3 text-xs text-text-muted italic">No child nodes</p>
                )}
              </div>
            )}
          </li>
        );
      })}

      {/* Phase 19: "Show more" button when nodes exceed the render limit */}
      {hiddenCount > 0 && (
        <li role="presentation">
          <button
            id={`rm-show-more-depth-${depth}`}
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="w-full mt-1 py-2 px-3 rounded-xl border border-dashed border-border
              text-xs text-text-muted hover:text-text-secondary hover:border-orange/40
              hover:bg-surfaceHover transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Show {Math.min(hiddenCount, PAGE_SIZE)} more
            <span className="text-text-muted/60">({hiddenCount} hidden)</span>
          </button>
        </li>
      )}
    </ul>
  );
}

export default memo(RoadmapTree);
