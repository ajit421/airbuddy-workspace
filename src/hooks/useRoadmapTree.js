import { useState, useCallback, useRef, useEffect } from 'react';
import { subscribeToChildren } from '../services/roadmapService';

/**
 * useRoadmapTree.js
 * Manages expand/collapse state for the roadmap tree.
 * Subscribes to Firestore children on expand; unsubscribes on collapse.
 * Ensures listeners are cleaned up on component unmount.
 *
 * @returns {{
 *   expandedIds:  Set<string>,
 *   childrenMap:  Map<string, Array>,
 *   toggleExpand: (nodeId: string) => void,
 *   isExpanded:   (nodeId: string) => boolean,
 * }}
 */
export function useRoadmapTree() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [childrenMap, setChildrenMap] = useState(new Map());
  const unsubMap = useRef(new Map()); // nodeId → unsubscribe fn

  // Cleanup all listeners on unmount
  useEffect(() => {
    return () => {
      unsubMap.current.forEach((unsub) => unsub());
      unsubMap.current.clear();
    };
  }, []);

  const toggleExpand = useCallback((nodeId) => {
    if (expandedIds.has(nodeId)) {
      // Collapse: cancel listener and remove children from map
      const unsub = unsubMap.current.get(nodeId);
      if (unsub) {
        unsub();
        unsubMap.current.delete(nodeId);
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setChildrenMap((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
    } else {
      // Expand: subscribe to children
      const unsub = subscribeToChildren(
        nodeId,
        (nodes) => {
          setChildrenMap((prev) => new Map(prev).set(nodeId, nodes));
        },
        (err) => {
          console.error('[useRoadmapTree] subscribeToChildren error:', err);
        }
      );
      unsubMap.current.set(nodeId, unsub);
      setExpandedIds((prev) => new Set(prev).add(nodeId));
    }
  }, [expandedIds]);

  const isExpanded = useCallback((nodeId) => expandedIds.has(nodeId), [expandedIds]);

  return { expandedIds, childrenMap, toggleExpand, isExpanded };
}
