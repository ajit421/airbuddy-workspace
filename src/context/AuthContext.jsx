import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';
import { requestBrowserNotifPermission } from '../services/notificationService';

const GTOKEN_KEY = 'goog_cal_token';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [effectiveUid, setEffectiveUid] = useState(null);
  const [loading, setLoading] = useState(true);
  // Load from sessionStorage so token survives page refreshes within the session
  const [googleAccessToken, setGoogleAccessToken] = useState(
    () => sessionStorage.getItem(GTOKEN_KEY) || null
  );
  
  const [isEmployeeView, setIsEmployeeView] = useState(false);
  const [authError, setAuthError] = useState(null);

  // ── Auth state listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setUser(firebaseUser);
          
          // Check if this email is a secondary/linked email mapped to a primary user
          // Documents in user_email_map use the email address as the document ID
          const emailMapRef = doc(db, 'user_email_map', firebaseUser.email);
          const emailMapSnap = await getDoc(emailMapRef);
          let targetUid = firebaseUser.uid;
          
          if (emailMapSnap.exists()) {
            // This is a secondary account — transparently redirect to the primary UID
            targetUid = emailMapSnap.data().primaryUid;
          }
          setEffectiveUid(targetUid);

          const profileRef = doc(db, 'users', targetUid);
          const snap = await getDoc(profileRef);

          if (!snap.exists()) {
            // First login — create profile with employee role
            const newProfile = {
              uid: targetUid,
              name: firebaseUser.displayName || 'Team Member',
              email: firebaseUser.email,
              role: 'employee',
              avatar: firebaseUser.photoURL || '',
              createdAt: serverTimestamp(),
            };
            await setDoc(profileRef, newProfile);
            setUserProfile(newProfile);
          } else {
            setUserProfile(snap.data());
          }
          requestBrowserNotifPermission();
        } catch (error) {
          console.error('Error setting up user profile:', error);
          setAuthError('Failed to load user profile. Please try logging in again.');
          await firebaseSignOut(auth);
          setUser(null);
          setEffectiveUid(null);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setEffectiveUid(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── Sign-in with Google (Popup) ──────────────────────────────────────────────
  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        sessionStorage.setItem(GTOKEN_KEY, credential.accessToken);
      }
      return result;
    } catch (error) {
      console.error('Login failed:', error);
      let errorMessage = 'Sign-in failed. Please try again.';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in was cancelled. Please try again.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked by your browser. Please allow popups for the AirBuddy site and try again.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Another sign-in is in progress. Please wait.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
      throw error;
    }
  };

  // ── Sign-out ─────────────────────────────────────────────────────────────────
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setGoogleAccessToken(null);
      sessionStorage.removeItem(GTOKEN_KEY);
    } catch (error) {
      console.error('Sign out failed:', error);
      setAuthError('Failed to sign out properly.');
    }
  };

  // ── Refresh Google OAuth token silently (called on Calendar 401) ─────────────
  const refreshGoogleToken = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        sessionStorage.setItem(GTOKEN_KEY, credential.accessToken);
        return credential.accessToken;
      }
    } catch (err) {
      console.warn('Could not refresh Google token:', err);
    }
    return null;
  };

  const clearAuthError = () => setAuthError(null);

  const realIsAdmin = userProfile?.role === 'admin';
  const isAdmin = realIsAdmin && !isEmployeeView;
  const toggleEmployeeView = () => setIsEmployeeView(prev => !prev);

  return (
    <AuthContext.Provider value={{
      user, userProfile, effectiveUid, loading, signInWithGoogle, signOut,
      isAdmin, realIsAdmin, isEmployeeView, toggleEmployeeView,
      authError, clearAuthError, googleAccessToken, refreshGoogleToken
    }}>
      {children}
      {authError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{authError}</span>
          <button
            onClick={clearAuthError}
            className="text-white hover:text-gray-200 font-bold text-xl leading-none"
          >
            &times;
          </button>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
