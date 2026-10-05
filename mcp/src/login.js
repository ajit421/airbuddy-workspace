/**
 * login.js
 * ─────────────────────────────────────────────────────────────────────────────
 * `airbuddy-mcp login` — signs this computer in as the employee by borrowing
 * the session they already have in the web app.
 *
 * FLOW:
 *   1. Listen on 127.0.0.1 on a random port, with a random `state`.
 *   2. Open <app>/connect/claude?port=…&state=… in the browser. That page
 *      (src/pages/ConnectClaudePage.jsx) uses the ordinary WorkSpace Google
 *      sign-in, then — only after the person clicks Connect — form-POSTs
 *      { state, refreshToken, apiKey, projectId, email } to
 *      http://127.0.0.1:<port>/callback.
 *   3. Check `state`, prove the token works by exchanging it, save it.
 *
 * WHY THIS AND NOT A GOOGLE OAUTH CLIENT OF OUR OWN:
 *   It reuses the exact sign-in the team already uses — no new OAuth client,
 *   no scope, so no "Google hasn't verified this app" screen (see
 *   src/services/firebase.js for why that is a hard requirement). It also
 *   works unchanged for the gmail accounts and for mapped secondary accounts,
 *   because whatever AuthContext accepts is what gets handed over.
 *
 * The page only ever posts to 127.0.0.1, so the token cannot be sent off the
 * machine by a crafted link; `state` stops another local page from planting a
 * different account's session on this one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { decodeJwtPayload, exchangeRefreshToken, saveCredentials } from './session.js';

export const DEFAULT_APP_URL = 'https://airbuddy-workspace.vercel.app';
const TIMEOUT_MS = 5 * 60_000;
const MAX_BODY = 16 * 1024;

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // The URL is printed as well; opening it by hand works the same.
  }
}

const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:28rem;padding:2rem;border:1px solid #30363d;border-radius:12px;background:#161b22}h1{font-size:1.2rem;margin:0 0 .5rem}p{color:#8b949e;line-height:1.5}</style>
</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * @param {{appUrl?: string}} [opts]
 * @returns {Promise<{email: string, uid: string}>}
 */
export function login({ appUrl = DEFAULT_APP_URL } = {}) {
  const state = randomBytes(24).toString('base64url');

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Let the response flush before closing.
      setTimeout(() => server.close(), 200);
      if (err) reject(err); else resolve(value);
    };

    const server = http.createServer((req, res) => {
      if (req.method !== 'POST' || !req.url.startsWith('/callback')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) req.destroy();
      });
      req.on('end', async () => {
        const form = new URLSearchParams(body);
        if (!sameSecret(form.get('state') ?? '', state)) {
          res.writeHead(400, { 'Content-Type': 'text/html' })
            .end(page('Link expired', 'This sign-in link does not match the one your terminal is waiting for. Run <code>airbuddy-mcp login</code> again.'));
          return;
        }
        const refreshToken = form.get('refreshToken');
        const apiKey = form.get('apiKey');
        const projectId = form.get('projectId');
        try {
          if (!refreshToken || !apiKey || !projectId) throw new Error('The connect page sent an incomplete session.');
          const t = await exchangeRefreshToken(apiKey, refreshToken);
          const claims = decodeJwtPayload(t.idToken);
          saveCredentials({
            refreshToken: t.refreshToken || refreshToken,
            apiKey,
            projectId,
            email: claims.email ?? form.get('email') ?? '',
            appUrl,
            savedAt: new Date().toISOString(),
          });
          res.writeHead(200, { 'Content-Type': 'text/html' })
            .end(page('Claude is connected', `Signed in as <b>${claims.email}</b>. You can close this tab and go back to Claude.`));
          finish(null, { email: claims.email, uid: claims.user_id });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' }).end(page('Sign-in failed', String(err.message)));
          finish(err);
        }
      });
    });

    const timer = setTimeout(() => finish(new Error('Timed out waiting for the browser (5 minutes). Run login again.')), TIMEOUT_MS);

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `${appUrl.replace(/\/$/, '')}/connect/claude?port=${port}&state=${state}`;
      console.error(`Opening your browser to connect Claude to AirBuddy WorkSpace…\nIf it does not open, visit:\n\n  ${url}\n`);
      openBrowser(url);
    });
    server.on('error', (err) => finish(err));
  });
}
