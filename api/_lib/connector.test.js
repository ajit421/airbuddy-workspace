import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { NotSignedInError } from '../../mcp/src/session.js';
import { _clearIdTokenCache } from './firebaseSession.js';
import { createLocalServer, route } from './localServer.js';
import { createMcpHandler } from './mcpHandler.js';
import {
  CLAUDE_CALLBACK, createOAuthHandler, isAllowedRedirect, redirectMatches, verifyPkce,
} from './oauth.js';
import { SealError, seal, unseal } from './seal.js';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const env = { MCP_TOKEN_SECRET: SECRET, VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_PROJECT_ID: 'demo' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (claims) => `${b64({ alg: 'none' })}.${b64(claims)}.`;

/** Stand-in for Google's securetoken exchange. 'revoked' is a dead session. */
async function exchange(_apiKey, rt) {
  if (rt === 'revoked') throw new NotSignedInError('TOKEN_EXPIRED');
  return { idToken: fakeJwt({ user_id: 'u1', email: 'ajit@airbuddy.in' }), refreshToken: rt, expiresAt: Date.now() + 3600_000 };
}
const checkAccess = async () => ({ uid: 'u1', email: 'ajit@airbuddy.in', name: 'Ajit' });

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

describe('redirect allowlist', () => {
  it("accepts exactly Claude's hosted callback and Claude Code's loopback on any port", () => {
    expect(isAllowedRedirect(CLAUDE_CALLBACK)).toBe(true);
    expect(isAllowedRedirect('http://localhost:3118/callback')).toBe(true);
    expect(isAllowedRedirect('http://127.0.0.1:54321/callback')).toBe(true);
  });

  it('refuses everything else', () => {
    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback/', 'https://claude.ai.evil.com/api/mcp/auth_callback',
      'https://evil.com/callback', 'http://claude.ai/api/mcp/auth_callback', 'http://localhost:3000/other',
      'https://localhost:3000/callback', 'http://user:pw@localhost:1/callback', 'http://localhost:1/callback?x=1',
      'javascript:alert(1)', '', null,
    ]) expect(isAllowedRedirect(uri), String(uri)).toBe(false);
    expect(isAllowedRedirect('https://example.com/cb', ['https://example.com/cb'])).toBe(true);
  });

  it('matches a registered loopback redirect on another port, nothing else loosely', () => {
    expect(redirectMatches(['http://localhost/callback'], 'http://localhost:4000/callback')).toBe(true);
    expect(redirectMatches(['http://localhost/callback'], 'http://127.0.0.1:4000/callback')).toBe(false);
    expect(redirectMatches([CLAUDE_CALLBACK], `${CLAUDE_CALLBACK}?x=1`)).toBe(false);
  });
});

describe('PKCE', () => {
  it('verifies S256 and rejects a wrong or malformed verifier', () => {
    const { verifier, challenge } = pkce();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(pkce().verifier, challenge)).toBe(false);
    expect(verifyPkce('short', challenge)).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
  });
});

describe('seal', () => {
  it('round-trips, and refuses the wrong type, a tampered value, another key, or an expired one', () => {
    const t = seal(SECRET, 'access', { rt: 'r', uid: 'u1' }, 60);
    expect(unseal(SECRET, 'access', t)).toMatchObject({ rt: 'r', uid: 'u1', typ: 'access' });
    expect(() => unseal(SECRET, 'refresh', t)).toThrow(SealError);
    expect(() => unseal(SECRET.replace('x', 'y'), 'access', t)).toThrow(SealError);
    const flipped = t.slice(0, -3) + (t.at(-3) === 'A' ? 'B' : 'A') + t.slice(-2);
    expect(() => unseal(SECRET, 'access', flipped)).toThrow(SealError);
    expect(() => unseal(SECRET, 'access', seal(SECRET, 'access', {}, -1))).toThrow(/expired/);
    expect(() => unseal(SECRET, 'access', 'nonsense')).toThrow(SealError);
  });

  it('hides the Firebase session from whoever holds the token', () => {
    const t = seal(SECRET, 'access', { rt: 'firebase-refresh-token-value' }, 60);
    expect(Buffer.from(t.slice(3), 'base64url').toString('latin1')).not.toContain('firebase-refresh-token-value');
  });
});

describe('local routing mirrors vercel.json', () => {
  it('maps discovery, oauth ops and mcp', () => {
    expect(route('/.well-known/oauth-protected-resource/api/mcp')).toEqual({ fn: 'oauth', op: 'resource-metadata' });
    expect(route('/.well-known/oauth-authorization-server')).toEqual({ fn: 'oauth', op: 'as-metadata' });
    expect(route('/api/oauth/token')).toEqual({ fn: 'oauth', op: 'token' });
    expect(route('/api/mcp')).toEqual({ fn: 'mcp' });
    expect(route('/dashboard')).toBeNull();
  });
});

// ─── The whole flow over HTTP ─────────────────────────────────────────────────

describe('hosted connector over HTTP', () => {
  let server;
  let base;
  beforeAll(async () => {
    _clearIdTokenCache();
    server = createLocalServer({
      oauth: createOAuthHandler({ env, exchange, checkAccess }),
      mcp: createMcpHandler({ env, exchange }),
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString(), redirect: 'manual' });
  const rpc = (token, method, params = {}, id = 1) => fetch(`${base}/api/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });

  /** register → authorize → describe → approve → token, as claude.ai does it. */
  async function connect({ rt = 'firebase-rt' } = {}) {
    const reg = await fetch(`${base}/api/oauth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CLAUDE_CALLBACK] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = await reg.json();
    const { verifier, challenge } = pkce();

    const auth = await fetch(`${base}/api/oauth/authorize?${new URLSearchParams({
      response_type: 'code', client_id, redirect_uri: CLAUDE_CALLBACK, state: 'st-1',
      code_challenge: challenge, code_challenge_method: 'S256',
    })}`, { redirect: 'manual' });
    expect(auth.status).toBe(302);
    const toPage = new URL(auth.headers.get('location'));
    expect(toPage.pathname).toBe('/connect/claude');
    const authreq = toPage.searchParams.get('authreq');

    const info = await (await fetch(`${base}/api/oauth/describe?authreq=${encodeURIComponent(authreq)}`)).json();
    expect(info).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai', loopback: false });

    const approve = await fetch(`${base}/api/oauth/approve`, form({ authreq, refresh_token: rt }));
    expect(approve.status).toBe(302);
    const back = new URL(approve.headers.get('location'));
    expect(`${back.origin}${back.pathname}`).toBe(CLAUDE_CALLBACK);
    expect(back.searchParams.get('state')).toBe('st-1');
    const code = back.searchParams.get('code');

    const wrong = await fetch(`${base}/api/oauth/token`, form({
      grant_type: 'authorization_code', code, client_id, redirect_uri: CLAUDE_CALLBACK, code_verifier: pkce().verifier,
    }));
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe('invalid_grant');

    const tok = await fetch(`${base}/api/oauth/token`, form({
      grant_type: 'authorization_code', code, client_id, redirect_uri: CLAUDE_CALLBACK, code_verifier: verifier,
    }));
    expect(tok.status).toBe(200);
    return { client_id, ...(await tok.json()) };
  }

  it('serves discovery metadata Claude can follow', async () => {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/api/mcp`)).json();
    expect(prm).toMatchObject({ resource: `${base}/api/mcp`, authorization_servers: [base] });
    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({
      issuer: base,
      registration_endpoint: `${base}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  });

  it('answers an unauthenticated MCP call with 401 + resource_metadata, which starts sign-in', async () => {
    const r = await rpc(null, 'tools/list');
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${base}/api/oauth/resource-metadata"`);
    const bad = await rpc('v1.garbage-garbage-garbage', 'tools/list');
    expect(bad.status).toBe(401);
    expect(bad.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('refuses to register any redirect that is not Claude', async () => {
    const r = await fetch(`${base}/api/oauth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://evil.com/callback'] }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_redirect_uri');
  });

  it('full connect: tokens work on /api/mcp, list the 17 tools, none destructive', async () => {
    const t = await connect();
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    expect(t.access_token).not.toContain('firebase-rt');

    const init = await rpc(t.access_token, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' },
    });
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe('airbuddy-workspace');

    const list = await rpc(t.access_token, 'tools/list', {}, 2);
    expect(list.status).toBe(200);
    const tools = (await list.json()).result.tools;
    expect(tools).toHaveLength(17);
    expect(tools.filter((x) => /delete|remove|archive/i.test(x.name) || x.annotations?.destructiveHint)).toEqual([]);
  });

  it('refresh works while the session lives, and is invalid_grant once it is revoked', async () => {
    const t = await connect();
    const ok = await fetch(`${base}/api/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: t.client_id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).access_token).toBeTruthy();

    const dead = await connect({ rt: 'revoked' }); // checkAccess is stubbed, so connect succeeds
    _clearIdTokenCache();
    expect((await rpc(dead.access_token, 'tools/list')).status).toBe(401);
    const r = await fetch(`${base}/api/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: dead.refresh_token }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('invalid_grant');
  });

  it('a code cannot be used by another client, and Cancel goes back to Claude with access_denied', async () => {
    const t = await connect();
    const other = await fetch(`${base}/api/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'someone-else' }));
    expect((await other.json()).error).toBe('invalid_grant');

    const authreq = seal(SECRET, 'authreq', { redirect_uri: CLAUDE_CALLBACK, state: 's' }, 60);
    const deny = await fetch(`${base}/api/oauth/deny`, form({ authreq }));
    expect(deny.status).toBe(302);
    expect(deny.headers.get('location')).toBe(`${CLAUDE_CALLBACK}?error=access_denied&state=s`);
  });

  it('a token sealed for something else is not an access token', async () => {
    const client = seal(SECRET, 'client', { redirect_uris: [CLAUDE_CALLBACK] });
    expect((await rpc(client, 'tools/list')).status).toBe(401);
  });

  it('without MCP_TOKEN_SECRET the server says it is not configured, instead of running open', async () => {
    const h = createOAuthHandler({ env: {}, exchange, checkAccess });
    const s = createLocalServer({ oauth: h, mcp: createMcpHandler({ env: {}, exchange }) });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${s.address().port}`;
    expect((await fetch(`${b}/api/oauth/register`, { method: 'POST' })).status).toBe(503);
    expect((await fetch(`${b}/api/mcp`, { method: 'POST' })).status).toBe(503);
    await new Promise((r) => s.close(r));
  });
});
