import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { canEditRoadmapStructure, canUpdateProgress } from '../utils/permissions';
import { subscribeToNode, updateNode, deleteNode } from '../services/roadmapService';

/**
 * useRoadmapNode.js
 * Subscribes to a single roadmap node document and exposes mutation helpers.
 * Permission helpers are derived from userProfile (consistent with permissions.js).
 *
 * @param {string} nodeId - Firestore document ID of the roadmap node
 * @returns {{ node, loading, updateNode, deleteNode, canEdit, canProgress }}
 */
export function useRoadmapNode(nodeId) {
  const { userProfile } = useAuth();
  const [node, setNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nodeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToNode(
      nodeId,
      (data) => {
        setNode(data);
        setLoading(false);
      },
      (err) => {
        console.error('[useRoadmapNode] subscribeToNode error:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [nodeId]);

  const canEdit     = canEditRoadmapStructure(userProfile);
  const canProgress = node ? canUpdateProgress(node, userProfile) : false;

  const handleUpdate = async (data) => {
    if (!userProfile?.uid) throw new Error('Not authenticated');
    return updateNode(nodeId, data, userProfile.uid);
  };

  const handleDelete = async () => {
    return deleteNode(nodeId);
  };

  return {
    node,
    loading,
    updateNode:   handleUpdate,
    deleteNode:   handleDelete,
    canEdit,
    canProgress,
  };
}
