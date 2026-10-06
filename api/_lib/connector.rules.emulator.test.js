/**
 * The hosted connector, end to end over HTTP, as an EMPLOYEE, against the real
 * firestore.rules in the Firestore emulator. Proves the HTTP + token layer
 * hands each call the employee's own identity, so the rules (not this server)
 * decide what they can do.
 *
 * Skipped unless FIRESTORE_EMULATOR_HOST is set:
 *   npx firebase-tools emulators:exec --only firestore --project demo-airbuddy "npx vitest run api/_lib/connector.rules.emulator.test.js"
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FirestoreClient, createWrite } from '../../mcp/src/firestore.js';
import { _clearIdTokenCache } from './firebaseSession.js';
import { createLocalServer } from './localServer.js';
import { createMcpHandler } from './mcpHandler.js';
import { createOAuthHandler } from './oauth.js';
import { seal } from './seal.js';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-airbuddy';
const SECRET = 'emulator-secret-'.padEnd(48, 'x');
const env = { MCP_TOKEN_SECRET: SECRET, FIREBASE_PROJECT_ID: PROJECT, FIREBASE_WEB_API_KEY: 'k', FIRESTORE_EMULATOR_HOST: HOST };

/** Unsigned JWT — the emulator reads claims without verifying. */
function fakeIdToken(uid, email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT,
    user_id: uid, sub: uid, email, email_verified: true, iat: now, exp: now + 3600,
    firebase: { sign_in_provider: 'google.com' },
  })}.`;
}

// The "Firebase refresh token" in these tests is just "uid|email".
async function exchange(_k, rt) {
  const [uid, email] = rt.split('|');
  return { idToken: fakeIdToken(uid, email), refreshToken: rt, expiresAt: Date.now() + 3600_000 };
}
const accessFor = (uid, email) => seal(SECRET, 'access', { rt: `${uid}|${email}`, uid, email, client_id: 'c' }, 600);

const owner = HOST && new FirestoreClient({ projectId: PROJECT, getIdToken: async () => 'owner', emulatorHost: HOST });

const SEED = {
  'users/u1': { uid: 'u1', name: 'Ajit', email: 'ajit@airbuddy.in', role: 'employee' },
  'users/lead': { uid: 'lead', name: 'Lead', email: 'lead@airbuddy.in', role: 'employee', permissions: { 'roadmap.edit': true } },
  'roadmapNodes/root': {
    title: 'Drone Motor', status: 'pending', assignedTo: [], createdBy: 'lead', parentId: null, path: 'root',
    ancestorIds: [], depth: 0, order: 0, isArchived: false, progress: 0, childCount: 1, childCompletedCount: 0,
    workPartners: [], workPartnerUids: [],
  },
  'roadmapNodes/n1': {
    title: 'Wing test', status: 'pending', assignedTo: ['u1'], createdBy: 'lead', parentId: 'root', path: 'root/n1',
    ancestorIds: ['root'], depth: 1, order: 0, isArchived: false, progress: 0, childCount: 0, childCompletedCount: 0,
    workPartners: [], workPartnerUids: [],
  },
};

describe.skipIf(!HOST)('hosted connector vs firestore.rules (employee, emulator)', () => {
  let server;
  let base;
  beforeAll(async () => {
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await owner.commit(Object.entries(SEED).map(([p, d]) => createWrite(owner.docName(p), d)));
    _clearIdTokenCache();
    server = createLocalServer({ oauth: createOAuthHandler({ env, exchange }), mcp: createMcpHandler({ env, exchange }) });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  const call = async (token, name, args = {}) => {
    const r = await fetch(`${base}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    expect(r.status).toBe(200);
    const { result } = await r.json();
    return { isError: Boolean(result.isError), text: result.content[0].text };
  };

  it('whoami and list_my_work act as the employee who connected', async () => {
    const t = accessFor('u1', 'ajit@airbuddy.in');
    const me = JSON.parse((await call(t, 'whoami')).text);
    expect(me).toMatchObject({ uid: 'u1', role: 'employee', permissions: [] });
    const work = JSON.parse((await call(t, 'list_my_work')).text);
    expect(work.items.map((i) => i.id)).toEqual(['n1']);
  });

  it('an employee can update their own milestone, and is refused a permission they lack', async () => {
    const t = accessFor('u1', 'ajit@airbuddy.in');
    const upd = await call(t, 'update_progress', { id: 'n1', progress: 40 });
    expect(upd.isError).toBe(false);
    expect((await owner.get('roadmapNodes/n1')).progress).toBe(40);
    const denied = await call(t, 'create_milestone', { title: 'X' });
    expect(denied).toMatchObject({ isError: true });
    expect(denied.text).toMatch(/roadmap\.edit/);
  });

  it('an employee granted roadmap.edit can create a milestone through the hosted connector', async () => {
    const t = accessFor('lead', 'lead@airbuddy.in');
    const r = await call(t, 'create_milestone', { title: 'Prop test', parent_id: 'root' });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text).depth).toBe(1);
  });

  it('somebody else on the same server cannot reach the first employee\'s private task', async () => {
    await owner.commit([createWrite(owner.docName('tasks/private1'), {
      title: 'Mine only', assignedTo: ['u1'], createdBy: 'u1', isAdminTask: false, status: 'pending', progress: 0,
    })]);
    const lead = accessFor('lead', 'lead@airbuddy.in');
    const r = await call(lead, 'get_work_item', { id: 'private1', kind: 'task' });
    expect(r.isError).toBe(true);
  });
});
