import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { firebaseConfig } from '../services/firebase';

/**
 * /connect/claude — hands this browser's WorkSpace session to the local
 * `airbuddy-mcp` server (mcp/ at the repo root) so an employee's own Claude can
 * read and update their work as them.
 *
 * `airbuddy-mcp login` opens this page with ?port=&state= and waits on
 * http://127.0.0.1:<port>/callback. On Connect we form-POST the Firebase
 * refresh token there. Three things keep that safe:
 *   - the target is hardcoded to 127.0.0.1, so a crafted link can only ever
 *     send the token to the person's own machine, never off it;
 *   - nothing is sent until the person clicks Connect;
 *   - `state` is echoed back and checked by the CLI, so the session cannot be
 *     planted on a CLI that did not ask for it.
 *
 * The token is the same Firebase session the app already holds and carries no
 * Google OAuth scope — this page signs in with the ordinary `googleProvider`
 * and must never add one (see src/services/firebase.js).
 *
 * Mounted outside ProtectedRoute on purpose: ProtectedRoute redirects to
 * /login, which then lands on "/" and drops ?port=&state=. This page signs the
 * user in itself and stays put.
 */

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;

export default function ConnectClaudePage() {
  const { user, userProfile, signInWithGoogle, loading } = useAuth();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const port = Number(params.get('port'));
  const state = params.get('state') ?? '';
  const valid = Number.isInteger(port) && port >= 1024 && port <= 65535 && STATE_RE.test(state);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // AuthContext already shows the error toast
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () => {
    if (!valid || !user?.refreshToken) return;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `http://127.0.0.1:${port}/callback`;
    const fields = {
      state,
      refreshToken: user.refreshToken,
      apiKey: firebaseConfig.apiKey,
      projectId: firebaseConfig.projectId,
      email: user.email ?? '',
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    setSent(true);
    form.submit();
  };

  let body;
  if (!valid) {
    body = (
      <>
        <h2 className="text-xl font-bold text-text-primary mb-2">Start from your terminal</h2>
        <p className="text-sm text-text-secondary">
          This page is opened by <code className="text-orange">airbuddy-mcp login</code>. Run that command on the
          computer where Claude is installed and it will bring you back here.
        </p>
        <Link to="/docs/claude-connector" className="btn-secondary w-full mt-6 inline-flex justify-center">
          Read the setup guide
        </Link>
      </>
    );
  } else if (loading) {
    body = <div className="mx-auto animate-spin w-6 h-6 border-2 border-orange border-t-transparent rounded-full" />;
  } else if (!user) {
    body = (
      <>
        <h2 className="text-xl font-bold text-text-primary mb-2">Sign in to connect Claude</h2>
        <p className="text-sm text-text-secondary mb-6">Use the same Google account you use for WorkSpace.</p>
        <button onClick={handleSignIn} disabled={busy} className="btn-primary w-full">
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
      </>
    );
  } else {
    body = (
      <>
        <h2 className="text-xl font-bold text-text-primary mb-2">Connect Claude on this computer?</h2>
        <p className="text-sm text-text-secondary mb-4">
          Claude will act as <span className="font-semibold text-text-primary">{userProfile?.name || user.email}</span>{' '}
          ({user.email}). It can do what you can do in WorkSpace: read your tasks and the roadmap, update progress,
          tick checklist items, post updates and manage work partners.
        </p>
        <ul className="text-xs text-text-muted space-y-1 mb-6 list-disc pl-4">
          <li>Your session is sent only to this computer (127.0.0.1:{port}).</li>
          <li>Disconnect at any time with <code className="text-orange">airbuddy-mcp logout</code>.</li>
          <li>Only connect if you just ran <code className="text-orange">airbuddy-mcp login</code> yourself.</li>
        </ul>
        <button onClick={handleConnect} disabled={sent} className="btn-primary w-full">
          {sent ? 'Connecting…' : 'Connect Claude'}
        </button>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white mb-4 p-1">
            <img src="/airbuddyin_logo.png" alt="AirBuddy Aerospace" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">AirBuddy WorkSpace · Claude connector</p>
        </div>
        <div className="card border border-border/60 p-6 rounded-2xl">{body}</div>
      </div>
    </div>
  );
}
