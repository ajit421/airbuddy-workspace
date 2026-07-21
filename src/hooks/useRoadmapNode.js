import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { canEditRoadmapStructure, canUpdateProgress } from '../utils/permissions';
// import { subscribeToNode, updateNode, deleteNode } from '../services/roadmapService'; // Phase 6+7

/**
 * useRoadmapNode.js
 * Subscribes to a single roadmapNode document and exposes mutation helpers.
 *
 * @param {string} nodeId - Firestore document ID of the roadmap node
 * @returns {{ node, loading, updateNode, deleteNode, canEdit, canProgress }}
 */
export function useRoadmapNode(nodeId) {
  const { userProfile } = useAuth();
  const [node, setNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nodeId) { setLoading(false); return; }
    // Phase 6+7: Replace stub with real Firestore onSnapshot
    // const unsub = subscribeToNode(nodeId, (data) => { setNode(data); setLoading(false); });
    setLoading(false);
    // return unsub;
  }, [nodeId]);

  const canEdit = canEditRoadmapStructure(userProfile);
  const canProgress = node ? canUpdateProgress(node, userProfile) : false;

  const handleUpdate = async (data) => {
    // Phase 7: await updateNode(nodeId, data, userProfile?.uid);
  };

  const handleDelete = async () => {
    // Phase 7: await deleteNode(nodeId);  — blocked if node has children
  };

  return { node, loading, updateNode: handleUpdate, deleteNode: handleDelete, canEdit, canProgress };
}
