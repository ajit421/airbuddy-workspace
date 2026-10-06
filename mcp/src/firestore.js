/**
 * firestore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * A minimal Firestore REST client that authenticates as the signed-in
 * employee, never as a service account.
 *
 * WHY REST WITH THE USER'S ID TOKEN — NOT firebase-admin:
 *   firestore.rules is the only real authorization layer in this project.
 *   The Firestore REST API, called with `Authorization: Bearer <Firebase ID
 *   token>`, evaluates those rules exactly as the browser SDK does — so
 *   getEffectiveUid(), isEmailAllowed(), the field-scoped task rules and the
 *   roadmapNodes carve-outs all apply here unchanged. The Admin SDK would
 *   bypass every one of them and leave this package to re-implement 600 lines
 *   of rules by hand. Do not add it.
 *
 * WHAT IS HERE:
 *   - encodeValue / decodeValue: JS <-> Firestore typed-value JSON
 *   - transforms: serverTimestamp / arrayUnion / increment sentinels
 *   - updateWrite / createWrite: commit-write builders whose updateMask lists
 *     exactly the fields passed — that is what rules see as affectedKeys(), so
 *     a write never carries a key the caller did not ask for.
 *   - FirestoreClient: get / query / commit over fetch.
 *   - assertNoRemoval: the package is read + write only. commit() refuses any
 *     write that deletes a document, deletes a field, or removes array
 *     elements — so no tool, now or later, can remove anything.
 *
 * Pure apart from FirestoreClient, so the codec and builders are unit-tested.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Value codec ──────────────────────────────────────────────────────────────

/**
 * Encode a JS value as a Firestore REST `Value`.
 * Integers become integerValue (Firestore keeps them as int64), so `progress`
 * written here compares equal to `progress` written by the web SDK.
 *
 * @param {unknown} v
 * @returns {object}
 */
export function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new TypeError(`[firestore] encodeValue: unsupported type ${typeof v}`);
}

/**
 * Encode a plain object's own enumerable keys. `undefined` values are dropped
 * rather than written as null — the same rule the web services follow, because
 * a present-but-null key still counts in affectedKeys().
 *
 * @param {object} obj
 * @returns {object}
 */
export function encodeFields(obj) {
  const fields = {};
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    fields[k] = encodeValue(val);
  }
  return fields;
}

/**
 * Decode a Firestore REST `Value` to JS. Timestamps come back as Date.
 *
 * @param {object} value
 * @returns {unknown}
 */
export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('referenceValue' in value) return value.referenceValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('geoPointValue' in value) return { ...value.geoPointValue };
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

/** @param {object} fields @returns {object} */
export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

/**
 * Decode a REST `Document` into `{ id, _path, _updateTime, ...fields }`.
 * `_updateTime` is kept so read-modify-write callers can use it as a
 * precondition — the REST equivalent of the web SDK's runTransaction.
 *
 * @param {object} doc
 * @returns {object}
 */
export function decodeDocument(doc) {
  const relPath = doc.name.split('/documents/')[1] ?? doc.name;
  return {
    id: relPath.split('/').pop(),
    _path: relPath,
    _updateTime: doc.updateTime ?? null,
    ...decodeFields(doc.fields ?? {}),
  };
}

// ─── Transforms (sentinels) ───────────────────────────────────────────────────

/** serverTimestamp() — the project rule is never `new Date()` for updatedAt. */
export const serverTimestamp = (fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });

/** arrayUnion() — atomic append, so concurrent adds from two people both land. */
export const arrayUnion = (fieldPath, ...values) => ({
  fieldPath,
  appendMissingElements: { values: values.map(encodeValue) },
});

// There is deliberately no arrayRemove(): see assertNoRemoval below.

/** increment() */
export const increment = (fieldPath, n) => ({ fieldPath, increment: encodeValue(n) });

// ─── No-removal guard ─────────────────────────────────────────────────────────

/** Thrown when a write would delete or remove something. */
export class RemovalNotAllowedError extends Error {
  constructor(what) {
    super(`The AirBuddy connector is read and write only — it never deletes or removes anything (${what}). Do this in the web app instead if you really mean it.`);
    this.name = 'RemovalNotAllowedError';
  }
}

/**
 * Reject any write that removes data. Three ways a Firestore REST write can:
 *   - a `delete` write (whole document)
 *   - an updateMask path with no value in `fields` (deletes that field)
 *   - a `removeAllFromArray` transform
 * Overwriting a value (including unticking a checklist item) is still a write.
 *
 * @param {object[]} writes
 */
export function assertNoRemoval(writes) {
  for (const w of writes) {
    if (w.delete) throw new RemovalNotAllowedError(`delete ${w.delete.split('/documents/').pop()}`);
    const fields = w.update?.fields ?? {};
    for (const p of w.updateMask?.fieldPaths ?? []) {
      if (!(p.split('.')[0] in fields)) throw new RemovalNotAllowedError(`delete field ${p}`);
    }
    for (const t of w.updateTransforms ?? []) {
      if (t.removeAllFromArray) throw new RemovalNotAllowedError(`remove from ${t.fieldPath}`);
    }
  }
}

// ─── Write builders ───────────────────────────────────────────────────────────

/**
 * Generate a 20-character auto-ID, the same alphabet and length the web SDK's
 * doc(collection(...)) uses.
 * @returns {string}
 */
export function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

/**
 * An update of an existing document touching exactly `fields` plus whatever
 * the transforms name. The document must exist (an update must never quietly
 * create a stray document at a mis-routed path).
 *
 * @param {string} docName    - Full resource name (client.docName(path))
 * @param {object} fields     - Plain values to set
 * @param {object} [opts]
 * @param {object[]} [opts.transforms]
 * @param {string}   [opts.updateTime] - Fail with FAILED_PRECONDITION if the doc changed since
 * @returns {object} Write
 */
export function updateWrite(docName, fields, { transforms = [], updateTime } = {}) {
  const encoded = encodeFields(fields);
  return {
    update: { name: docName, fields: encoded },
    updateMask: { fieldPaths: Object.keys(encoded) },
    ...(transforms.length ? { updateTransforms: transforms } : {}),
    currentDocument: updateTime ? { updateTime } : { exists: true },
  };
}

/**
 * Create a new document; fails if it already exists.
 *
 * @param {string} docName
 * @param {object} fields
 * @param {object[]} [transforms]
 * @returns {object} Write
 */
export function createWrite(docName, fields, transforms = []) {
  return {
    update: { name: docName, fields: encodeFields(fields) },
    ...(transforms.length ? { updateTransforms: transforms } : {}),
    currentDocument: { exists: false },
  };
}

// ─── Query filters ────────────────────────────────────────────────────────────

const OPS = {
  '==': 'EQUAL',
  'array-contains': 'ARRAY_CONTAINS',
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
  '>=': 'GREATER_THAN_OR_EQUAL',
};

/**
 * Build a structuredQuery `where` from [field, op, value] triples (ANDed).
 *
 * @param {Array<[string, string, unknown]>} clauses
 * @returns {object|undefined}
 */
export function buildWhere(clauses) {
  const filters = clauses.map(([field, op, value]) => {
    if (!OPS[op]) throw new Error(`[firestore] unsupported operator ${op}`);
    // `where(f, '==', null)` is a unaryFilter in the REST API — a fieldFilter
    // with nullValue matches nothing, which made the roadmap root look empty.
    if (op === '==' && value === null) {
      return { unaryFilter: { field: { fieldPath: field }, op: 'IS_NULL' } };
    }
    return { fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: encodeValue(value) } };
  });
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { compositeFilter: { op: 'AND', filters } };
}

// ─── Client ───────────────────────────────────────────────────────────────────

/** Error carrying the Firestore status (PERMISSION_DENIED, NOT_FOUND, ...). */
export class FirestoreError extends Error {
  constructor(message, status, httpStatus) {
    super(message);
    this.name = 'FirestoreError';
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

export class FirestoreClient {
  /**
   * @param {object} opts
   * @param {string} opts.projectId
   * @param {() => Promise<string>} opts.getIdToken
   * @param {string} [opts.database]
   * @param {typeof fetch} [opts.fetch]
   */
  constructor({ projectId, getIdToken, database = '(default)', fetch: fetchImpl = globalThis.fetch, emulatorHost }) {
    this.root = `projects/${projectId}/databases/${database}/documents`;
    // emulatorHost (e.g. 127.0.0.1:8080) is for rules.emulator.test.js only —
    // the emulator evaluates the real firestore.rules against unsigned tokens.
    this.base = emulatorHost
      ? `http://${emulatorHost}/v1/${this.root}`
      : `https://firestore.googleapis.com/v1/${this.root}`;
    this.getIdToken = getIdToken;
    this.fetch = fetchImpl;
  }

  /** Full resource name for a relative path like `tasks/abc`. */
  docName(path) {
    return `${this.root}/${path}`;
  }

  async #request(method, url, body) {
    const token = await this.getIdToken();
    const res = await this.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = Array.isArray(json) ? json[0]?.error : json.error;
      throw new FirestoreError(err?.message ?? `HTTP ${res.status}`, err?.status ?? 'UNKNOWN', res.status);
    }
    return json;
  }

  /**
   * Read one document. Returns null when it does not exist.
   * Note: for `tasks/{id}` a missing document comes back as PERMISSION_DENIED
   * for a non-admin, not NOT_FOUND — the read rule dereferences resource.data,
   * which fails on a missing doc. Callers resolving an unknown id should try
   * `roadmapNodes` (readable by everyone) first.
   *
   * @param {string} path
   * @returns {Promise<object|null>}
   */
  async get(path) {
    try {
      return decodeDocument(await this.#request('GET', `${this.base}/${path}`));
    } catch (err) {
      if (err instanceof FirestoreError && err.status === 'NOT_FOUND') return null;
      throw err;
    }
  }

  /**
   * Run a structured query.
   *
   * @param {object} q
   * @param {string}  q.collection       - collectionId
   * @param {string}  [q.parent]         - relative parent doc path for a subcollection
   * @param {boolean} [q.collectionGroup]
   * @param {Array<[string,string,unknown]>} [q.where]
   * @param {Array<[string,'asc'|'desc']>}  [q.orderBy]
   * @param {number}  [q.limit]
   * @returns {Promise<object[]>}
   */
  async query({ collection, parent, collectionGroup = false, where = [], orderBy = [], limit }) {
    const structuredQuery = {
      from: [{ collectionId: collection, ...(collectionGroup ? { allDescendants: true } : {}) }],
    };
    const w = buildWhere(where);
    if (w) structuredQuery.where = w;
    if (orderBy.length) {
      structuredQuery.orderBy = orderBy.map(([field, dir]) => ({
        field: { fieldPath: field },
        direction: dir === 'desc' ? 'DESCENDING' : 'ASCENDING',
      }));
    }
    if (limit) structuredQuery.limit = limit;

    const url = parent ? `${this.base}/${parent}:runQuery` : `${this.base}:runQuery`;
    const rows = await this.#request('POST', url, { structuredQuery });
    return rows.filter((r) => r.document).map((r) => decodeDocument(r.document));
  }

  /**
   * Commit writes atomically. Rules are evaluated for every write; one denial
   * fails the whole commit.
   *
   * @param {object[]} writes
   * @returns {Promise<object>}
   */
  async commit(writes) {
    assertNoRemoval(writes);
    return this.#request('POST', `${this.base}:commit`, { writes });
  }
}
