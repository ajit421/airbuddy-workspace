import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';
import { requestBrowserNotifPermission } from '../services/notificationService';
import { GoogleAuthProvider } from 'firebase/auth';

const GTOKEN_KEY = 'goog_cal_token';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Load from sessionStorage so token survives page refreshes within the session
  const [googleAccessToken, setGoogleAccessToken] = useState(
    () => sessionStorage.getItem(GTOKEN_KEY) || null
  );

  // Try to use the notifications hook, but handle case where it might be used outside its provider context
  // Usually AuthProvider wraps the whole app, and Notifications typically go inside or alongside
  // So we'll provide a local fallback if useNotifications isn't available or we'll just use raw window.alert as a simple toast fallback
  // Wait, let's look at how useNotifications is imported. Actually AuthProvider is at the root. We can just use an internal state for a simple toast if the project doesn't have a global toast container setup yet.

  // We'll implement a basic local toast state just for auth errors to be safe and self-contained 
  // as requested "user-friendly toast notifications in AuthContext.jsx"
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          setUser(firebaseUser);
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const snap = await getDoc(profileRef);

          if (!snap.exists()) {
            // First login — create profile
            const newProfile = {
              uid: firebaseUser.uid,
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
          // Ask for browser notification permission as soon as user is authenticated
          requestBrowserNotifPermission();
        } catch (error) {
          console.error("Error setting up user profile:", error);
          setAuthError("Failed to load user profile. Please try logging in again.");
          await firebaseSignOut(auth);
          setUser(null);
          setUserProfile(null);
        }
      } else {
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // Capture the Google OAuth access token for Calendar API calls
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        sessionStorage.setItem(GTOKEN_KEY, credential.accessToken);
      }
      return result;
    } catch (error) {
      console.error("Login failed:", error);
      let errorMessage = "An error occurred during login. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "Sign-in popup was closed before completing.";
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      setAuthError(errorMessage);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setGoogleAccessToken(null);
      sessionStorage.removeItem(GTOKEN_KEY);
    } catch (error) {
      console.error("Sign out failed:", error);
      setAuthError("Failed to sign out properly.");
    }
  };

  // Silently re-authenticate with Google to get a fresh access token
  // (called automatically if calendarService gets a 401)
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

  const isAdmin = userProfile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signInWithGoogle, signOut, isAdmin, authError, clearAuthError, googleAccessToken, refreshGoogleToken }}>
      {children}
      {/* Basic Toast Notification UI inline in AuthProvider */}
      {authError && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-500 text-white px-6 py-3 rounded shadow-lg flex items-center justify-between gap-4 animate-bounce">
          <span>{authError}</span>
          <button onClick={clearAuthError} className="text-white hover:text-gray-200 font-bold bg-transparent border-0 text-xl font-mono px-2">
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
