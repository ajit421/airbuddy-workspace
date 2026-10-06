/**
 * localServer.js — run the hosted connector's two functions on plain Node,
 * the way Vercel would: parsed req.body / req.query, and the same routes as
 * the rewrites in vercel.json. Used by the tests and by `npm run dev:connector`.
 * Not deployed (api/_lib is ignored as a function by Vercel).
 */

import http from 'node:http';

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

/**
 * Same routing as vercel.json.
 * @returns {{fn: 'oauth'|'mcp', op?: string}|null}
 */
export function route(pathname) {
  if (pathname.startsWith('/.well-known/oauth-protected-resource')) return { fn: 'oauth', op: 'resource-metadata' };
  if (pathname.startsWith('/.well-known/oauth-authorization-server')) return { fn: 'oauth', op: 'as-metadata' };
  const m = /^\/api\/oauth\/([a-z-]+)\/?$/.exec(pathname);
  if (m) return { fn: 'oauth', op: m[1] };
  if (pathname === '/api/oauth') return { fn: 'oauth' };
  if (pathname === '/api/mcp' || pathname === '/api/mcp/') return { fn: 'mcp' };
  return null;
}

/**
 * @param {{oauth: Function, mcp: Function}} handlers
 * @returns {http.Server}
 */
export function createLocalServer({ oauth, mcp }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      const r = route(url.pathname);
      if (!r) {
        res.statusCode = 404;
        return res.end('not found');
      }
      req.query = Object.fromEntries(url.searchParams);
      if (r.op) req.query.op = r.op;
      req.body = await readBody(req);
      await (r.fn === 'mcp' ? mcp : oauth)(req, res);
    } catch (err) {
      console.error('[localServer]', err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  });
}
