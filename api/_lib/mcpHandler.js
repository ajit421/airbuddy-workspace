/**
 * mcpHandler.js — the hosted AirBuddy WorkSpace connector (Streamable HTTP).
 *
 * The same tools, permission checks and no-removal guard as the local
 * `airbuddy-mcp` (mcp/src): registerTools() and WorkspaceApi are imported, not
 * copied. Stateless: every request builds a server for the employee whose
 * sealed access token it carries, answers, and is thrown away — which is what a
 * serverless function wants, and means no MCP session lives on the server.
 *
 * No or bad token → 401 with `WWW-Authenticate: Bearer resource_metadata=...`.
 * That exact response is how Claude discovers it must sign the employee in
 * (it ignores the header on any other status).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { NotSignedInError, exchangeRefreshToken } from '../../mcp/src/session.js';
import { SERVER_INSTRUCTIONS, registerTools } from '../../mcp/src/tools.js';
import { ServerSession, firebaseConfig, workspaceFor } from './firebaseSession.js';
import { publicOrigin, resourceMetadataUrl } from './oauth.js';
import { ConfigError, SealError, getSecret, unseal } from './seal.js';

const VERSION = '0.3.0';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120; // per employee per minute, per warm instance
const rate = new Map();

function limited(uid) {
  const now = Date.now();
  const r = rate.get(uid);
  if (!r || now - r.start > RATE_WINDOW_MS) {
    rate.set(uid, { start: now, n: 1 });
    if (rate.size > 1000) rate.delete(rate.keys().next().value);
    return false;
  }
  return ++r.n > RATE_MAX;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-protocol-version, mcp-session-id, last-event-id');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, mcp-session-id');
}

function unauthorized(res, origin, error) {
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate',
    `Bearer resource_metadata="${resourceMetadataUrl(origin)}"${error ? `, error="${error}"` : ''}`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: error || 'unauthorized', error_description: 'Connect AirBuddy WorkSpace in Claude → Settings → Connectors.' }));
}

/**
 * @param {object} [deps]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {typeof exchangeRefreshToken} [deps.exchange]
 */
export function createMcpHandler({ env = process.env, exchange = exchangeRefreshToken } = {}) {
  return async function mcpHandler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    const origin = publicOrigin(req, env);

    let secret;
    try {
      secret = getSecret(env);
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      console.error('[mcp]', err.message);
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: 'Connector is not configured on the server yet.' }));
    }

    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!m) return unauthorized(res, origin);
    let token;
    try {
      token = unseal(secret, 'access', m[1]);
    } catch (err) {
      if (err instanceof SealError) return unauthorized(res, origin, 'invalid_token');
      throw err;
    }

    const session = new ServerSession(token.rt, { apiKey: firebaseConfig(env).apiKey, exchange });
    try {
      await session.getIdToken(); // revoked session → 401 → Claude refreshes → invalid_grant → reconnect
    } catch (err) {
      if (err instanceof NotSignedInError) return unauthorized(res, origin, 'invalid_token');
      throw err;
    }
    if (limited(token.uid)) {
      res.statusCode = 429;
      res.setHeader('Retry-After', '60');
      return res.end(JSON.stringify({ error: 'Too many requests — slow down for a minute.' }));
    }

    const server = new McpServer({ name: 'airbuddy-workspace', version: VERSION }, { instructions: SERVER_INSTRUCTIONS });
    registerTools(server, workspaceFor(session, env));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
      }
    }
  };
}
