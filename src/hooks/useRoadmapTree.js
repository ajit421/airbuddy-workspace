import { useState, useCallback, useRef, useEffect } from 'react';
import { subscribeToChildren } from '../services/roadmapService';

/**
 * useRoadmapTree.js
 * Manages expand/collapse state for the roadmap tree.
 * Subscribes to Firestore children on expand; unsubscribes on collapse.
 * Ensures listeners are cleaned up on component unmount.
 *
 * Phase 19 — Performance:
 *  Problem: toggleExpand had useCallback([expandedIds]) — the dep changed on
 *  every expand/collapse, producing a new function reference each time. This
 *  caused React.memo on RoadmapNodeCard to miss (onToggle prop changed) and
 *  re-render every visible card on every interaction.
 *
 *  Fix: Use a stable ref (expandedRef) alongside state. toggleExpand reads
 *  from expandedRef (always current) so it never needs expandedIds as a dep.
 *  Result: toggleExpand reference is stable for the entire component lifetime.
 *  React.memo on RoadmapNodeCard now works correctly.
 *
 * @returns {{
 *   expandedIds:  Set<string>,
 *   childrenMap:  Map<string, Array>,
 *   loadingIds:   Set<string>,
 *   toggleExpand: (nodeId: string) => void,   ← stable reference
 *   isExpanded:   (nodeId: string) => boolean, ← stable reference
 * }}
 */
export function useRoadmapTree() {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [childrenMap, setChildrenMap] = useState(new Map());
  const [loadingIds,  setLoadingIds]  = useState(new Set());

  // Ref mirrors expandedIds state — lets toggleExpand read current value
  // without needing it as a useCallback dependency.
  const expandedRef  = useRef(new Set());
  const unsubMap     = useRef(new Map()); // nodeId → unsubscribe fn

  // Cleanup all listeners on unmount
  useEffect(() => {
    return () => {
      unsubMap.current.forEach((unsub) => unsub());
      unsubMap.current.clear();
    };
  }, []);

  /**
   * Phase 19: stable reference — empty dependency array.
   * Reads expandedRef (always current) instead of expandedIds state.
   */
  const toggleExpand = useCallback((nodeId) => {
    if (expandedRef.current.has(nodeId)) {
      // ── Collapse ────────────────────────────────────────────────────────
      const unsub = unsubMap.current.get(nodeId);
      if (unsub) {
        unsub();
        unsubMap.current.delete(nodeId);
      }

      expandedRef.current = new Set(expandedRef.current);
      expandedRef.current.delete(nodeId);

      setExpandedIds(new Set(expandedRef.current));
      setChildrenMap((prev) => {
        const next = new Map(prev);
        next.delete(nodeId);
        return next;
      });
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    } else {
      // ── Expand ──────────────────────────────────────────────────────────
      // Show loading indicator immediately
      setLoadingIds((prev) => new Set(prev).add(nodeId));

      const unsub = subscribeToChildren(
        nodeId,
        (nodes) => {
          setChildrenMap((prev) => new Map(prev).set(nodeId, nodes));
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
        },
        (err) => {
          console.error('[useRoadmapTree] subscribeToChildren error:', err);
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(nodeId);
            return next;
          });
        }
      );

      unsubMap.current.set(nodeId, unsub);

      expandedRef.current = new Set(expandedRef.current);
      expandedRef.current.add(nodeId);

      setExpandedIds(new Set(expandedRef.current));
    }
  }, []); // ← empty deps: stable for the component lifetime

  /**
   * isExpanded reads expandedRef directly → also stable reference.
   */
  const isExpanded = useCallback(
    (nodeId) => expandedRef.current.has(nodeId),
    [] // ← empty deps: stable forever
  );

  return { expandedIds, childrenMap, loadingIds, toggleExpand, isExpanded };
}
