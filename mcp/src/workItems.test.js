import { describe, it, expect, vi } from 'vitest';

// The parity tests import the web app's own services, which pull in the
// Firebase client SDK — stub it exactly as the src/ tests do.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
  addDoc: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), increment: vi.fn(),
  arrayUnion: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock('../../src/services/firebase', () => ({ db: {} }));

const web = await import('../../src/services/roadmapService.js');
const webTodos = await import('../../src/services/todoService.js');
const webPerms = await import('../../src/utils/permissions.js');
const webCollab = await import('../../src/services/collaborationService.js');
const webCatalog = await import('../../src/utils/permissionCatalog.js');
const mcp = await import('./workItems.js');

describe('parity with the web app', () => {
  it('NODE_ASSIGNEE_WRITABLE_FIELDS matches roadmapService', () => {
    expect(mcp.NODE_ASSIGNEE_WRITABLE_FIELDS).toEqual(web.NODE_ASSIGNEE_WRITABLE_FIELDS);
  });

  it('computeHierarchy matches roadmapService', () => {
    const parent = { id: 'p', path: 'r/p', ancestorIds: ['r'], depth: 1 };
    expect(mcp.computeHierarchy('n', parent)).toEqual(web.computeHierarchy('n', parent));
    expect(mcp.computeHierarchy('n', null)).toEqual(web.computeHierarchy('n', null));
  });

  it('sortByDueDate matches sortNodesByDueDate', () => {
    const nodes = [
      { id: 'c', title: 'Zeta' },
      { id: 'a', title: 'Alpha', dueDate: new Date('2026-11-01') },
      { id: 'b', title: 'Beta', dueDate: new Date('2026-10-01') },
      { id: 'd', title: 'Alpha' },
    ];
    expect(mcp.sortByDueDate(nodes).map((n) => n.id)).toEqual(web.sortNodesByDueDate(nodes).map((n) => n.id));
  });

  it('normalizeTodos matches todoService', () => {
    const raw = [
      { id: 'b', text: 'second', done: true, createdAt: '2026-10-02T00:00:00Z' },
      { text: 'legacy, no id' },
      { id: 'a', text: 'first', createdAt: '2026-10-01T00:00:00Z' },
      null,
      { id: 'x', done: true },
    ];
    expect(mcp.normalizeTodos(raw)).toEqual(webTodos.normalizeTodos(raw));
  });

  it('permission helpers agree with permissions.js and checkCanAddPartner', () => {
    const items = [
      { createdBy: 'u1', assignedTo: ['u2'], workPartnerUids: ['u3'], workPartners: [{ uid: 'u3' }] },
      { createdBy: 'admin', assignedTo: [], workPartnerUids: [] },
    ];
    const people = [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u3' }, { uid: 'u4' }];
    for (const item of items) {
      for (const p of people) {
        const profile = { uid: p.uid, role: 'employee' };
        expect(mcp.canUpdateProgress(item, profile)).toBe(webPerms.canUpdateProgress(item, profile));
        expect(mcp.canManageTodos(item, profile)).toBe(webPerms.canManageTodos(item, profile));
        expect(mcp.canAddPartner(item, profile)).toBe(webCollab.checkCanAddPartner(item, p.uid));
      }
      expect(mcp.canUpdateProgress(item, { uid: 'z', role: 'admin' })).toBe(true);
    }
  });
});

describe('permission parity', () => {
  it('PERMISSION_KEYS matches permissionCatalog.js', () => {
    expect(mcp.PERMISSION_KEYS).toEqual(webCatalog.PERMISSION_KEYS);
  });

  it('every key a tool uses is in the catalog', () => {
    for (const k of Object.keys(mcp.TOOL_PERMISSIONS)) expect(webCatalog.PERMISSION_KEYS).toContain(k);
  });

  it('hasPermission agrees with permissions.js', () => {
    const profiles = [
      null,
      { uid: 'a', role: 'admin' },
      { uid: 'e', role: 'employee' },
      { uid: 'e', role: 'employee', permissions: { 'roadmap.edit': true, 'tasks.assign': 'yes' } },
    ];
    for (const p of profiles) {
      for (const k of webCatalog.PERMISSION_KEYS) {
        expect(mcp.hasPermission(p, k)).toBe(webPerms.hasPermission(p, k));
      }
    }
  });

  it('MODULE_OPTIONS matches permissions.js', () => {
    expect(mcp.MODULE_OPTIONS).toEqual(webPerms.MODULE_OPTIONS);
  });
});

describe('deriveStatus', () => {
  it('follows progress like TaskDetailModal', () => {
    expect(mcp.deriveStatus(0)).toBe('pending');
    expect(mcp.deriveStatus(1)).toBe('in-progress');
    expect(mcp.deriveStatus(99)).toBe('in-progress');
    expect(mcp.deriveStatus(100)).toBe('completed');
  });
});

describe('dates', () => {
  it('istDate gives the Indian calendar day, not the UTC one', () => {
    // 23:40 IST on Oct 5 is 18:10 UTC on Oct 5; 00:15 IST Oct 6 is 18:45 UTC Oct 5.
    expect(mcp.istDate(new Date('2026-10-05T18:45:00Z'))).toBe('2026-10-06');
    // A due date picked in the UI is stored as UTC midnight of that day.
    expect(mcp.istDate(new Date('2026-10-20'))).toBe('2026-10-20');
    expect(mcp.istDate(null)).toBeNull();
  });

  it('parseDateInput stores UTC midnight, like new Date("YYYY-MM-DD") in the web app', () => {
    expect(mcp.parseDateInput('2026-10-20').toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(() => mcp.parseDateInput('20/10/2026')).toThrow(/YYYY-MM-DD/);
    expect(() => mcp.parseDateInput('2026-02-30')).toThrow(/real date/);
  });
});

describe('findTodo', () => {
  const todos = mcp.normalizeTodos([
    { id: 't1', text: 'Draft CAD model', createdAt: '1' },
    { id: 't2', text: 'Review CAD with Archit', createdAt: '2' },
    { id: 't3', text: 'Order parts', createdAt: '3' },
  ]);

  it('matches by id, 1-based number, and unique text', () => {
    expect(mcp.findTodo(todos, 't3').id).toBe('t3');
    expect(mcp.findTodo(todos, '2').id).toBe('t2');
    expect(mcp.findTodo(todos, 'order').id).toBe('t3');
  });

  it('refuses an ambiguous or missing match instead of guessing', () => {
    expect(() => mcp.findTodo(todos, 'cad')).toThrow(/matches 2/);
    expect(() => mcp.findTodo(todos, 'nothing')).toThrow(/No checklist item/);
  });
});

describe('matchPerson', () => {
  const people = [
    { uid: 'u1', name: 'Archit Jain', email: 'archit@airbuddy.in' },
    { uid: 'u2', name: 'Ajit Kumar', email: 'ajit@airbuddy.in' },
    { uid: 'u3', name: 'Ajit Singh', email: 'ajit.s@gmail.com' },
  ];

  it('resolves uid, email, full name and unique partial name', () => {
    expect(mcp.matchPerson(people, 'u1').uid).toBe('u1');
    expect(mcp.matchPerson(people, 'ARCHIT@airbuddy.in').uid).toBe('u1');
    expect(mcp.matchPerson(people, 'ajit kumar').uid).toBe('u2');
    expect(mcp.matchPerson(people, 'archit').uid).toBe('u1');
  });

  it('refuses an ambiguous name', () => {
    expect(() => mcp.matchPerson(people, 'Ajit S')).not.toThrow();
    expect(() => mcp.matchPerson(people, 'jit')).toThrow(/matches 2/);
  });
});

describe('presentWorkItem', () => {
  it('names people, flags overdue, and reports the viewer\'s role', () => {
    const nameOf = (u) => ({ u1: 'Archit', u2: 'Ajit' }[u] ?? u);
    const out = mcp.presentWorkItem(
      {
        id: 'n1', title: 'Wing test', status: 'in-progress', progress: 40,
        dueDate: new Date('2020-01-01'), assignedTo: ['u1'], workPartnerUids: ['u2'],
        workPartners: [{ uid: 'u2', name: 'Ajit' }], depth: 1, childCount: 2,
        todos: [{ id: 'a', text: 'x', done: true }],
      },
      'milestone', nameOf, 'u2', { detail: true },
    );
    expect(out).toMatchObject({
      kind: 'milestone', assignees: ['Archit'], workPartners: ['Ajit'],
      overdue: true, yourRole: ['work partner'], dueDate: '2020-01-01',
      checklist: [{ n: 1, id: 'a', text: 'x', done: true }],
    });
  });
});
