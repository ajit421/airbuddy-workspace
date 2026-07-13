/**
 * ViewModeContext.jsx
 * Global toggle between "card" (grid) and "table" (list/row) rendering.
 *
 * - Initialises from userProfile.viewMode (read via AuthContext's existing
 *   onSnapshot listener — no extra Firestore listener needed).
 * - On toggle: updates local state immediately (optimistic) and persists to
 *   Firestore via updateDoc on the user's own profile doc.
 * - Re-syncs whenever userProfile.viewMode changes (cross-device support).
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';

const ViewModeContext = createContext(null);

export const ViewModeProvider = ({ children }) => {
  const { userProfile, effectiveUid } = useAuth();

  // Initialise from profile or default to 'card'
  const [viewMode, setViewModeState] = useState(
    () => userProfile?.viewMode ?? 'card'
  );

  // Re-sync whenever the Firestore profile doc changes (handles cross-device)
  useEffect(() => {
    if (userProfile?.viewMode && userProfile.viewMode !== viewMode) {
      setViewModeState(userProfile.viewMode);
    }
    // Intentionally not including viewMode in deps — we only want to pull from
    // Firestore, not push back on every local toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.viewMode]);

  /**
   * Switch to a specific mode ('card' | 'table').
   * Persists to Firestore immediately; local state updated optimistically.
   */
  const setViewMode = async (newMode) => {
    if (newMode === viewMode) return;
    setViewModeState(newMode);
    if (effectiveUid) {
      try {
        await updateDoc(doc(db, 'users', effectiveUid), { viewMode: newMode });
      } catch (err) {
        console.error('[ViewModeContext] Failed to persist viewMode:', err);
      }
    }
  };

  /** Convenience toggle between the two modes. */
  const toggleViewMode = () => setViewMode(viewMode === 'card' ? 'table' : 'card');

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, toggleViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
};
