/**
 * roadmapService.test.js — Phase 7 unit tests
 *
 * Tests Zod validation, computeHierarchy logic, and guard clauses.
 * Firestore calls are fully mocked — no real database connection needed.
 * Follows taskService.test.js conventions exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ──────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection:       vi.fn().mockReturnValue('col-ref'),
  doc:              vi.fn().mockReturnValue({ id: 'new-node-id' }),
  setDoc:           vi.fn().mockResolvedValue(undefined),
  updateDoc:        vi.fn().mockResolvedValue(undefined),
  deleteDoc:        vi.fn().mockResolvedValue(undefined),
  getDoc:           vi.fn().mockResolvedValue({ exists: () => false }),
  getDocs:          vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  increment:        vi.fn((n) => ({ __increment: n })),
  query:            vi.fn().mockReturnValue('query-ref'),
  where:            vi.fn().mockReturnValue('where-ref'),
  onSnapshot:       vi.fn().mockReturnValue(() => {}),
  serverTimestamp:  vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
}));

// ── Mock firebase.js init module ─────────────────────────────────────────────
vi.mock('./firebase', () => ({ db: {} }));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import {
  computeHierarchy,
  sortNodesByDueDate,
  createNode,
  updateNode,
  archiveNode,
  deleteNode,
  subscribeToChildren,
  subscribeToSubtree,
  subscribeToNode,
  recomputeNodeRollup,
  nodeToWorkItem,
  subscribeToAssignedNodes,
  subscribeToAllAssignedNodes,
  updateNodeAsAssignee,
  NODE_ASSIGNEE_WRITABLE_FIELDS,
} from './roadmapService';
// eslint-disable-next-line no-unused-vars
import { setDoc, updateDoc, deleteDoc, where, getDoc, getDocs, onSnapshot } from 'firebase/firestore';

// ─── Valid base form ─────────────────────────────────────────────────────────
const validForm = {
  title:    'Sprint Alpha',
  status:   'pending',
  priority: 'high',
};

// ─── computeHierarchy ────────────────────────────────────────────────────────
describe('computeHierarchy', () => {
  it('returns depth=0, empty ancestorIds, path=id for root nodes', () => {
    const result = computeHierarchy('abc123', null);
    expect(result).toEqual({
      parentId:    null,
      path:        'abc123',
      ancestorIds: [],
      depth:       0,
    });
  });

  it('builds correct path for depth-1 child', () => {
    const parent = { id: 'parent-id', path: 'parent-id', ancestorIds: [], depth: 0 };
    const result = computeHierarchy('child-id', parent);
    expect(result.path).toBe('parent-id/child-id');
    expect(result.ancestorIds).toEqual(['parent-id']);
    expect(result.depth).toBe(1);
    expect(result.parentId).toBe('parent-id');
  });

  it('builds correct path for depth-2 child', () => {
    const _grandparent = { id: 'gp', path: 'gp', ancestorIds: [], depth: 0 };
    const parent = { id: 'p', path: 'gp/p', ancestorIds: ['gp'], depth: 1 };
    const result = computeHierarchy('child', parent);
    expect(result.path).toBe('gp/p/child');
    expect(result.ancestorIds).toEqual(['gp', 'p']);
    expect(result.depth).toBe(2);
  });

  it('does not mutate the parent ancestorIds array', () => {
    const parent = { id: 'p', path: 'p', ancestorIds: ['x', 'y'], depth: 2 };
    computeHierarchy('child', parent);
    expect(parent.ancestorIds).toEqual(['x', 'y']); // unchanged
  });

  it('path always ends with newNodeId', () => {
    const parent = { id: 'p', path: 'a/b/p', ancestorIds: ['a', 'b'], depth: 2 };
    const result = computeHierarchy('new-id', parent);
    expect(result.path.endsWith('new-id')).toBe(true);
  });

  it('ancestorIds.length always equals depth', () => {
    const parent = { id: 'p', path: 'a/b/p', ancestorIds: ['a', 'b'], depth: 2 };
    const result = computeHierarchy('new-id', parent);
    expect(result.ancestorIds.length).toBe(result.depth);
  });
});

// ─── createNode ──────────────────────────────────────────────────────────────
describe('createNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('succeeds with minimal valid form', async () => {
    const id = await createNode(validForm, 'admin-uid', null);
    expect(id).toBe('new-node-id');
  });

  it('throws ZodError when title is empty string', async () => {
    await expect(createNode({ ...validForm, title: '' }, 'admin-uid')).rejects.toThrow();
  });

  it('throws ZodError when title is missing', async () => {
    await expect(createNode({ status: 'pending', priority: 'high' }, 'admin-uid')).rejects.toThrow();
  });

  it('throws ZodError when status is not a valid enum value', async () => {
    await expect(createNode({ ...validForm, status: 'wip' }, 'admin-uid')).rejects.toThrow();
  });

  it('throws ZodError when priority is not a valid enum value', async () => {
    await expect(createNode({ ...validForm, priority: 'ultra' }, 'admin-uid')).rejects.toThrow();
  });

  it('throws ZodError when order is negative', async () => {
    await expect(createNode({ ...validForm, order: -1 }, 'admin-uid')).rejects.toThrow();
  });

  it('applies default status=pending when not provided', async () => {
    const { setDoc } = await import('firebase/firestore');
    await createNode({ title: 'Test Node', priority: 'medium' }, 'admin-uid');
    expect(setDoc).toHaveBeenCalled();
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.status).toBe('pending');
  });

  it('applies default priority=medium when not provided', async () => {
    const { setDoc } = await import('firebase/firestore');
    await createNode({ title: 'Test Node', status: 'pending' }, 'admin-uid');
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.priority).toBe('medium');
  });

  it('sets progress=0, childCount=0, isArchived=false on create', async () => {
    const { setDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid');
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.progress).toBe(0);
    expect(callArgs.childCount).toBe(0);
    expect(callArgs.isArchived).toBe(false);
  });

  it('sets createdBy and updatedBy to adminUid', async () => {
    const { setDoc } = await import('firebase/firestore');
    await createNode(validForm, 'my-admin-uid');
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.createdBy).toBe('my-admin-uid');
    expect(callArgs.updatedBy).toBe('my-admin-uid');
  });

  it('sets parentId=null for root nodes', async () => {
    const { setDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid', null);
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.parentId).toBeNull();
  });

  it('sets parentId to parent.id for child nodes', async () => {
    const { setDoc } = await import('firebase/firestore');
    const parent = { id: 'parent-id', path: 'parent-id', ancestorIds: [], depth: 0, childCount: 0 };
    await createNode(validForm, 'admin-uid', parent);
    const callArgs = setDoc.mock.calls[0][1];
    expect(callArgs.parentId).toBe('parent-id');
  });

  it('calls updateDoc once for child nodes (parent childCount increment)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    const parent = { id: 'parent-id', path: 'parent-id', ancestorIds: [], depth: 0, childCount: 2 };
    await createNode(validForm, 'admin-uid', parent);
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('does not call updateDoc for root nodes (single setDoc write only)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid', null);
    expect(updateDoc).toHaveBeenCalledTimes(0);
  });
});

// ─── updateNode ──────────────────────────────────────────────────────────────
describe('updateNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateDoc for valid nodeId', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateNode('node-123', { title: 'New Title' }, 'editor-uid');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.title).toBe('New Title');
    expect(callArgs.updatedBy).toBe('editor-uid');
  });

  it('throws when nodeId is empty', async () => {
    await expect(updateNode('', { title: 'X' }, 'uid')).rejects.toThrow('[roadmapService] updateNode: nodeId is required');
  });

  it('throws when nodeId is null', async () => {
    await expect(updateNode(null, {}, 'uid')).rejects.toThrow('[roadmapService] updateNode: nodeId is required');
  });

  it('strips rollup fields: progress, childCount, childCompletedCount', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateNode('node-123', { title: 'X', progress: 50, childCount: 3, childCompletedCount: 1 }, 'uid');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.progress).toBeUndefined();
    expect(callArgs.childCount).toBeUndefined();
    expect(callArgs.childCompletedCount).toBeUndefined();
    expect(callArgs.title).toBe('X');
  });

  it('strips hierarchy fields: path, ancestorIds, depth', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateNode('node-123', { title: 'X', path: 'a/b', ancestorIds: ['a'], depth: 1 }, 'uid');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.path).toBeUndefined();
    expect(callArgs.ancestorIds).toBeUndefined();
    expect(callArgs.depth).toBeUndefined();
  });

  it('strips immutable audit fields: createdAt, createdBy', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateNode('node-123', { title: 'X', createdAt: 'old', createdBy: 'old-uid' }, 'new-uid');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.createdAt).toBeUndefined();
    expect(callArgs.createdBy).toBeUndefined();
  });
});

// ─── archiveNode ─────────────────────────────────────────────────────────────
describe('archiveNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets isArchived=true in Firestore', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ parentId: null }) });
    const { updateDoc } = await import('firebase/firestore');
    await archiveNode('node-123', 'admin-uid');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.isArchived).toBe(true);
    expect(callArgs.updatedBy).toBe('admin-uid');
  });

  it('decrements parent childCount when archiving a child node', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ parentId: 'parent-id' }) });
    const { updateDoc, increment } = await import('firebase/firestore');
    await archiveNode('child-node', 'admin-uid');
    const parentUpdate = updateDoc.mock.calls.find((c) => c[1]?.childCount !== undefined);
    expect(parentUpdate[1].childCount).toEqual(increment(-1));
  });

  it('throws when nodeId is empty', async () => {
    await expect(archiveNode('', 'uid')).rejects.toThrow('[roadmapService] archiveNode: nodeId is required');
  });

  it('throws when nodeId is null', async () => {
    await expect(archiveNode(null, 'uid')).rejects.toThrow('[roadmapService] archiveNode: nodeId is required');
  });
});

// ─── deleteNode ──────────────────────────────────────────────────────────────
describe('deleteNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes a leaf node (childCount=0) successfully', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ childCount: 0, parentId: null }),
    });
    const { deleteDoc } = await import('firebase/firestore');
    await deleteNode('leaf-node');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('throws when trying to delete a node with children', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ childCount: 3, parentId: null }),
    });
    await expect(deleteNode('parent-node')).rejects.toThrow(
      '[roadmapService] deleteNode: cannot delete node with 3 children'
    );
  });

  it('throws when node does not exist in Firestore', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(deleteNode('missing-node')).rejects.toThrow('[roadmapService] deleteNode: node not found');
  });

  it('throws when nodeId is empty', async () => {
    await expect(deleteNode('')).rejects.toThrow('[roadmapService] deleteNode: nodeId is required');
  });

  it('decrements parent childCount before deleting child node', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ childCount: 0, parentId: 'parent-id' }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ childCount: 2 }),
      });
    await deleteNode('child-node');
    const parentUpdate = updateDoc.mock.calls.find((c) => c[1]?.childCount !== undefined);
    expect(parentUpdate[1].childCount).toBe(1);
  });
});

// ─── sortNodesByDueDate ──────────────────────────────────────────────────────
describe('sortNodesByDueDate', () => {
  const node = (id, dueDate, order = 0) => ({ id, dueDate, order });

  it('orders dated nodes by dueDate ascending', () => {
    const out = sortNodesByDueDate([
      node('c', new Date('2026-12-05')),
      node('a', new Date('2026-08-29')),
      node('b', new Date('2026-10-24')),
    ]);
    expect(out.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('accepts Firestore Timestamp, Date and string dueDates alike', () => {
    const out = sortNodesByDueDate([
      node('str', '2026-11-14'),
      node('ts',  { toDate: () => new Date('2026-09-26') }),
      node('date', new Date('2026-10-03')),
    ]);
    expect(out.map((n) => n.id)).toEqual(['ts', 'date', 'str']);
  });

  it('sinks nodes without a dueDate below every dated node', () => {
    const out = sortNodesByDueDate([
      node('undated', null),
      node('dated',   new Date('2027-01-01')),
    ]);
    expect(out.map((n) => n.id)).toEqual(['dated', 'undated']);
  });

  it('sinks an unparseable dueDate too', () => {
    const out = sortNodesByDueDate([
      node('junk',  'not-a-date'),
      node('dated', new Date('2026-08-29')),
    ]);
    expect(out.map((n) => n.id)).toEqual(['dated', 'junk']);
  });

  it('falls back to order for equal dates and for undated nodes', () => {
    const same = new Date('2026-10-17');
    const out = sortNodesByDueDate([
      node('second', same, 2),
      node('first',  same, 1),
      node('late',   null, 5),
      node('early',  null, 4),
    ]);
    expect(out.map((n) => n.id)).toEqual(['first', 'second', 'early', 'late']);
  });

  /**
   * `order` is 0 on every real document (createNode defaults it and no caller
   * passes one), so title is the tiebreak that actually decides the order of
   * undated siblings — e.g. root milestones with no dueDate set. Without it
   * they fall back to arbitrary document-ID order.
   */
  it('orders undated nodes by title when order is uniformly 0', () => {
    const out = sortNodesByDueDate([
      { id: 'n3', title: 'Drone Motor (200-unit)', order: 0, dueDate: null },
      { id: 'n1', title: 'Ceiling Fan Motor',      order: 0, dueDate: null },
      { id: 'n2', title: 'AC Outdoor Fan Motor',   order: 0, dueDate: null },
    ]);
    expect(out.map((n) => n.title)).toEqual([
      'AC Outdoor Fan Motor',
      'Ceiling Fan Motor',
      'Drone Motor (200-unit)',
    ]);
  });

  it('breaks an exact date + title tie on id so the order never shifts', () => {
    const same = new Date('2026-09-05');
    const twice = () => sortNodesByDueDate([
      { id: 'zz', title: 'Same', order: 0, dueDate: same },
      { id: 'aa', title: 'Same', order: 0, dueDate: same },
    ]).map((n) => n.id);
    expect(twice()).toEqual(['aa', 'zz']);
    expect(twice()).toEqual(twice());
  });

  it('still puts a dated node above an undated one whatever the titles', () => {
    const out = sortNodesByDueDate([
      { id: 'a', title: 'AAA', order: 0, dueDate: null },
      { id: 'z', title: 'ZZZ', order: 0, dueDate: new Date('2026-12-01') },
    ]);
    expect(out.map((n) => n.id)).toEqual(['z', 'a']);
  });

  it('does not mutate the input array', () => {
    const input = [node('b', new Date('2026-12-01')), node('a', new Date('2026-01-01'))];
    sortNodesByDueDate(input);
    expect(input.map((n) => n.id)).toEqual(['b', 'a']);
  });
});

// ─── subscribeToChildren ─────────────────────────────────────────────────────
describe('subscribeToChildren', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function', () => {
    const unsub = subscribeToChildren('parent-id', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('queries with parentId and isArchived=false filters', () => {
    subscribeToChildren('parent-id', vi.fn());
    expect(where).toHaveBeenCalledWith('parentId',   '==', 'parent-id');
    expect(where).toHaveBeenCalledWith('isArchived', '==', false);
  });

  it('accepts null parentId for root nodes', () => {
    subscribeToChildren(null, vi.fn());
    expect(where).toHaveBeenCalledWith('parentId', '==', null);
  });
});

// ─── subscribeToSubtree ──────────────────────────────────────────────────────
describe('subscribeToSubtree', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function', () => {
    const unsub = subscribeToSubtree('ancestor-id', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('queries with array-contains on ancestorIds', () => {
    subscribeToSubtree('ancestor-id', vi.fn());
    expect(where).toHaveBeenCalledWith('ancestorIds', 'array-contains', 'ancestor-id');
  });
});

// ─── subscribeToNode ─────────────────────────────────────────────────────────
describe('subscribeToNode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function', () => {
    const unsub = subscribeToNode('node-id', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });
});

// ─── recomputeNodeRollup ─────────────────────────────────────────────────────
// Client-side stand-in for the undeployed Cloud Function rollup triggers —
// see roadmapService.js for why this exists.
describe('recomputeNodeRollup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes averaged progress + completed count from own tasks and writes the diff', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ progress: 0, childCompletedCount: 0, status: 'pending', ancestorIds: [] }),
    });
    getDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ status: 'completed',   progress: 100 }) },
        { data: () => ({ status: 'in-progress', progress: 50 }) },
      ],
    });

    await recomputeNodeRollup('node-1');

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.progress).toBe(75);
    expect(payload.childCompletedCount).toBe(1);
    expect(payload.status).toBe('in-progress');
  });

  it('marks the node completed when every task is completed', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ progress: 50, childCompletedCount: 1, status: 'in-progress', ancestorIds: [] }),
    });
    getDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ status: 'completed', progress: 100 }) },
        { data: () => ({ status: 'completed', progress: 100 }) },
      ],
    });

    await recomputeNodeRollup('node-1');

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.progress).toBe(100);
    expect(payload.status).toBe('completed');
  });

  it('does not write when computed values match the stored ones', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ progress: 0, childCompletedCount: 0, status: 'pending', ancestorIds: [] }),
    });
    getDocs.mockResolvedValueOnce({ docs: [] });

    await recomputeNodeRollup('node-1');

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('excludes archived tasks from the average', async () => {
    getDoc.mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ progress: 0, childCompletedCount: 0, status: 'pending', ancestorIds: [] }),
    });
    getDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ status: 'completed', progress: 100 }) },
        { data: () => ({ status: 'archived',  progress: 0 }) },
      ],
    });

    await recomputeNodeRollup('node-1');

    const payload = updateDoc.mock.calls[0][1];
    expect(payload.progress).toBe(100);
    expect(payload.childCompletedCount).toBe(1);
  });

  it('propagates the new progress to a direct ancestor', async () => {
    // 1st getDoc: the node itself. 2nd getDoc: the ancestor.
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ progress: 0, childCompletedCount: 0, status: 'pending', ancestorIds: ['parent-id'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ progress: 0 }),
      });
    // 1st getDocs: the node's own tasks. 2nd getDocs: the ancestor's direct children.
    getDocs
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ status: 'completed', progress: 100 }) }],
      })
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ progress: 100 }) }],
      });

    await recomputeNodeRollup('child-node');

    expect(updateDoc).toHaveBeenCalledTimes(2);
    const ancestorPayload = updateDoc.mock.calls[1][1];
    expect(ancestorPayload.progress).toBe(100);
  });

  it('stops propagating once an ancestor value is unchanged (loop guard)', async () => {
    getDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ progress: 0, childCompletedCount: 0, status: 'pending', ancestorIds: ['parent-id', 'grandparent-id'] }),
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ progress: 100 }), // already matches what the children average to
      });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // node has no tasks -> progress stays 0, no self-write
      .mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ progress: 100 }) }],
      });

    await recomputeNodeRollup('child-node');

    // No self-write (progress unchanged) and no ancestor write (loop guard stops at parent-id)
    expect(updateDoc).not.toHaveBeenCalled();
    expect(getDoc).toHaveBeenCalledTimes(2); // node + first ancestor only — grandparent never reached
  });

  it('does nothing when the node does not exist', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false });
    await recomputeNodeRollup('missing-node');
    expect(updateDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('is a no-op when nodeId is falsy', async () => {
    await recomputeNodeRollup('');
    expect(getDoc).not.toHaveBeenCalled();
  });
});


// ─── Assigned milestones on the Dashboard ────────────────────────────────────
//
// Regression cover for the bug where a roadmap node assigned to two people
// appeared on nobody's Dashboard: `roadmapNodes.assignedTo` was written by the
// admin and read by nothing on the task path.

describe('nodeToWorkItem', () => {
  const node = {
    id: 'node-1',
    title: 'Release Prototype 1 PCB',
    description: 'Design already complete',
    status: 'pending',
    priority: 'critical',
    progress: 40,
    assignedTo: ['uid-a', 'uid-b'],
    dueDate: new Date('2026-08-29'),
    startDate: new Date('2026-08-24'),
    depth: 1,
    isArchived: false,
  };

  it('tags the item so consumers can route writes back to roadmapNodes', () => {
    const item = nodeToWorkItem(node);
    expect(item._source).toBe('roadmapNode');
    expect(item.roadmapNodeId).toBe('node-1');
    expect(item.id).toBe('node-1');
  });

  it('carries the fields the dashboard renders', () => {
    const item = nodeToWorkItem(node);
    expect(item.title).toBe('Release Prototype 1 PCB');
    expect(item.assignedTo).toEqual(['uid-a', 'uid-b']);
    expect(item.progress).toBe(40);
    expect(item.priority).toBe('critical');
    expect(item.dueDate).toEqual(new Date('2026-08-29'));
  });

  it('marks the item admin-assigned so it is never labelled self-assigned', () => {
    expect(nodeToWorkItem(node).isAdminTask).toBe(true);
  });

  it('gives partner arrays a concrete empty value rather than undefined', () => {
    const item = nodeToWorkItem(node);
    expect(item.workPartnerUids).toEqual([]);
    expect(item.workPartners).toEqual([]);
  });

  it('defaults a bare node without throwing', () => {
    const item = nodeToWorkItem({ id: 'n', title: 'T' });
    expect(item.status).toBe('pending');
    expect(item.priority).toBe('medium');
    expect(item.progress).toBe(0);
    expect(item.assignedTo).toEqual([]);
    expect(item.dueDate).toBeNull();
  });
});

describe('subscribeToAssignedNodes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a no-op and emits [] without a uid', () => {
    const onData = vi.fn();
    const unsub = subscribeToAssignedNodes('', onData);
    expect(onData).toHaveBeenCalledWith([]);
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });

  it('queries assignedTo array-contains only — no second where() that would need an index', () => {
    subscribeToAssignedNodes('uid-a', vi.fn());
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith('assignedTo', 'array-contains', 'uid-a');
  });

  it('drops archived nodes client-side and projects the rest', () => {
    const onData = vi.fn();
    subscribeToAssignedNodes('uid-a', onData);
    const cb = onSnapshot.mock.calls.at(-1)[1];
    cb({
      docs: [
        { id: 'live',     data: () => ({ title: 'Live',     assignedTo: ['uid-a'], dueDate: new Date('2026-01-02') }) },
        { id: 'archived', data: () => ({ title: 'Archived', assignedTo: ['uid-a'], isArchived: true }) },
      ],
    });
    const emitted = onData.mock.calls.at(-1)[0];
    expect(emitted).toHaveLength(1);
    expect(emitted[0].title).toBe('Live');
    expect(emitted[0]._source).toBe('roadmapNode');
  });

  it('sorts by dueDate ascending with undated milestones last', () => {
    const onData = vi.fn();
    subscribeToAssignedNodes('uid-a', onData);
    const cb = onSnapshot.mock.calls.at(-1)[1];
    cb({
      docs: [
        { id: 'c', data: () => ({ title: 'C', assignedTo: ['uid-a'] }) },
        { id: 'b', data: () => ({ title: 'B', assignedTo: ['uid-a'], dueDate: new Date('2026-03-01') }) },
        { id: 'a', data: () => ({ title: 'A', assignedTo: ['uid-a'], dueDate: new Date('2026-01-01') }) },
      ],
    });
    expect(onData.mock.calls.at(-1)[0].map((n) => n.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('updateNodeAsAssignee', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a missing nodeId', async () => {
    await expect(updateNodeAsAssignee('', { progress: 10 }, 'uid')).rejects.toThrow(/nodeId is required/);
  });

  it('writes only fields inside the rules carve-out', async () => {
    await updateNodeAsAssignee(
      'node-1',
      { progress: 100, status: 'completed', completionNote: { message: 'done' } },
      'uid-a'
    );
    const payload = updateDoc.mock.calls.at(-1)[1];
    expect(Object.keys(payload).sort()).toEqual(
      [...NODE_ASSIGNEE_WRITABLE_FIELDS].sort()
    );
    expect(payload.progress).toBe(100);
    expect(payload.status).toBe('completed');
    expect(payload.updatedBy).toBe('uid-a');
  });

  it('omits keys the caller did not pass, so hasOnly() still matches', async () => {
    await updateNodeAsAssignee('node-1', { progress: 50 }, 'uid-a');
    const payload = updateDoc.mock.calls.at(-1)[1];
    expect(Object.keys(payload).sort()).toEqual(['progress', 'updatedAt', 'updatedBy']);
  });
});

describe('subscribeToAllAssignedNodes (admin breadth)', () => {
  beforeEach(() => vi.clearAllMocks());

  // The Dashboard's admin-only employee filter narrows the viewer's own work
  // list by assignedTo. With a viewer-scoped node listener an admin loaded only
  // their own milestones, so filtering by a teammate could never surface that
  // teammate's milestone — it was not in the array being filtered.
  it('filters on isArchived only, so no composite index is needed', () => {
    subscribeToAllAssignedNodes(vi.fn());
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith('isArchived', '==', false);
  });

  it('returns milestones assigned to anyone, not just the viewer', () => {
    const onData = vi.fn();
    subscribeToAllAssignedNodes(onData);
    const cb = onSnapshot.mock.calls.at(-1)[1];
    cb({
      docs: [
        { id: 'theirs', data: () => ({ title: 'Theirs', assignedTo: ['uid-a', 'uid-b'], dueDate: new Date('2026-01-01') }) },
        { id: 'mine',   data: () => ({ title: 'Mine',   assignedTo: ['uid-me'],         dueDate: new Date('2026-02-01') }) },
      ],
    });
    const emitted = onData.mock.calls.at(-1)[0];
    expect(emitted.map((n) => n.title)).toEqual(['Theirs', 'Mine']);
    expect(emitted.every((n) => n._source === 'roadmapNode')).toBe(true);
  });

  it('drops unassigned nodes — roadmap structure belongs to nobody', () => {
    const onData = vi.fn();
    subscribeToAllAssignedNodes(onData);
    const cb = onSnapshot.mock.calls.at(-1)[1];
    cb({
      docs: [
        { id: 'assigned',   data: () => ({ title: 'Assigned',   assignedTo: ['uid-a'] }) },
        { id: 'unassigned', data: () => ({ title: 'Unassigned', assignedTo: [] }) },
        { id: 'nofield',    data: () => ({ title: 'NoField' }) },
      ],
    });
    expect(onData.mock.calls.at(-1)[0].map((n) => n.title)).toEqual(['Assigned']);
  });
});
