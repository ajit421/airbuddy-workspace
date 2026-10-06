/**
 * seal.js — stateless, encrypted tokens for the hosted Claude connector.
 * ─────────────────────────────────────────────────────────────────────────────
 * The hosted connector keeps no token database. Everything the OAuth flow has
 * to remember — the registered client, the pending authorization request, the
 * one-time code, the access and refresh tokens Claude holds — is a JSON payload
 * sealed with AES-256-GCM under one server secret, MCP_TOKEN_SECRET.
 *
 * The payload of the code, access and refresh tokens includes the employee's
 * Firebase refresh token, so sealing is encryption, not just signing: Claude
 * stores the sealed string and never sees the Firebase session inside it.
 *
 * Each sealed value is bound to its type (`typ`, also the GCM additional data),
 * so a client_id can never be replayed as an access token, a code as a refresh
 * token, and so on. A value with an `exp` (seconds since epoch) stops opening
 * after it.
 *
 * Rotating MCP_TOKEN_SECRET invalidates every outstanding token at once:
 * everybody reconnects. That is the emergency switch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** A sealed value that is malformed, tampered with, of the wrong type, or expired. */
export class SealError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SealError';
  }
}

/** The server is missing MCP_TOKEN_SECRET (or it is too short to be a real one). */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const keyCache = new Map();

function keyFor(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', secret, 'airbuddy-workspace-mcp', 'token-seal-v1', 32));
    keyCache.set(secret, key);
  }
  return key;
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
export function getSecret(env = process.env) {
  const s = env.MCP_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new ConfigError('MCP_TOKEN_SECRET is not set (or shorter than 32 characters) in this deployment.');
  }
  return s;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * @param {string} secret
 * @param {string} typ                 - what this value is: client | authreq | code | access | refresh
 * @param {object} payload
 * @param {number} [ttlSeconds]        - omit for a value that never expires (client_id)
 * @returns {string}
 */
export function seal(secret, typ, payload, ttlSeconds) {
  const body = { ...payload, typ };
  if (ttlSeconds) body.exp = nowSeconds() + ttlSeconds;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  cipher.setAAD(Buffer.from(`${VERSION}.${typ}`));
  const ct = Buffer.concat([cipher.update(JSON.stringify(body), 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url')}`;
}

/**
 * @param {string} secret
 * @param {string} typ     - the type the caller expects
 * @param {unknown} token
 * @returns {object} the payload
 * @throws {SealError}
 */
export function unseal(secret, typ, token) {
  if (typeof token !== 'string' || !token.startsWith(`${VERSION}.`) || token.length > 8192) {
    throw new SealError('malformed');
  }
  const raw = Buffer.from(token.slice(VERSION.length + 1), 'base64url');
  if (raw.length < 12 + 16 + 2) throw new SealError('malformed');
  let body;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${VERSION}.${typ}`));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const pt = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]);
    body = JSON.parse(pt.toString('utf8'));
  } catch {
    throw new SealError('invalid'); // wrong key, wrong type, or tampered
  }
  if (body.typ !== typ) throw new SealError('wrong type');
  if (body.exp && body.exp < nowSeconds()) throw new SealError('expired');
  return body;
}
