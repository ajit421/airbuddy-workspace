import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeToChildren } from '../services/roadmapService';

/**
 * RoadmapContext.jsx
 * Scoped provider — mounted ONLY on /roadmap routes via App.jsx.
 * Mirrors KpiContext.jsx pattern exactly.
 *
 * Holds the real-time root-level nodes subscription.
 * Child-level subscriptions are managed per-node by useRoadmapTree.js
 * to avoid subscribing to the entire tree on mount.
 */
const RoadmapContext = createContext(null);

export const RoadmapProvider = ({ children }) => {
  const [rootNodes, setRootNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToChildren(
      null,
      (nodes) => {
        setRootNodes(nodes);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  return (
    <RoadmapContext.Provider value={{ rootNodes, loading, error }}>
      {children}
    </RoadmapContext.Provider>
  );
};

export const useRoadmap = () => {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmap must be used within RoadmapProvider');
  return ctx;
};
