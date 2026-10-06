/**
 * rules.emulator.test.js — every MCP write, as a non-admin, against the real
 * firestore.rules in the Firestore emulator.
 *
 * The unit tests prove the writes carry the right fields; only the rules
 * engine can prove those fields are *accepted* — the assignee and participant
 * carve-outs use hasOnly(), which fails a whole write for one stray key. An
 * admin account passes everything, so this is the only place the employee
 * paths are exercised.
 *
 * Skipped unless FIRESTORE_EMULATOR_HOST is set. Run with:
 *   npx firebase-tools emulators:exec --only firestore --project demo-airbuddy "npx vitest run mcp/src/rules.emulator.test.js"
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { FirestoreClient, FirestoreError, createWrite, updateWrite } from './firestore.js';
import { WorkspaceApi } from './workspace.js';

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

const owner = HOST && new FirestoreClient({ projectId: PROJECT, getIdToken: async () => 'owner', emulatorHost: HOST });

function apiAs(uid, email) {
  const token = fakeToken(uid, email);
  const db = new FirestoreClient({ projectId: PROJECT, getIdToken: async () => token, emulatorHost: HOST });
  return { db, api: new WorkspaceApi(db, { getAuthIdentity: async () => ({ uid, email }) }) };
}

const SEED = {
  'users/u1': { uid: 'u1', name: 'Ajit', email: 'ajit@airbuddy.in', role: 'employee' },
  'users/u2': { uid: 'u2', name: 'Archit Jain', email: 'archit@airbuddy.in', role: 'employee' },
  'users/boss': { uid: 'boss', name: 'Boss', email: 'boss@airbuddy.in', role: 'admin' },
  'users/lead': {
    uid: 'lead', name: 'Lead', email: 'lead@airbuddy.in', role: 'employee',
    permissions: { 'roadmap.edit': true, 'tasks.assign': true, 'tasks.viewAll': true },
  },
  'allowed_emails/alt@gmail.com': { status: 'approved' },
  'user_email_map/alt@gmail.com': { primaryUid: 'u1' },
  'roadmapNodes/root': {
    title: 'Drone Motor', status: 'in-progress', priority: 'high', assignedTo: [], createdBy: 'boss',
    parentId: null, path: 'root', ancestorIds: [], depth: 0, order: 0, isArchived: false,
    progress: 0, childCount: 1, childCompletedCount: 0, workPartners: [], workPartnerUids: [],
  },
  'roadmapNodes/n1': {
    title: 'Wing test', status: 'pending', priority: 'high', assignedTo: ['u1'], createdBy: 'boss',
    parentId: 'root', path: 'root/n1', ancestorIds: ['root'], depth: 1, order: 0, isArchived: false,
    progress: 0, childCount: 0, childCompletedCount: 0, workPartners: [], workPartnerUids: [],
  },
  'tasks/partnered': {
    title: 'CAD model', status: 'in-progress', progress: 30, priority: 'high', module: 'R&D',
    assignedTo: ['u2'], createdBy: 'boss', isAdminTask: true,
    workPartners: [{ uid: 'u1', name: 'Ajit' }], workPartnerUids: ['u1'],
    todos: [{ id: 'a', text: 'Draft', done: false, createdAt: '1', createdBy: 'u2', createdByName: 'Archit', completedAt: null, completedBy: null, completedByName: null }],
  },
  'tasks/mine': {
    title: 'Bench test', status: 'pending', progress: 0, priority: 'medium', module: 'R&D',
    assignedTo: ['u1'], createdBy: 'boss', isAdminTask: true, workPartners: [], workPartnerUids: [],
  },
};

const expectDenied = (p) => expect(p).rejects.toSatisfy(
  (e) => e instanceof FirestoreError && e.status === 'PERMISSION_DENIED');

describe.skipIf(!HOST)('MCP writes vs firestore.rules (employee, emulator)', () => {
  let ajit;
  beforeAll(async () => {
    await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await owner.commit(Object.entries(SEED).map(([p, d]) => createWrite(owner.docName(p), d)));
    ajit = apiAs('u1', 'ajit@airbuddy.in');
  });

  it('reads: identity, Dashboard list, roadmap', async () => {
    expect((await ajit.api.me()).role).toBe('employee');
    const work = await ajit.api.listWork();
    expect(work.items.map((i) => i.id).sort()).toEqual(['mine', 'n1', 'partnered']);
    expect((await ajit.api.browseRoadmap({ depth: 2 })).nodes[0].children[0].id).toBe('n1');
    expect((await ajit.api.getItem('partnered')).recentActivity).toEqual([]);
  });

  it('milestone assignee: progress, completion, extend — inside the carve-out', async () => {
    expect((await ajit.api.updateProgress({ id: 'n1', progress: 50 })).status).toBe('in-progress');
    expect((await ajit.api.extendDueDate({ id: 'n1', dueDate: '2026-12-01' })).extended).toBe(true);
    expect((await ajit.api.updateProgress({ id: 'n1', progress: 100, completionNote: 'done' })).status).toBe('completed');
    const events = await owner.query({ parent: 'roadmapNodes/n1', collection: 'events' });
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it('milestone participant: partners, checklist, timeline, comments', async () => {
    await ajit.api.addWorkPartner({ id: 'n1', person: 'archit' });
    await ajit.api.addTodo({ id: 'n1', text: 'Mount sensor' });
    const item = await ajit.api.setTodoDone({ id: 'n1', item: 'mount', done: true });
    expect(item.checklist[0].done).toBe(true);
    await ajit.api.postUpdate({ id: 'n1', message: 'Sensor mounted' });
    await ajit.api.commentOnMilestone({ id: 'n1', text: 'Looks good' });

    const node = await owner.get('roadmapNodes/n1');
    expect(node.workPartnerUids).toEqual(['u2']);
    expect((await owner.query({ parent: 'roadmapNodes/n1', collection: 'comments' }))).toHaveLength(1);
    // Bell entry is best-effort in code, so prove the rule accepted it.
    const bell = await owner.query({ parent: 'notifications/u2', collection: 'items' });
    expect(bell.map((n) => n.type)).toContain('partner_added');
  });

  it('task work partner: checklist and timeline yes, progress no', async () => {
    await ajit.api.setTodoDone({ id: 'partnered', item: 'draft', done: true });
    await ajit.api.postUpdate({ id: 'partnered', message: 'Reviewed the draft' });
    await expect(ajit.api.updateProgress({ id: 'partnered', progress: 60 })).rejects.toThrow(/can't update progress/);
    // and the rules agree, should the pre-check ever be wrong:
    await expectDenied(ajit.db.commit([updateWrite(ajit.db.docName('tasks/partnered'), { progress: 60 })]));
  });

  it('task assignee: progress yes, title no', async () => {
    expect((await ajit.api.updateProgress({ id: 'mine', progress: 60 })).progress).toBe(60);
    expect((await owner.get('tasks/mine')).updatedBy).toBeUndefined();
    await expectDenied(ajit.db.commit([updateWrite(ajit.db.docName('tasks/mine'), { title: 'x' })]));
  });

  it('personal task create; permission-gated tools refused', async () => {
    expect((await ajit.api.createPersonalTask({ title: 'Mine', dueDate: '2026-10-10' })).type).toBe('personal');
    await expect(ajit.api.createMilestone({ title: 'X' })).rejects.toThrow(/roadmap\.edit/);
    await expect(ajit.api.assignTask({ title: 'X', assignees: ['archit'] })).rejects.toThrow(/tasks\.assign/);
    // and the rules agree, should the pre-check ever be wrong:
    await expectDenied(ajit.db.commit([createWrite(ajit.db.docName('roadmapNodes/sneaky'), { title: 'X', isArchived: false })]));
  });

  it('employee granted roadmap.edit, tasks.assign and tasks.viewAll: accepted by can() in the rules', async () => {
    const lead = apiAs('lead', 'lead@airbuddy.in');
    const child = await lead.api.createMilestone({ title: 'Lead child', parentId: 'root', assignees: ['archit'] });
    expect(child.assignees).toEqual(['Archit Jain']);
    expect((await lead.api.updateMilestone({ id: child.id, title: 'Renamed', addAssignees: ['ajit'] })).title).toBe('Renamed');
    expect((await lead.api.updateProgress({ id: 'root', progress: 10 })).progress).toBe(10);
    const task = await lead.api.assignTask({ title: 'Solder ESC', assignees: ['ajit'], module: 'Avionics', dueDate: '2026-10-20' });
    expect(task.type).toBe('assigned');
    expect((await lead.api.listWork({ assignee: 'archit' })).items.map((i) => i.id)).toContain('partnered');
  });

  it('a mapped secondary account acts as its primary uid', async () => {
    const alt = apiAs('altAuth', 'alt@gmail.com');
    expect((await alt.api.me()).uid).toBe('u1');
    expect((await alt.api.updateProgress({ id: 'mine', progress: 70 })).progress).toBe(70);
  });

  it('admin: create a child milestone and reassign it', async () => {
    const boss = apiAs('boss', 'boss@airbuddy.in');
    const child = await boss.api.createMilestone({ title: 'Prop test', parentId: 'root', dueDate: '2026-11-15', assignees: ['ajit'] });
    expect(child).toMatchObject({ depth: 1, assignees: ['Ajit'] });
    expect((await owner.get('roadmapNodes/root')).childCount).toBe(3); // seed's n1 + the lead's child + this one
    const moved = await boss.api.updateMilestone({ id: child.id, addAssignees: ['archit'] });
    expect(moved.assignees).toEqual(['Ajit', 'Archit Jain']);
  });
});
