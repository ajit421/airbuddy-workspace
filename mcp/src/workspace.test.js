import { describe, it, expect, beforeEach } from 'vitest';
import { FirestoreError, RemovalNotAllowedError, assertNoRemoval } from './firestore.js';
import { NODE_ASSIGNEE_WRITABLE_FIELDS, TASK_ASSIGNEE_DENIED_FIELDS } from './workItems.js';
import { WorkspaceApi } from './workspace.js';

/**
 * In-memory stand-in for FirestoreClient. It records every commit so the
 * tests can assert on exactly what would reach the rules: the update mask and
 * transforms of each write are its affectedKeys().
 */
class FakeDb {
  constructor(docs) {
    this.docs = structuredClone(docs);
    this.commits = [];
    this.failNextCommitWith = null;
  }
  docName(p) { return p; }
  async get(path) {
    const d = this.docs[path];
    return d ? { id: path.split('/').pop(), _path: path, _updateTime: 'T1', ...structuredClone(d) } : null;
  }
  async query({ collection, where = [] }) {
    return Object.entries(this.docs)
      .filter(([p]) => p.split('/').length === 2 && p.startsWith(`${collection}/`))
      .map(([p, d]) => ({ id: p.split('/')[1], _path: p, ...structuredClone(d) }))
      .filter((d) => where.every(([f, op, v]) =>
        op === 'array-contains' ? (d[f] ?? []).includes(v) : (d[f] ?? null) === v));
  }
  async commit(writes) {
    assertNoRemoval(writes); // same guard as FirestoreClient.commit
    if (this.failNextCommitWith) {
      const err = this.failNextCommitWith;
      this.failNextCommitWith = null;
      throw err;
    }
    this.commits.push(writes);
    // Remember created docs (as an empty shell) so a read-back finds them.
    for (const w of writes) {
      if (w.currentDocument?.exists === false && !this.docs[w.update.name]) this.docs[w.update.name] = {};
    }
    return {};
  }
  /** Every field a write touches: mask + transforms. */
  static affected(write) {
    return [...(write.updateMask?.fieldPaths ?? Object.keys(write.update.fields)), ...(write.updateTransforms ?? []).map((t) => t.fieldPath)];
  }
}

const session = { getAuthIdentity: async () => ({ uid: 'authAlt', email: 'alt@gmail.com' }) };

const base = {
  'user_email_map/alt%40gmail.com': { primaryUid: 'u1' },
  'users/u1': { name: 'Ajit', email: 'ajit@airbuddy.in', role: 'employee' },
  'users/u2': { name: 'Archit Jain', email: 'archit@airbuddy.in', role: 'employee' },
  'users/admin': { name: 'Boss', email: 'boss@airbuddy.in', role: 'admin' },
  'roadmapNodes/n1': {
    title: 'Wing test', status: 'pending', progress: 0, assignedTo: ['u1'], createdBy: 'admin',
    isArchived: false, workPartners: [], workPartnerUids: [], depth: 1,
  },
  'tasks/t1': {
    title: 'CAD model', status: 'in-progress', progress: 30, assignedTo: ['u1'], createdBy: 'admin',
    isAdminTask: true, workPartners: [], workPartnerUids: [],
    todos: [{ id: 'a', text: 'Draft', done: false, createdAt: '1' }],
  },
};

let db;
let api;
beforeEach(() => {
  db = new FakeDb(base);
  api = new WorkspaceApi(db, session);
});

describe('identity', () => {
  it('maps a secondary account to its primary uid, like AuthContext', async () => {
    expect((await api.me()).uid).toBe('u1');
  });
});

describe('update_progress', () => {
  it('on a milestone writes only fields inside the assignee carve-out', async () => {
    await api.updateProgress({ id: 'n1', progress: 50 });
    const [write] = db.commits[0];
    expect(write.update.name).toBe('roadmapNodes/n1');
    for (const f of FakeDb.affected(write)) expect(NODE_ASSIGNEE_WRITABLE_FIELDS).toContain(f);
    expect(write.update.fields.updatedBy).toEqual({ stringValue: 'u1' });
  });

  it('on a task never writes a denied field, and never writes updatedBy', async () => {
    await api.updateProgress({ id: 't1', progress: 60 });
    const [write] = db.commits[0];
    expect(write.update.name).toBe('tasks/t1');
    const affected = FakeDb.affected(write);
    for (const f of TASK_ASSIGNEE_DENIED_FIELDS) expect(affected).not.toContain(f);
    expect(affected).not.toContain('updatedBy');
  });

  it('posts timeline events as the effective uid', async () => {
    await api.updateProgress({ id: 'n1', progress: 50 });
    const events = db.commits.flat().filter((w) => w.update.name.includes('/events/'));
    expect(events.map((w) => w.update.fields.type.stringValue)).toEqual(['progress_updated', 'status_changed']);
    for (const e of events) expect(e.update.fields.authorUid).toEqual({ stringValue: 'u1' });
  });

  it('refuses to complete without a completion note', async () => {
    await expect(api.updateProgress({ id: 't1', progress: 100 })).rejects.toThrow(/completion_note/);
    expect(db.commits).toHaveLength(0);
  });

  it('refuses a work partner, who may tick todos but not set progress', async () => {
    db.docs['tasks/t1'].assignedTo = ['u2'];
    db.docs['tasks/t1'].workPartnerUids = ['u1'];
    await expect(api.updateProgress({ id: 't1', progress: 40 })).rejects.toThrow(/can't update progress/);
  });
});

describe('add_work_partner', () => {
  it('updates both arrays in one write and notifies with senderUid = effective uid', async () => {
    await api.addWorkPartner({ id: 't1', person: 'archit' });
    const [write] = db.commits[0];
    expect(write.updateTransforms.map((t) => t.fieldPath)).toEqual(['workPartners', 'workPartnerUids', 'updatedAt']);
    const notif = db.commits.flat().find((w) => w.update.name.startsWith('notifications/u2/'));
    expect(notif.update.fields.senderUid).toEqual({ stringValue: 'u1' });
    expect(notif.update.fields.type).toEqual({ stringValue: 'partner_added' });
  });
});

describe('checklist', () => {
  it('ticks an item under an updateTime precondition, retrying on conflict', async () => {
    db.failNextCommitWith = new FirestoreError('changed', 'FAILED_PRECONDITION', 400);
    await api.setTodoDone({ id: 't1', item: '1', done: true });
    const [write] = db.commits[0];
    expect(write.currentDocument).toEqual({ updateTime: 'T1' });
    expect(FakeDb.affected(write)).toEqual(['todos', 'updatedAt']);
    expect(write.update.fields.todos.arrayValue.values[0].mapValue.fields.done).toEqual({ booleanValue: true });
  });
});

describe('permission-gated tools', () => {
  it('refuse a plain employee before writing anything', async () => {
    await expect(api.createMilestone({ title: 'X' })).rejects.toThrow(/roadmap\.edit/);
    await expect(api.updateMilestone({ id: 'n1', title: 'X' })).rejects.toThrow(/roadmap\.edit/);
    await expect(api.assignTask({ title: 'X', assignees: ['archit'] })).rejects.toThrow(/tasks\.assign/);
    await expect(api.listWork({ assignee: 'archit' })).rejects.toThrow(/tasks\.viewAll/);
    expect(db.commits).toHaveLength(0);
  });

  it('open to an employee an admin granted the key', async () => {
    db.docs['users/u1'].permissions = { 'roadmap.edit': true, 'tasks.assign': true, 'tasks.viewAll': true };
    await api.createMilestone({ title: 'Prop test', parentId: 'n1' });
    await api.assignTask({ title: 'Solder ESC', assignees: ['archit'], module: 'Avionics', dueDate: '2026-10-20' });
    const work = await api.listWork({ assignee: 'archit' });
    expect(work.person).toBe('Archit Jain');

    const task = db.commits.flat().find((w) => w.update.name.startsWith('tasks/'));
    expect(task.update.fields.isAdminTask).toEqual({ booleanValue: true });
    expect(task.update.fields.createdBy).toEqual({ stringValue: 'u1' });
    expect(task.update.fields.assignedTo.arrayValue.values).toEqual([{ stringValue: 'u2' }]);
  });

  it('roadmap.edit lets a non-assignee update any milestone, but grants nothing on tasks', async () => {
    db.docs['users/u1'].permissions = { 'roadmap.edit': true };
    db.docs['roadmapNodes/n1'].assignedTo = ['u2'];
    db.docs['tasks/t1'].assignedTo = ['u2'];
    await api.updateProgress({ id: 'n1', progress: 20 });
    await expect(api.updateProgress({ id: 't1', progress: 20 })).rejects.toThrow(/can't update progress/);
  });

  it('a key set to anything but true is not a grant', async () => {
    db.docs['users/u1'].permissions = { 'tasks.assign': 'yes' };
    await expect(api.assignTask({ title: 'X', assignees: ['archit'] })).rejects.toThrow(/tasks\.assign/);
  });

  it('whoami reports the granted keys', async () => {
    db.docs['users/u1'].permissions = { 'tasks.viewAll': true, 'not.a.key': true };
    const caps = await api.capabilities();
    expect(caps.permissions).toEqual(['tasks.viewAll']);
    expect(caps.needsPermission).toEqual({ 'roadmap.edit': false, 'tasks.assign': false, 'tasks.viewAll': true });
  });
});

describe('no removal, for anybody', () => {
  const admin = { getAuthIdentity: async () => ({ uid: 'admin', email: 'boss@airbuddy.in' }) };

  it('the api has no delete or remove methods', () => {
    const methods = Object.getOwnPropertyNames(WorkspaceApi.prototype);
    expect(methods.filter((m) => /delete|remove|archive/i.test(m))).toEqual([]);
  });

  it('update_milestone only ever adds assignees, even for an admin', async () => {
    const boss = new WorkspaceApi(db, admin);
    await boss.updateMilestone({ id: 'n1', addAssignees: ['archit'], removeAssignees: ['ajit'], dueDate: null });
    const [write] = db.commits[0];
    expect(write.updateTransforms.some((t) => t.removeAllFromArray)).toBe(false);
    expect(FakeDb.affected(write)).not.toContain('dueDate');
  });

  it('commit refuses a delete, a field deletion and an array removal', () => {
    expect(() => assertNoRemoval([{ delete: 'projects/p/databases/(default)/documents/tasks/t1' }]))
      .toThrow(RemovalNotAllowedError);
    expect(() => assertNoRemoval([{ update: { name: 'x', fields: {} }, updateMask: { fieldPaths: ['title'] } }]))
      .toThrow(/delete field title/);
    expect(() => assertNoRemoval([{
      update: { name: 'x', fields: {} }, updateMask: { fieldPaths: [] },
      updateTransforms: [{ fieldPath: 'assignedTo', removeAllFromArray: { values: [] } }],
    }])).toThrow(/remove from assignedTo/);
  });
});
