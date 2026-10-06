import { useEffect, useState } from 'react';
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
 * Second mode, ?authreq=: the hosted connector (api/_lib/oauth.js). claude.ai
 * sends the employee here from its Connectors page; on Connect we form-POST the
 * refresh token to our own /api/oauth/approve, which sends them back to Claude
 * with a one-time code. The destination is fixed (same origin), and the page
 * shows which Claude address the code will go to, as the MCP spec requires.
 *
 * Mounted outside ProtectedRoute on purpose: ProtectedRoute redirects to
 * /login, which then lands on "/" and drops ?port=&state=. This page signs the
 * user in itself and stays put.
 */

const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const AUTHREQ_RE = /^v1\.[A-Za-z0-9_-]{20,4000}$/;

/** Navigate by form POST (top-level), so the server can redirect back to Claude. */
function postForm(action, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function ConnectClaudePage() {
  const [params] = useSearchParams();
  const authreq = params.get('authreq');
  return authreq ? <HostedConnect authreq={authreq} /> : <LocalConnect params={params} />;
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white mb-4 p-1">
            <img src="/airbuddyin_logo.png" alt="AirBuddy Aerospace" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">AirBuddy WorkSpace · Claude connector</p>
        </div>
        <div className="card border border-border/60 p-6 rounded-2xl">{children}</div>
      </div>
    </div>
  );
}

function SignInPrompt({ onSignIn, busy }) {
  return (
    <>
      <h2 className="text-xl font-bold text-text-primary mb-2">Sign in to connect Claude</h2>
      <p className="text-sm text-text-secondary mb-6">Use the same Google account you use for WorkSpace.</p>
      <button onClick={onSignIn} disabled={busy} className="btn-primary w-full">
        {busy ? 'Signing in…' : 'Continue with Google'}
      </button>
    </>
  );
}

const Spinner = () => <div className="mx-auto animate-spin w-6 h-6 border-2 border-orange border-t-transparent rounded-full" />;

function useSignIn() {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // AuthContext already shows the error toast
    } finally {
      setBusy(false);
    }
  };
  return [signIn, busy];
}

/** ?authreq= — connecting the hosted connector from claude.ai / Claude Desktop / mobile. */
function HostedConnect({ authreq }) {
  const { user, userProfile, loading } = useAuth();
  const [signIn, busy] = useSignIn();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const wellFormed = AUTHREQ_RE.test(authreq);

  useEffect(() => {
    if (!wellFormed) return;
    let cancelled = false;
    fetch(`/api/oauth/describe?authreq=${encodeURIComponent(authreq)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok) setInfo(body);
        else setError(body.error_description || 'This sign-in link is not valid any more.');
      })
      .catch(() => { if (!cancelled) setError('Could not reach WorkSpace. Check your connection and try again.'); });
    return () => { cancelled = true; };
  }, [authreq, wellFormed]);

  const connect = () => {
    if (!user?.refreshToken) return;
    setSent(true);
    postForm('/api/oauth/approve', { authreq, refresh_token: user.refreshToken });
  };
  const cancel = () => {
    setSent(true);
    postForm('/api/oauth/deny', { authreq });
  };

  let body;
  if (!wellFormed || error) {
    body = (
      <>
        <h2 className="text-xl font-bold text-text-primary mb-2">Link expired</h2>
        <p className="text-sm text-text-secondary">
          {error || 'This sign-in link is not valid.'} Go back to Claude → Settings → Connectors and click Connect again.
        </p>
      </>
    );
  } else if (loading || !info) {
    body = <Spinner />;
  } else if (!user) {
    body = <SignInPrompt onSignIn={signIn} busy={busy} />;
  } else {
    body = (
      <>
        <h2 className="text-xl font-bold text-text-primary mb-2">Connect {info.clientName || 'Claude'} to WorkSpace?</h2>
        <p className="text-sm text-text-secondary mb-4">
          Claude will act as <span className="font-semibold text-text-primary">{userProfile?.name || user.email}</span>{' '}
          ({user.email}), with exactly your access in WorkSpace: read your work and the roadmap, update progress,
          tick checklist items, post updates, and anything an admin has given you permission for. It can never
          delete or remove anything.
        </p>
        <ul className="text-xs text-text-muted space-y-1 mb-6 list-disc pl-4">
          <li>You'll be sent back to <span className="font-semibold text-text-secondary">{info.redirectHost}</span>.</li>
          {info.loopback && (
            <li className="text-status-warning">
              That is a program on this computer (Claude Code). Only continue if you just started this yourself.
            </li>
          )}
          <li>Disconnect any time in Claude → Settings → Connectors.</li>
        </ul>
        <div className="flex gap-3">
          <button onClick={cancel} disabled={sent} className="btn-secondary flex-1">Cancel</button>
          <button onClick={connect} disabled={sent} className="btn-primary flex-1">
            {sent ? 'Connecting…' : 'Connect Claude'}
          </button>
        </div>
      </>
    );
  }
  return <Shell>{body}</Shell>;
}

/** ?port=&state= — the local `airbuddy-mcp login` handoff. */
function LocalConnect({ params }) {
  const { user, userProfile, loading } = useAuth();
  const [handleSignIn, busy] = useSignIn();
  const [sent, setSent] = useState(false);

  const port = Number(params.get('port'));
  const state = params.get('state') ?? '';
  const valid = Number.isInteger(port) && port >= 1024 && port <= 65535 && STATE_RE.test(state);

  const handleConnect = () => {
    if (!valid || !user?.refreshToken) return;
    setSent(true);
    postForm(`http://127.0.0.1:${port}/callback`, {
      state,
      refreshToken: user.refreshToken,
      apiKey: firebaseConfig.apiKey,
      projectId: firebaseConfig.projectId,
      email: user.email ?? '',
    });
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
    body = <Spinner />;
  } else if (!user) {
    body = <SignInPrompt onSignIn={handleSignIn} busy={busy} />;
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

  return <Shell>{body}</Shell>;
}
