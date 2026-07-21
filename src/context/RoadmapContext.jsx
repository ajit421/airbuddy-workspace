import { createContext, useContext, useEffect, useState } from 'react';
// import { subscribeToChildren } from '../services/roadmapService'; // Phase 6

/**
 * RoadmapContext.jsx
 * Scoped provider — mounted ONLY on /roadmap routes via App.jsx.
 * Mirrors KpiContext.jsx pattern exactly.
 *
 * Phase 6+ implementation will wire real Firestore subscriptions.
 */
const RoadmapContext = createContext(null);

export const RoadmapProvider = ({ children }) => {
  const [rootNodes, setRootNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Phase 6: Replace stub with real subscription
    // const unsub = subscribeToChildren(null, setRootNodes, (err) => setError(err));
    setLoading(false);
    // return unsub;
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
