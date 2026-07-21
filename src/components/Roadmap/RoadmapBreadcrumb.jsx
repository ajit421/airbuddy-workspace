import { useState, useEffect } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../services/firebase';

/**
 * RoadmapBreadcrumb.jsx
 * Renders an ancestor breadcrumb trail from node.path (materialized path).
 *
 * node.path format: "rootId/childId/grandchildId" (the node's own ID is last).
 * We resolve only the ANCESTOR segments (all except the last) to get their titles.
 * Uses one-time getDoc per ancestor (not subscriptions — breadcrumb is read-only).
 *
 * Props:
 *  - node          {object}   Full roadmap node (must have .path and .id)
 *  - onNavigate    {function} Called with nodeId when an ancestor crumb is clicked
 */
export default function RoadmapBreadcrumb({ node, onNavigate }) {
  const [ancestorTitles, setAncestorTitles] = useState({}); // { nodeId: title }
  const [loading, setLoading] = useState(false);

  // Parse ancestor IDs from materialized path (exclude the node's own ID = last segment)
  const segments   = node?.path ? node.path.split('/') : [];
  const ancestorIds = segments.slice(0, -1); // everything before the last segment

  useEffect(() => {
    if (ancestorIds.length === 0) return;

    let cancelled = false;
    setLoading(true);

    // Fetch all ancestors in parallel (one getDoc per ancestor)
    Promise.all(
      ancestorIds.map((id) =>
        getDoc(doc(db, 'roadmapNodes', id))
          .then((snap) => ({ id, title: snap.exists() ? snap.data().title : id }))
          .catch(() => ({ id, title: id }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach(({ id, title }) => { map[id] = title; });
      setAncestorTitles(map);
      setLoading(false);
    });

    return () => { cancelled = true; };
  // Only re-run when the path itself changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.path]);

  if (!node) return null;

  return (
    <nav className="flex items-center gap-1 flex-wrap text-xs text-text-muted" aria-label="Breadcrumb">
      {/* Root link */}
      <button
        onClick={() => onNavigate && onNavigate(null)}
        className="hover:text-orange transition-colors font-medium flex-shrink-0"
      >
        Roadmap
      </button>

      {/* Ancestor segments */}
      {ancestorIds.map((id) => (
        <span key={id} className="flex items-center gap-1 flex-shrink-0">
          <svg className="w-3 h-3 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {loading && !ancestorTitles[id] ? (
            <span className="inline-block w-16 h-3 bg-border rounded animate-pulse" />
          ) : (
            <button
              onClick={() => onNavigate && onNavigate(id)}
              className="hover:text-orange transition-colors max-w-[120px] truncate"
              title={ancestorTitles[id] ?? id}
            >
              {ancestorTitles[id] ?? id}
            </button>
          )}
        </span>
      ))}

      {/* Current node (non-clickable) */}
      <span className="flex items-center gap-1 flex-shrink-0">
        <svg className="w-3 h-3 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-text-primary font-semibold max-w-[160px] truncate" title={node.title}>
          {node.title}
        </span>
      </span>
    </nav>
  );
}
