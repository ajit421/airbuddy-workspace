/**
 * permissions.rules.emulator.test.js — admin-granted permissions
 * (users/{uid}.permissions, src/utils/permissionCatalog.js) against the real
 * firestore.rules, as employees. Testing from an admin account proves nothing:
 * an admin passes every can(key).
 *
 * Skipped unless FIRESTORE_EMULATOR_HOST is set. Run with:
 *   npx firebase-tools emulators:exec --only firestore --project demo-airbuddy "npx vitest run src/services/permissions.rules.emulator.test.js"
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  FirestoreClient,
  FirestoreError,
  createWrite,
  updateWrite,
} from '../../mcp/src/firestore.js';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-airbuddy';

/** Unsigned JWT — accepted by the emulator, which reads claims without verifying. */
function fakeToken(uid, email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT,
    user_id: uid, sub: uid, email, email_verified: true, iat: now, exp: now + 3600,
    firebase: { sign_in_provider: 'google.com' },
  })}.`;
}

const clientAs = (uid, email) => {
  const token = fakeToken(uid, email);
  return new FirestoreClient({ projectId: PROJECT, getIdToken: async () => token, emulatorHost: HOST });
};

const owner = HOST && new FirestoreClient({ projectId: PROJECT, getIdToken: async () => 'owner', emulatorHost: HOST });

const SEED = {
  'users/plain':  { uid: 'plain', name: 'Plain', email: 'plain@airbuddy.in', role: 'employee' },
  'users/hr':     { uid: 'hr', name: 'HR', email: 'hr@airbuddy.in', role: 'employee',
                    permissions: { 'hrms.recruitment': true, 'hrms.attendance': true, 'hrms.leaves': true,
                                   'hrms.performance': true, 'kpi.edit': false } },
  'users/mgr':    { uid: 'mgr', name: 'Manager', email: 'mgr@airbuddy.in', role: 'employee',
                    permissions: { 'tasks.assign': true, 'tasks.viewAll': true, 'roadmap.edit': true,
                                   'kpi.edit': true, 'announcements.post': true } },
  'users/boss':   { uid: 'boss', name: 'Boss', email: 'boss@airbuddy.in', role: 'admin' },
  'users/boss/private/compensation': { salaryBase: 90000 },
  'users/plain/private/compensation': { salaryBase: 40000 },
  'candidates/c1': { name: 'Candidate', email: 'c@example.com', status: 'Applied' },
  'performances/p1': { uid: 'plain', score: 4 },
  'attendance/plain/records/r1': { date: '2026-10-01', punchIn: 'x' },
  'leaves/l1': { uid: 'plain', status: 'pending', type: 'casual' },
  'tasks/t1': { title: 'Someone else\'s', assignedTo: ['boss'], createdBy: 'boss', isAdminTask: true, status: 'pending' },
  'roadmapNodes/root': { title: 'Root', parentId: null, path: 'root', ancestorIds: [], depth: 0, order: 0,
                         isArchived: false, assignedTo: [], status: 'pending', progress: 0 },
};

const expectDenied = (p) => expect(p).rejects.toSatisfy(
  (e) => e instanceof FirestoreError && e.status === 'PERMISSION_DENIED');

describe.skipIf(!HOST)('admin-granted permissions vs firestore.rules (emulator)', () => {
  let plain, hr, mgr, boss;

  beforeAll(async () => {
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await owner.commit(Object.entries(SEED).map(([p, d]) => createWrite(owner.docName(p), d)));
    plain = clientAs('plain', 'plain@airbuddy.in');
    hr    = clientAs('hr', 'hr@airbuddy.in');
    mgr   = clientAs('mgr', 'mgr@airbuddy.in');
    boss  = clientAs('boss', 'boss@airbuddy.in');
  });

  // ── Phase 0: salary and self-granting ──────────────────────────────────────
  it('salary: only an admin can read or write users/{uid}/private', async () => {
    await expectDenied(plain.get('users/boss/private/compensation'));
    await expectDenied(plain.get('users/plain/private/compensation')); // not even their own
    await expectDenied(hr.get('users/plain/private/compensation'));    // HR permissions do not include pay
    await expectDenied(plain.commit([updateWrite(plain.docName('users/plain/private/compensation'), { salaryBase: 1e6 })]));
    expect((await boss.get('users/plain/private/compensation')).salaryBase).toBe(40000);
    await boss.commit([updateWrite(boss.docName('users/plain/private/compensation'), { salaryBase: 45000 })]);
  });

  it('an employee cannot grant themselves a permission', async () => {
    await expectDenied(plain.commit([updateWrite(plain.docName('users/plain'),
      { permissions: { 'hrms.recruitment': true } })]));
    await expectDenied(plain.commit([updateWrite(plain.docName('users/plain'), { viewScope: { mode: 'all' } })]));
    // Nor can someone with permissions widen them
    await expectDenied(mgr.commit([updateWrite(mgr.docName('users/mgr'),
      { permissions: { 'hrms.recruitment': true } })]));
  });

  it('an employee cannot grant a permission to someone else, even with every module permission', async () => {
    await expectDenied(mgr.commit([updateWrite(mgr.docName('users/plain'),
      { permissions: { 'tasks.viewAll': true } })]));
  });

  it('an admin can grant permissions', async () => {
    await boss.commit([updateWrite(boss.docName('users/plain'),
      { permissions: { 'hrms.directory': true }, permissionsUpdatedBy: 'boss' })]);
    expect((await plain.get('users/plain')).permissions['hrms.directory']).toBe(true);
    await boss.commit([updateWrite(boss.docName('users/plain'), { permissions: {} })]);
  });

  it('a new profile cannot arrive carrying permissions or salary', async () => {
    const fresh = clientAs('fresh', 'fresh@airbuddy.in');
    await expectDenied(fresh.commit([createWrite(fresh.docName('users/fresh'),
      { uid: 'fresh', email: 'fresh@airbuddy.in', role: 'employee', permissions: { 'tasks.viewAll': true } })]));
    await expectDenied(fresh.commit([createWrite(fresh.docName('users/fresh'),
      { uid: 'fresh', email: 'fresh@airbuddy.in', role: 'employee', salaryBase: 1 })]));
    await fresh.commit([createWrite(fresh.docName('users/fresh'),
      { uid: 'fresh', email: 'fresh@airbuddy.in', role: 'employee' })]);
  });

  // ── HRMS ───────────────────────────────────────────────────────────────────
  it('candidates: only hrms.recruitment can read or write', async () => {
    await expectDenied(plain.get('candidates/c1'));
    expect((await hr.get('candidates/c1')).name).toBe('Candidate');
    await hr.commit([updateWrite(hr.docName('candidates/c1'), { status: 'Interview' })]);
    await expectDenied(plain.commit([updateWrite(plain.docName('candidates/c1'), { status: 'Hired' })]));
  });

  it('attendance: own always, everyone with hrms.attendance', async () => {
    expect((await plain.get('attendance/plain/records/r1')).date).toBe('2026-10-01');
    expect((await hr.get('attendance/plain/records/r1')).date).toBe('2026-10-01');
    await expectDenied(mgr.get('attendance/plain/records/r1'));
  });

  it('leaves: hrms.leaves can see and approve', async () => {
    await expectDenied(mgr.get('leaves/l1'));
    await hr.commit([updateWrite(hr.docName('leaves/l1'), { status: 'approved' })]);
    await expectDenied(mgr.commit([updateWrite(mgr.docName('leaves/l1'), { status: 'rejected' })]));
  });

  it('performances: own always, everyone with hrms.performance', async () => {
    expect((await plain.get('performances/p1')).score).toBe(4);
    expect((await hr.get('performances/p1')).score).toBe(4);
    await expectDenied(mgr.get('performances/p1'));
    await expectDenied(plain.commit([createWrite(plain.docName('performances/p2'), { uid: 'plain', score: 5 })]));
    await hr.commit([createWrite(hr.docName('performances/p2'), { uid: 'plain', score: 5 })]);
  });

  // ── Tasks, KPI, roadmap, announcements ────────────────────────────────────
  it('tasks: tasks.viewAll reads anyone\'s task, others cannot', async () => {
    await expectDenied(plain.get('tasks/t1'));
    expect((await mgr.get('tasks/t1')).title).toBe('Someone else\'s');
    const list = await mgr.query({ collection: 'tasks' });
    expect(list.length).toBeGreaterThan(0);
  });

  it('tasks: tasks.assign may create an assigned task, a plain employee may not', async () => {
    const task = { title: 'Assigned', assignedTo: ['plain'], createdBy: 'mgr', isAdminTask: true, status: 'pending' };
    await mgr.commit([createWrite(mgr.docName('tasks/byMgr'), task)]);
    await expectDenied(plain.commit([createWrite(plain.docName('tasks/byPlain'), { ...task, createdBy: 'plain' })]));
  });

  it('kpi: kpi.edit can write, others cannot', async () => {
    await mgr.commit([createWrite(mgr.docName('kpi_clients/k1'), { name: 'Client' })]);
    await expectDenied(hr.commit([createWrite(hr.docName('kpi_clients/k2'), { name: 'Client' })]));
    expect((await plain.get('kpi_clients/k1')).name).toBe('Client'); // still readable by all
  });

  it('roadmap: roadmap.edit can create and edit structure, others cannot', async () => {
    const node = { title: 'Child', parentId: 'root', path: 'root/c', ancestorIds: ['root'], depth: 1,
                   order: 0, isArchived: false, assignedTo: [], status: 'pending', progress: 0 };
    await mgr.commit([createWrite(mgr.docName('roadmapNodes/c'), node)]);
    await mgr.commit([updateWrite(mgr.docName('roadmapNodes/c'), { title: 'Renamed', isArchived: true })]);
    await expectDenied(plain.commit([createWrite(plain.docName('roadmapNodes/d'), node)]));
    await expectDenied(plain.commit([updateWrite(plain.docName('roadmapNodes/c'), { title: 'Hijack' })]));
  });

  it('announcements: announcements.post can create, others cannot', async () => {
    const ann = { title: 'Hi', message: 'All hands', isRead: [] };
    await mgr.commit([createWrite(mgr.docName('announcements/a1'), ann)]);
    await expectDenied(plain.commit([createWrite(plain.docName('announcements/a2'), ann)]));
  });
});
