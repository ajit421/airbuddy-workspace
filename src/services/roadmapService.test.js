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
  doc:              vi.fn().mockReturnValue('doc-ref'),
  addDoc:           vi.fn().mockResolvedValue({ id: 'new-node-id' }),
  updateDoc:        vi.fn().mockResolvedValue(undefined),
  deleteDoc:        vi.fn().mockResolvedValue(undefined),
  getDoc:           vi.fn(),
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
  createNode,
  updateNode,
  archiveNode,
  deleteNode,
  subscribeToChildren,
  subscribeToSubtree,
  subscribeToNode,
} from './roadmapService';
// eslint-disable-next-line no-unused-vars
import { addDoc, updateDoc, deleteDoc, where, getDoc } from 'firebase/firestore';

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
    const { addDoc } = await import('firebase/firestore');
    await createNode({ title: 'Test Node', priority: 'medium' }, 'admin-uid');
    expect(addDoc).toHaveBeenCalled();
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.status).toBe('pending');
  });

  it('applies default priority=medium when not provided', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createNode({ title: 'Test Node', status: 'pending' }, 'admin-uid');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.priority).toBe('medium');
  });

  it('sets progress=0, childCount=0, isArchived=false on create', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.progress).toBe(0);
    expect(callArgs.childCount).toBe(0);
    expect(callArgs.isArchived).toBe(false);
  });

  it('sets createdBy and updatedBy to adminUid', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createNode(validForm, 'my-admin-uid');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.createdBy).toBe('my-admin-uid');
    expect(callArgs.updatedBy).toBe('my-admin-uid');
  });

  it('sets parentId=null for root nodes', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid', null);
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.parentId).toBeNull();
  });

  it('sets parentId to parent.id for child nodes', async () => {
    const { addDoc } = await import('firebase/firestore');
    const parent = { id: 'parent-id', path: 'parent-id', ancestorIds: [], depth: 0, childCount: 0 };
    await createNode(validForm, 'admin-uid', parent);
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.parentId).toBe('parent-id');
  });

  it('calls updateDoc twice for child nodes (hierarchy + parent childCount)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    const parent = { id: 'parent-id', path: 'parent-id', ancestorIds: [], depth: 0, childCount: 2 };
    await createNode(validForm, 'admin-uid', parent);
    expect(updateDoc).toHaveBeenCalledTimes(2);
  });

  it('calls updateDoc once for root nodes (hierarchy update only)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await createNode(validForm, 'admin-uid', null);
    expect(updateDoc).toHaveBeenCalledTimes(1);
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
    const { updateDoc } = await import('firebase/firestore');
    await archiveNode('node-123', 'admin-uid');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.isArchived).toBe(true);
    expect(callArgs.updatedBy).toBe('admin-uid');
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
