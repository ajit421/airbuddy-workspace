/**
 * firebaseSession.js — the employee's own Firebase session, server side.
 *
 * The hosted connector acts exactly as the local one does: every Firestore call
 * carries the employee's own Firebase ID token, so firestore.rules decide what
 * they can do. There is no firebase-admin and no service account here — adding
 * either would bypass every rule and make this file the authorization layer.
 *
 * ServerSession has the two methods WorkspaceApi and FirestoreClient need
 * (getIdToken, getAuthIdentity), like mcp/src/session.js, minus the
 * credentials file: the refresh token arrives sealed inside Claude's access
 * token on every request.
 */

import { createHash } from 'node:crypto';
import { FirestoreClient } from '../../mcp/src/firestore.js';
import { NotSignedInError, decodeJwtPayload, exchangeRefreshToken } from '../../mcp/src/session.js';
import { WorkspaceApi } from '../../mcp/src/workspace.js';

/** Firebase web config the browser bundle already exposes (public values). */
export function firebaseConfig(env = process.env) {
  return {
    apiKey: env.FIREBASE_WEB_API_KEY || env.VITE_FIREBASE_API_KEY,
    projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || 'workspace-airbuddy',
  };
}

/** Shown to Claude (and so the employee) when the Firebase session no longer works. */
export class ConnectorSignedOutError extends NotSignedInError {
  constructor() {
    super();
    this.message = 'Your WorkSpace connection has expired or was revoked. In Claude, open Settings → Connectors → AirBuddy WorkSpace and connect again.';
  }
}

// Warm-instance cache: one ID token exchange per employee per ~55 minutes
// instead of one per request. Keyed by a hash so the map never holds the
// refresh token itself.
const idTokenCache = new Map();
const MAX_CACHE = 500;

export class ServerSession {
  /**
   * @param {string} refreshToken
   * @param {{apiKey: string, exchange?: typeof exchangeRefreshToken}} opts
   */
  constructor(refreshToken, { apiKey, exchange = exchangeRefreshToken }) {
    this.refreshToken = refreshToken;
    this.apiKey = apiKey;
    this.exchange = exchange;
    this.cacheKey = createHash('sha256').update(refreshToken).digest('hex');
  }

  /** @returns {Promise<string>} */
  async getIdToken() {
    const hit = idTokenCache.get(this.cacheKey);
    if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.idToken;
    let t;
    try {
      t = await this.exchange(this.apiKey, this.refreshToken);
    } catch (err) {
      idTokenCache.delete(this.cacheKey);
      if (err instanceof NotSignedInError) throw new ConnectorSignedOutError();
      throw err;
    }
    if (idTokenCache.size >= MAX_CACHE) idTokenCache.delete(idTokenCache.keys().next().value);
    idTokenCache.set(this.cacheKey, { idToken: t.idToken, expiresAt: t.expiresAt });
    return t.idToken;
  }

  /** @returns {Promise<{uid: string, email: string}>} */
  async getAuthIdentity() {
    const claims = decodeJwtPayload(await this.getIdToken());
    return { uid: claims.user_id ?? claims.sub, email: claims.email ?? '' };
  }
}

/**
 * The same WorkspaceApi the local connector uses, acting as this employee.
 *
 * @param {ServerSession} session
 * @param {Record<string, string|undefined>} [env]
 */
export function workspaceFor(session, env = process.env) {
  const db = new FirestoreClient({
    projectId: firebaseConfig(env).projectId,
    getIdToken: () => session.getIdToken(),
    ...(env.FIRESTORE_EMULATOR_HOST ? { emulatorHost: env.FIRESTORE_EMULATOR_HOST } : {}),
  });
  return new WorkspaceApi(db, session);
}

/** Only for tests: forget cached ID tokens. */
export const _clearIdTokenCache = () => idTokenCache.clear();
