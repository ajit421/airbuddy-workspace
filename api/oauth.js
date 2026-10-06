/**
 * Vercel Serverless Function — OAuth for the hosted Claude connector.
 *
 * One function, many endpoints, picked by ?op= (vercel.json rewrites
 * /api/oauth/<op> and the /.well-known/oauth-* discovery paths here):
 * resource-metadata, as-metadata, register, authorize, describe, approve,
 * deny, token. Logic lives in _lib/oauth.js.
 */
import { createOAuthHandler } from './_lib/oauth.js';

export default createOAuthHandler();
