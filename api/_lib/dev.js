/**
 * Local run of the hosted Claude connector: `npm run dev:connector`.
 *
 * Serves /api/mcp, /api/oauth/* and the /.well-known/oauth-* discovery paths on
 * 127.0.0.1:3001. `npm run dev` proxies those paths here (vite.config.js), so
 * the sign-in page and the connector share http://localhost:5173 exactly as
 * they share one origin on Vercel. Talks to the LIVE Firestore as whoever
 * connects, like `npm run dev` does.
 *
 * Reads .env. Without MCP_TOKEN_SECRET a random one is made per run, so tokens
 * from a previous run stop working — fine for local testing.
 */

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createLocalServer } from './localServer.js';
import { createMcpHandler } from './mcpHandler.js';
import { createOAuthHandler } from './oauth.js';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.MCP_TOKEN_SECRET) {
  process.env.MCP_TOKEN_SECRET = randomBytes(32).toString('base64url');
  console.log('[dev:connector] MCP_TOKEN_SECRET not set: using a random one for this run.');
}
process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:5173';

const PORT = Number(process.env.CONNECTOR_PORT || 3001);
createLocalServer({ oauth: createOAuthHandler(), mcp: createMcpHandler() })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`[dev:connector] listening on 127.0.0.1:${PORT}`);
    console.log(`[dev:connector] MCP URL (through npm run dev): ${process.env.MCP_PUBLIC_ORIGIN}/api/mcp`);
  });
