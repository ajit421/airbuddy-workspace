import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-2xl glow-orange mb-6 p-1.5">
            <img
              src="/airbuddyin_logo.png"
              alt="AirBuddy Aerospace"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-3xl font-black text-text-primary tracking-tight">
            Air<span className="text-gradient">Buddy</span>
          </h1>
          <p className="text-lg font-semibold text-text-secondary mt-1">Aerospace WorkSpace</p>
          <p className="text-sm text-text-muted mt-3 max-w-xs mx-auto">
            Your unified workforce management platform — tasks, calendar, and collaboration in one place.
          </p>
        </div>

        {/* Sign In Card */}
        <div className="card border border-border/60 p-8 rounded-2xl backdrop-blur-xl">
          <h2 className="text-xl font-bold text-text-primary mb-2">Welcome back</h2>
          <p className="text-sm text-text-secondary mb-6">Sign in with your AirBuddy Google account to continue</p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            id="google-signin-btn"
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <p className="text-xs text-text-muted text-center mt-4">
            Access is restricted to AirBuddy Aerospace team members only.
          </p>
        </div>

        {/* Features preview */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { icon: '📊', label: 'Dashboard' },
            { icon: '📅', label: 'Calendar' },
            { icon: '🤖', label: 'AI Assistant' },
          ].map((f) => (
            <div key={f.label} className="card text-center py-3 px-2">
              <div className="text-2xl mb-1">{f.icon}</div>
              <p className="text-xs text-text-muted font-medium">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
