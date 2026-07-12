import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';
import { requestBrowserNotifPermission } from '../services/notificationService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [effectiveUid, setEffectiveUid] = useState(null);
  const [loading, setLoading] = useState(true);
  // HI-11 fix: Google OAuth token stored in memory only (no sessionStorage).
  // sessionStorage is readable by XSS payloads; keeping the token in React state
  // limits its exposure to the current JS execution context.
  // The token is re-acquired on page refresh via refreshGoogleToken() if needed.
  const [googleAccessToken, setGoogleAccessToken] = useState(null);
  
  const [isEmployeeView, setIsEmployeeView] = useState(false);
  const [authError, setAuthError] = useState(null);

  // ── Auth state listener ──────────────────────────────────────────────────────
  useEffect(() => {
    let unsubProfile = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous profile real-time listener if any
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        try {
          // ── Whitelist / Invite-Only gate ─────────────────────────────────────
          // Check the allowed_emails collection BEFORE any other logic.
          // The document ID is the user's email address.
          const allowedEmailRef = doc(db, 'allowed_emails', firebaseUser.email);
          const allowedEmailSnap = await getDoc(allowedEmailRef);

          if (!allowedEmailSnap.exists()) {
            // Email is NOT whitelisted — reject immediately
            await firebaseSignOut(auth);
            setAuthError('Unauthorized access: Your email is not whitelisted. Please contact the admin.');
            setUser(null);
            setEffectiveUid(null);
            setUserProfile(null);
            setLoading(false);
            return;
          }

          // NEW-2 fix: CR-4 was fixed in Firestore rules (status check) but the
          // client-side gate only checked existence. A suspended user would pass
          // this gate and see the app UI before hitting Firestore permission errors.
          // Now we check the status field here too — matching what the rules enforce.
          const emailDocStatus = allowedEmailSnap.data()?.status;
          if (emailDocStatus === 'suspended') {
            await firebaseSignOut(auth);
            setAuthError('Your account has been suspended. Please contact the admin.');
            setUser(null);
            setEffectiveUid(null);
            setUserProfile(null);
            setLoading(false);
            return;
          }
          // ── Email is whitelisted and active — continue with normal flow ───────

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
          }

          // LO-3 fix: subscribe to user's own profile doc for real-time role/avatar updates.
          unsubProfile = onSnapshot(profileRef, (profileSnap) => {
            if (profileSnap.exists()) {
              setUserProfile(profileSnap.data());
            }
          }, (err) => {
            console.error('Error in user profile real-time listener:', err);
          });

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

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  // ── Sign-in with Google (Popup) ──────────────────────────────────────────────
  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        // HI-11 fix: no longer persisting to sessionStorage
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
      // HI-11 fix: no sessionStorage entry to clear
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
        // HI-11 fix: token stored in memory only
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
