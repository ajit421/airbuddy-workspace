/**
 * oauth.js — the OAuth 2.1 authorization server Claude's connector flow needs.
 * ─────────────────────────────────────────────────────────────────────────────
 * Requirements come from https://claude.com/docs/connectors/building/authentication
 * (read 2026-10-06):
 *   - discovery: a 401 from /api/mcp points at protected resource metadata,
 *     whose `resource` is exactly the MCP URL and whose first
 *     `authorization_servers` entry is our issuer (this origin)
 *   - Dynamic Client Registration (RFC 7591), JSON body
 *   - PKCE S256 on every authorization request
 *   - /token takes application/x-www-form-urlencoded; a dead refresh token is
 *     `invalid_grant`
 *   - redirect URIs: exactly https://claude.ai/api/mcp/auth_callback for
 *     claude.ai web, Desktop, mobile and Cowork; for Claude Code a loopback
 *     http://localhost|127.0.0.1:<any port>/callback
 *
 * Sign-in is the existing /connect/claude page: the employee signs in with
 * Google (no extra scopes, so no "unverified app" warning) and clicks Connect,
 * which form-POSTs their Firebase refresh token to `approve`. From then on
 * Claude holds sealed tokens (seal.js) that carry that session; nothing is
 * stored server side.
 *
 * Known trade-off of being stateless: a refresh token cannot be invalidated
 * individually when it is rotated — the old one stays valid until its own
 * expiry (REFRESH_TTL). Cutting someone off is revokeRefreshTokens(uid) in
 * Firebase (kills the session inside every token at the next refresh, and
 * the web app too) or rotating MCP_TOKEN_SECRET (everybody reconnects).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { exchangeRefreshToken, NotSignedInError, decodeJwtPayload } from '../../mcp/src/session.js';
import { ServerSession, firebaseConfig, workspaceFor } from './firebaseSession.js';
import { ConfigError, SealError, getSecret, nowSeconds, seal, unseal } from './seal.js';

export const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
export const MCP_PATH = '/api/mcp';

export const AUTHREQ_TTL = 10 * 60;        // the employee has 10 minutes to click Connect
export const CODE_TTL = 5 * 60;            // one-time code → token exchange
export const ACCESS_TTL = 60 * 60;         // Claude refreshes before this
export const REFRESH_TTL = 90 * 24 * 3600; // reconnect at least every 90 days

// ─── Pure helpers (unit-tested) ───────────────────────────────────────────────

const isLoopback = (u) => u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');

/**
 * Whether Claude may register this redirect URI. Exactly Claude's hosted
 * callback, or Claude Code's loopback callback on any port — nothing else, so
 * the sign-in can never hand a code to somebody else's site.
 *
 * @param {string} uri
 * @param {string[]} [extra] - MCP_EXTRA_REDIRECT_URIS, exact matches
 */
export function isAllowedRedirect(uri, extra = []) {
  if (typeof uri !== 'string') return false;
  if (uri === CLAUDE_CALLBACK || extra.includes(uri)) return true;
  let u;
  try { u = new URL(uri); } catch { return false; }
  return isLoopback(u) && u.pathname === '/callback' && !u.username && !u.password && !u.search && !u.hash;
}

/** A redirect_uri on /authorize or /token matches a registered one: exact, or loopback with any port. */
export function redirectMatches(registered, given) {
  return (registered ?? []).some((r) => {
    if (r === given) return true;
    try {
      const a = new URL(r);
      const b = new URL(given);
      return isLoopback(a) && isLoopback(b) && a.hostname === b.hostname && a.pathname === b.pathname && !b.search;
    } catch {
      return false;
    }
  });
}

/** PKCE S256: base64url(sha256(verifier)) === challenge, in constant time. */
export function verifyPkce(verifier, challenge) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const b = Buffer.from(String(challenge ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The public origin this deployment is reached at (for metadata and the 401 pointer). */
export function publicOrigin(req, env = process.env) {
  if (env.MCP_PUBLIC_ORIGIN) return env.MCP_PUBLIC_ORIGIN.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const resourceMetadataUrl = (origin) => `${origin}/api/oauth/resource-metadata`;

export function resourceMetadata(origin) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    resource_name: 'AirBuddy WorkSpace',
  };
}

export function authServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

// ─── HTTP plumbing ────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-protocol-version');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

/** A plain page for errors that must not be redirected (unknown client, bad redirect_uri). */
function page(res, status, title, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<body style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="max-width:420px;border:1px solid #30363d;border-radius:16px;padding:24px;background:#161b22">
<h1 style="font-size:18px;margin:0 0 8px">${esc(title)}</h1><p style="color:#8b949e;margin:0">${esc(message)}</p></div>`);
}

function withParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.toString();
}

/** Vercel parses JSON and form bodies into req.body; accept a string too. */
function bodyOf(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return Object.fromEntries(new URLSearchParams(b)); }
  }
  return b;
}

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  return Object.fromEntries(new URL(req.url, 'http://x').searchParams);
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

// ─── Default access check ─────────────────────────────────────────────────────

/**
 * Confirm the session belongs to someone allowed into WorkSpace, with a
 * profile — the same checks the local connector's `me()` makes. Rules would
 * refuse them anyway; this gives a clear message on the Connect page instead
 * of a connector that fails on every call.
 */
async function defaultCheckAccess(refreshToken, env, exchange) {
  const session = new ServerSession(refreshToken, { apiKey: firebaseConfig(env).apiKey, exchange });
  const me = await workspaceFor(session, env).me();
  return { uid: me.uid, email: me.email, name: me.name };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {typeof exchangeRefreshToken} [deps.exchange]  - Firebase securetoken exchange
 * @param {(rt: string, env: object, exchange: Function) => Promise<{uid: string, email: string, name: string}>} [deps.checkAccess]
 */
export function createOAuthHandler({ env = process.env, exchange = exchangeRefreshToken, checkAccess = defaultCheckAccess } = {}) {
  const extraRedirects = (env.MCP_EXTRA_REDIRECT_URIS || '').split(',').map((s) => s.trim()).filter(Boolean);

  const ops = {
    'resource-metadata': (req, res) => json(res, 200, resourceMetadata(publicOrigin(req, env))),
    'as-metadata': (req, res) => json(res, 200, authServerMetadata(publicOrigin(req, env))),

    /** RFC 7591. The client_id *is* the sealed registration, so nothing is stored. */
    register(req, res, secret) {
      if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request' });
      const b = bodyOf(req);
      const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
      if (!uris.length || uris.length > 10 || !uris.every((u) => isAllowedRedirect(u, extraRedirects))) {
        return json(res, 400, {
          error: 'invalid_redirect_uri',
          error_description: `Only ${CLAUDE_CALLBACK} and loopback http://localhost|127.0.0.1:<port>/callback are accepted.`,
        });
      }
      const clientName = String(b.client_name || 'Claude').slice(0, 100);
      const clientId = seal(secret, 'client', { redirect_uris: uris, client_name: clientName });
      return json(res, 201, {
        client_id: clientId,
        client_id_issued_at: nowSeconds(),
        client_name: clientName,
        redirect_uris: uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      });
    },

    /** Validate, then hand over to the sign-in page with the request sealed. */
    authorize(req, res, secret) {
      const q = queryOf(req);
      let client;
      try {
        client = unseal(secret, 'client', first(q.client_id));
      } catch {
        return page(res, 400, 'Unknown connector', 'This sign-in link is not from a registered Claude connector. Start again from Claude → Settings → Connectors.');
      }
      const redirectUri = first(q.redirect_uri) || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
      if (!redirectMatches(client.redirect_uris, redirectUri)) {
        return page(res, 400, 'Invalid redirect', 'The return address in this sign-in link does not belong to the connector.');
      }
      const state = first(q.state);
      const fail = (error, description) => redirect(res, withParams(redirectUri, { error, error_description: description, state }));
      if (first(q.response_type) !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.');
      if (first(q.code_challenge_method) !== 'S256' || !first(q.code_challenge)) {
        return fail('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
      }
      const authreq = seal(secret, 'authreq', {
        client_id: first(q.client_id),
        client_name: client.client_name,
        redirect_uri: redirectUri,
        code_challenge: first(q.code_challenge),
        state: state ?? null,
        scope: first(q.scope) ?? null,
        resource: first(q.resource) ?? null,
      }, AUTHREQ_TTL);
      return redirect(res, `${publicOrigin(req, env)}/connect/claude?authreq=${encodeURIComponent(authreq)}`);
    },

    /** What the Connect page shows: who is asking, and where the code goes. */
    describe(req, res, secret) {
      try {
        const a = unseal(secret, 'authreq', first(queryOf(req).authreq));
        const u = new URL(a.redirect_uri);
        return json(res, 200, {
          clientName: a.client_name,
          redirectHost: u.host,
          loopback: isLoopback(u),
          expiresInSeconds: Math.max(0, a.exp - nowSeconds()),
        });
      } catch {
        return json(res, 400, { error: 'expired', error_description: 'This sign-in link has expired. Start again from Claude.' });
      }
    },

    /** The employee clicked Connect: check their session, mint a one-time code. */
    async approve(req, res, secret) {
      if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request' });
      const b = bodyOf(req);
      let a;
      try {
        a = unseal(secret, 'authreq', b.authreq);
      } catch {
        return page(res, 400, 'Link expired', 'This sign-in link has expired. Go back to Claude and click Connect again.');
      }
      const rt = typeof b.refresh_token === 'string' ? b.refresh_token : '';
      if (!rt || rt.length > 4096) return page(res, 400, 'Not signed in', 'Sign in to WorkSpace first, then click Connect Claude.');
      let who;
      try {
        who = await checkAccess(rt, env, exchange);
      } catch (err) {
        const msg = err instanceof NotSignedInError
          ? 'Your WorkSpace sign-in could not be verified. Sign out and in again, then retry.'
          : err?.message || 'Your account could not be checked.';
        return page(res, 403, 'Could not connect', msg);
      }
      const code = seal(secret, 'code', {
        rt, uid: who.uid, email: who.email,
        client_id: a.client_id, redirect_uri: a.redirect_uri,
        code_challenge: a.code_challenge, scope: a.scope,
      }, CODE_TTL);
      return redirect(res, withParams(a.redirect_uri, { code, state: a.state, iss: publicOrigin(req, env) }));
    },

    /** The employee clicked Cancel. */
    deny(req, res, secret) {
      const b = { ...queryOf(req), ...bodyOf(req) };
      try {
        const a = unseal(secret, 'authreq', first(b.authreq));
        return redirect(res, withParams(a.redirect_uri, { error: 'access_denied', state: a.state }));
      } catch {
        return page(res, 400, 'Link expired', 'Nothing was connected. You can close this tab.');
      }
    },

    async token(req, res, secret) {
      if (req.method !== 'POST') return json(res, 405, { error: 'invalid_request' });
      const b = bodyOf(req);
      const grant = b.grant_type;
      const issue = (p) => json(res, 200, {
        access_token: seal(secret, 'access', { rt: p.rt, uid: p.uid, email: p.email, client_id: p.client_id }, ACCESS_TTL),
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        refresh_token: seal(secret, 'refresh', { rt: p.rt, uid: p.uid, email: p.email, client_id: p.client_id, scope: p.scope }, REFRESH_TTL),
        ...(p.scope ? { scope: p.scope } : {}),
      });
      const invalidGrant = (d) => json(res, 400, { error: 'invalid_grant', error_description: d });

      if (grant === 'authorization_code') {
        let c;
        try { c = unseal(secret, 'code', b.code); } catch { return invalidGrant('Code is invalid or expired.'); }
        if (b.client_id && b.client_id !== c.client_id) return invalidGrant('Code was issued to another client.');
        if (b.redirect_uri && b.redirect_uri !== c.redirect_uri) return invalidGrant('redirect_uri does not match.');
        if (!verifyPkce(b.code_verifier, c.code_challenge)) return invalidGrant('PKCE verification failed.');
        return issue(c);
      }

      if (grant === 'refresh_token') {
        let r;
        try { r = unseal(secret, 'refresh', b.refresh_token); } catch { return invalidGrant('Refresh token is invalid or expired.'); }
        if (b.client_id && b.client_id !== r.client_id) return invalidGrant('Refresh token was issued to another client.');
        // Prove the Firebase session is still alive (revokeRefreshTokens,
        // disabled user, deleted user) before handing out another hour.
        let t;
        try {
          t = await exchange(firebaseConfig(env).apiKey, r.rt);
        } catch (err) {
          if (err instanceof NotSignedInError) return invalidGrant('WorkSpace session was revoked. Connect again.');
          throw err;
        }
        // r.uid is the *effective* uid (user_email_map), so compare the sign-in
        // email, which is what me() stored.
        if ((decodeJwtPayload(t.idToken).email ?? '') !== r.email) {
          return invalidGrant('Session no longer matches this account.');
        }
        return issue({ ...r, rt: t.refreshToken || r.rt });
      }

      return json(res, 400, { error: 'unsupported_grant_type' });
    },
  };

  return async function oauthHandler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const op = first(queryOf(req).op);
    const fn = ops[op];
    if (!fn) return json(res, 404, { error: 'not_found' });
    try {
      const secret = op === 'resource-metadata' || op === 'as-metadata' ? null : getSecret(env);
      return await fn(req, res, secret);
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error('[oauth]', err.message);
        return json(res, 503, { error: 'temporarily_unavailable', error_description: 'Connector is not configured on the server yet.' });
      }
      if (err instanceof SealError) return json(res, 400, { error: 'invalid_request' });
      console.error(`[oauth] ${op}:`, err);
      return json(res, 500, { error: 'server_error' });
    }
  };
}
