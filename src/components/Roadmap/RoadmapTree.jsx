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
 * Listener lifecycle:
 *   Each expand calls subscribeToChildren(nodeId) via useRoadmapTree.
 *   Each collapse auto-unsubscribes the listener.
 *   All listeners are cleaned up on component unmount by the hook.
 */
export default function RoadmapTree({
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

  if (!nodes || nodes.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1.5" role="tree" aria-label={depth === 0 ? 'Company Roadmap' : undefined}>
      {nodes.map((node) => {
        const expanded     = isExpanded?.(node.id) ?? false;
        const children     = childrenMap?.get(node.id) ?? [];
        const isLoading    = loadingIds?.has?.(node.id) ?? false;
        const hasChildren  = (node.childCount ?? 0) > 0;

        return (
          <li key={node.id} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
            {/* Node card */}
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
                className="mt-1.5 pl-5 relative"
                style={{ marginLeft: '14px' }}
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
    </ul>
  );
}
