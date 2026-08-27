import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// ── DO NOT add OAuth scopes to this provider ─────────────────────────────────
// googleProvider is the provider signInWithPopup() uses, so any scope added
// here becomes part of the *sign-in* request. A Calendar scope was added here
// once; Calendar is a sensitive scope, and because this OAuth app is not
// verified by Google every team member's login was interrupted by a full-page
// "Google hasn't verified this app" / "Access blocked" warning. The feature was
// rolled back for that reason alone.
//
// Google Calendar sync now runs entirely server-side in functions/calendar.js,
// using a service account with Workspace domain-wide delegation: the super
// admin consents once for the whole domain, so no employee is ever prompted and
// login stays exactly as it is today. Nothing in the browser needs a Google API
// scope — if you find yourself wanting one, add it to the Cloud Function
// instead.

// Cloud Messaging lives in src/services/pushService.js.
//
// It used to be initialised eagerly here with a bare getMessaging(app) in a
// try/catch, which is unreliable feature detection — getMessaging does not
// throw synchronously on every unsupported browser. pushService.js uses the
// SDK's own async isSupported() instead and owns service-worker registration,
// token persistence and the foreground listener as one unit.

export default app;
