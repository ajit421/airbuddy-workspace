import { useState, useCallback, useRef } from 'react';
// import { subscribeToChildren } from '../services/roadmapService'; // Phase 6

/**
 * useRoadmapTree.js
 * Manages expand/collapse state and child Firestore subscriptions.
 *
 * Phase 6+10 implementation will wire real subscribeToChildren calls.
 *
 * @returns {{
 *   expandedIds: Set<string>,
 *   childrenMap: Map<string, Array>,
 *   toggleExpand: (nodeId: string) => void,
 *   isExpanded: (nodeId: string) => boolean,
 * }}
 */
export function useRoadmapTree() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [childrenMap, setChildrenMap] = useState(new Map());
  const unsubMap = useRef(new Map()); // nodeId → unsubscribe fn

  const toggleExpand = useCallback((nodeId) => {
    if (expandedIds.has(nodeId)) {
      // Collapse: clean up listener
      const unsub = unsubMap.current.get(nodeId);
      if (unsub) { unsub(); unsubMap.current.delete(nodeId); }
      setExpandedIds(prev => { const next = new Set(prev); next.delete(nodeId); return next; });
      setChildrenMap(prev => { const next = new Map(prev); next.delete(nodeId); return next; });
    } else {
      // Expand: subscribe to children (Phase 6: wire real subscription)
      // const unsub = subscribeToChildren(nodeId, (nodes) => {
      //   setChildrenMap(prev => new Map(prev).set(nodeId, nodes));
      // });
      // unsubMap.current.set(nodeId, unsub);
      setExpandedIds(prev => new Set(prev).add(nodeId));
    }
  }, [expandedIds]);

  const isExpanded = useCallback((nodeId) => expandedIds.has(nodeId), [expandedIds]);

  return { expandedIds, childrenMap, toggleExpand, isExpanded };
}
