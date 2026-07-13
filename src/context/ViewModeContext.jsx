/**
 * ViewModeContext.jsx
 * Global toggle between "card" (grid) and "table" (list/row) rendering.
 *
 * - Initialises from userProfile.viewMode (read via AuthContext's existing
 *   onSnapshot listener — no extra Firestore listener needed).
 * - On toggle: updates local state immediately (optimistic) and persists to
 *   Firestore via updateDoc on the user's own profile doc.
 * - Re-syncs whenever userProfile.viewMode changes (cross-device support),
 *   but ignores stale snapshots that haven't caught up to our own pending
 *   write yet — this prevents the "flips back for 2s then corrects itself"
 *   flicker bug.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
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

  // Tracks a value we just wrote locally that Firestore hasn't echoed back
  // yet. While this is set, incoming userProfile updates that don't match
  // it are treated as stale and ignored — prevents the revert-then-correct
  // flicker.
  const pendingRef = useRef(null);

  // Re-sync whenever the Firestore profile doc changes (handles cross-device)
  useEffect(() => {
    const remoteMode = userProfile?.viewMode ?? 'card';

    // If we have a pending local write, only accept the update once
    // Firestore actually reflects it. Anything else is a stale snapshot
    // (e.g. from a listener that hasn't caught up yet).
    if (pendingRef.current) {
      if (remoteMode === pendingRef.current) {
        pendingRef.current = null; // confirmed — safe to clear
        setViewModeState(remoteMode);
      }
      return; // ignore stale value in the meantime
    }

    if (remoteMode !== viewMode) {
      setViewModeState(remoteMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.viewMode]);

  /**
   * Switch to a specific mode ('card' | 'table').
   * Persists to Firestore immediately; local state updated optimistically.
   */
  const setViewMode = async (newMode) => {
    if (newMode === viewMode) return;

    pendingRef.current = newMode; // mark: ignore stale snapshots until this lands
    setViewModeState(newMode);    // instant, no flicker

    if (effectiveUid) {
      try {
        await updateDoc(doc(db, 'users', effectiveUid), { viewMode: newMode });
      } catch (err) {
        console.error('[ViewModeContext] Failed to persist viewMode:', err);
        pendingRef.current = null;
        // revert on failure so UI doesn't lie about persisted state
        setViewModeState(userProfile?.viewMode ?? 'card');
      }
    } else {
      pendingRef.current = null;
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
