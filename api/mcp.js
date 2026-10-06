/**
 * Vercel Serverless Function — the hosted AirBuddy WorkSpace connector for
 * Claude (claude.ai web, Desktop, mobile). Add it once as an organization
 * custom connector: https://<this deployment>/api/mcp
 *
 * Logic lives in _lib/mcpHandler.js; tools in mcp/src (shared with the local
 * airbuddy-mcp). Environment: MCP_TOKEN_SECRET (required), plus the
 * VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID the site already has.
 */
import { createMcpHandler } from './_lib/mcpHandler.js';

export default createMcpHandler();
