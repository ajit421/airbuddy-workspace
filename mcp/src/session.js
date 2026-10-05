/**
 * session.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Holds the signed-in employee's Firebase session on this computer.
 *
 * `airbuddy-mcp login` receives a Firebase *refresh token* from the web app's
 * /connect/claude page (see login.js) and stores it in
 * ~/.airbuddy-mcp/credentials.json. Every Firestore call then trades it for a
 * short-lived ID token at Google's Secure Token endpoint — the same exchange
 * the web SDK does silently in the browser.
 *
 * The refresh token is the employee's own Firebase session. It carries no
 * Google OAuth scope, so nothing here can trigger the "Google hasn't verified
 * this app" screen the team rolled back once already. To cut a machine off,
 * run `airbuddy-mcp logout`; an admin can revoke every session a person has
 * with the Admin SDK's revokeRefreshTokens(uid).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = process.env.AIRBUDDY_MCP_HOME || path.join(os.homedir(), '.airbuddy-mcp');
export const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');

/**
 * @typedef {object} Credentials
 * @property {string} refreshToken
 * @property {string} apiKey     - Firebase Web API key (public; also in the browser bundle)
 * @property {string} projectId
 * @property {string} [email]
 * @property {string} [appUrl]
 */

/** @returns {Credentials|null} */
export function loadCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {Credentials} creds */
export function saveCredentials(creds) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  // mode is honoured on macOS/Linux; on Windows the file inherits the user
  // profile's ACL, which already excludes other non-admin accounts.
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function deleteCredentials() {
  try {
    fs.unlinkSync(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode a JWT payload without verifying it. Only used to read our *own*
 * token's claims (uid, email) — Firestore verifies the signature on every call.
 * @param {string} jwt
 * @returns {object}
 */
export function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1];
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

/** Thrown when the stored session can no longer be refreshed. */
export class NotSignedInError extends Error {
  constructor(detail) {
    super(
      'Not signed in to AirBuddy WorkSpace on this computer' +
      (detail ? ` (${detail})` : '') +
      '. Run `airbuddy-mcp login` in a terminal, then try again.'
    );
    this.name = 'NotSignedInError';
  }
}

/**
 * Exchange a refresh token for an ID token.
 *
 * @param {string} apiKey
 * @param {string} refreshToken
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{idToken: string, refreshToken: string, expiresAt: number}>}
 */
export async function exchangeRefreshToken(apiKey, refreshToken, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // TOKEN_EXPIRED, USER_DISABLED, USER_NOT_FOUND, INVALID_REFRESH_TOKEN
    throw new NotSignedInError(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return {
    idToken: json.id_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + Number(json.expires_in) * 1000,
  };
}

export class Session {
  /** @param {Credentials|null} creds */
  constructor(creds) {
    this.creds = creds;
    this.cached = null; // { idToken, expiresAt }
    this.inflight = null;
  }

  get projectId() {
    return this.creds?.projectId;
  }

  /** @returns {Promise<string>} a valid ID token */
  async getIdToken() {
    if (!this.creds?.refreshToken) throw new NotSignedInError();
    if (this.cached && this.cached.expiresAt - 60_000 > Date.now()) return this.cached.idToken;
    // Collapse concurrent refreshes from parallel tool calls into one request.
    this.inflight ??= exchangeRefreshToken(this.creds.apiKey, this.creds.refreshToken)
      .then((t) => {
        this.cached = { idToken: t.idToken, expiresAt: t.expiresAt };
        if (t.refreshToken && t.refreshToken !== this.creds.refreshToken) {
          this.creds = { ...this.creds, refreshToken: t.refreshToken };
          saveCredentials(this.creds);
        }
        return t.idToken;
      })
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }

  /** @returns {Promise<{uid: string, email: string}>} Firebase Auth identity (not yet effective-uid mapped) */
  async getAuthIdentity() {
    const claims = decodeJwtPayload(await this.getIdToken());
    return { uid: claims.user_id ?? claims.sub, email: claims.email ?? '' };
  }
}
