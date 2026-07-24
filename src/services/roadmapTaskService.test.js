/**
 * roadmapTaskService.test.js — Phase 7 unit tests
 *
 * Tests Zod validation, guard clauses, and field stripping for roadmapTaskService.
 * Firestore calls are fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ──────────────────────────────────────────────────
vi.mock('firebase/firestore', () => {
  const mockBatch = {
    set:    vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  return {
    collection:      vi.fn().mockReturnValue('col-ref'),
    doc:             vi.fn().mockReturnValue('doc-ref'),
    addDoc:          vi.fn().mockResolvedValue({ id: 'new-task-id' }),
    updateDoc:       vi.fn().mockResolvedValue(undefined),
    deleteDoc:       vi.fn().mockResolvedValue(undefined),
    query:           vi.fn().mockReturnValue('query-ref'),
    where:           vi.fn().mockReturnValue('where-ref'),
    onSnapshot:      vi.fn().mockReturnValue(() => {}),
    serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
    writeBatch:      vi.fn().mockReturnValue(mockBatch),
    // expose mockBatch for assertions
    __mockBatch:     mockBatch,
  };
});

vi.mock('./firebase', () => ({ db: {} }));

import {
  createRoadmapTask,
  updateRoadmapTask,
  deleteRoadmapTask,
  subscribeToRoadmapTasks,
} from './roadmapTaskService';

const validForm = {
  title:      'Write Tests',
  status:     'pending',
  priority:   'high',
  progress:   0,
  assignedTo: ['uid-1'],
};

// ─── createRoadmapTask ───────────────────────────────────────────────────────
describe('createRoadmapTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('succeeds with valid form and returns doc ID', async () => {
    const id = await createRoadmapTask('node-abc', validForm, 'admin-uid');
    expect(id).toBe('new-task-id');
  });

  it('throws when nodeId is empty', async () => {
    await expect(createRoadmapTask('', validForm, 'admin-uid'))
      .rejects.toThrow('[roadmapTaskService] createRoadmapTask: nodeId is required');
  });

  it('throws when nodeId is null', async () => {
    await expect(createRoadmapTask(null, validForm, 'admin-uid'))
      .rejects.toThrow('[roadmapTaskService] createRoadmapTask: nodeId is required');
  });

  it('throws ZodError when title is empty', async () => {
    await expect(createRoadmapTask('node-abc', { ...validForm, title: '' }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('throws ZodError when title is missing', async () => {
    await expect(createRoadmapTask('node-abc', { status: 'pending', priority: 'high' }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('throws ZodError when status is invalid', async () => {
    await expect(createRoadmapTask('node-abc', { ...validForm, status: 'wip' }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('throws ZodError when priority is invalid', async () => {
    await expect(createRoadmapTask('node-abc', { ...validForm, priority: 'ultra' }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('throws ZodError when progress > 100', async () => {
    await expect(createRoadmapTask('node-abc', { ...validForm, progress: 110 }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('throws ZodError when progress < 0', async () => {
    await expect(createRoadmapTask('node-abc', { ...validForm, progress: -5 }, 'admin-uid'))
      .rejects.toThrow();
  });

  it('denormalizes nodeId into the task document', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createRoadmapTask('my-node', validForm, 'admin-uid');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.nodeId).toBe('my-node');
  });

  it('sets assignedBy, createdBy, updatedBy to adminUid', async () => {
    const { addDoc } = await import('firebase/firestore');
    await createRoadmapTask('node-abc', validForm, 'my-admin');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.assignedBy).toBe('my-admin');
    expect(callArgs.createdBy).toBe('my-admin');
    expect(callArgs.updatedBy).toBe('my-admin');
  });

  it('applies default progress=0 when not provided', async () => {
    const { addDoc } = await import('firebase/firestore');
    const { progress: _ } = validForm;
    await createRoadmapTask('node-abc', { title: 'T', status: 'pending', priority: 'medium' }, 'admin-uid');
    const callArgs = addDoc.mock.calls[0][1];
    expect(callArgs.progress).toBe(0);
  });
});

// ─── updateRoadmapTask ───────────────────────────────────────────────────────
describe('updateRoadmapTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateDoc for valid ids', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateRoadmapTask('node-abc', 'task-xyz', { status: 'completed' }, 'uid-1');
    // Phase 23: updateDoc called twice — once for subcollection, once for mirror
    expect(updateDoc).toHaveBeenCalledTimes(2);
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.status).toBe('completed');
    expect(callArgs.updatedBy).toBe('uid-1');
  });

  it('throws when nodeId is empty', async () => {
    await expect(updateRoadmapTask('', 'task-xyz', {}, 'uid'))
      .rejects.toThrow('[roadmapTaskService] updateRoadmapTask: nodeId is required');
  });

  it('throws when taskId is empty', async () => {
    await expect(updateRoadmapTask('node-abc', '', {}, 'uid'))
      .rejects.toThrow('[roadmapTaskService] updateRoadmapTask: taskId is required');
  });

  it('strips immutable fields: createdAt, createdBy, nodeId', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateRoadmapTask('node-abc', 'task-xyz', {
      status: 'completed', createdAt: 'old', createdBy: 'old-uid', nodeId: 'wrong-node'
    }, 'uid-1');
    const callArgs = updateDoc.mock.calls[0][1];
    expect(callArgs.createdAt).toBeUndefined();
    expect(callArgs.createdBy).toBeUndefined();
    expect(callArgs.nodeId).toBeUndefined();
    expect(callArgs.status).toBe('completed');
  });
});

// ─── deleteRoadmapTask ───────────────────────────────────────────────────────
describe('deleteRoadmapTask', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteDoc for valid ids', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteRoadmapTask('node-abc', 'task-xyz');
    // Phase 23: deleteDoc called twice — once for subcollection, once for mirror
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  it('throws when nodeId is empty', async () => {
    await expect(deleteRoadmapTask('', 'task-xyz'))
      .rejects.toThrow('[roadmapTaskService] deleteRoadmapTask: nodeId is required');
  });

  it('throws when taskId is empty', async () => {
    await expect(deleteRoadmapTask('node-abc', ''))
      .rejects.toThrow('[roadmapTaskService] deleteRoadmapTask: taskId is required');
  });

  it('throws when nodeId is null', async () => {
    await expect(deleteRoadmapTask(null, 'task-xyz'))
      .rejects.toThrow('[roadmapTaskService] deleteRoadmapTask: nodeId is required');
  });
});

// ─── subscribeToRoadmapTasks ─────────────────────────────────────────────────
describe('subscribeToRoadmapTasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function for valid nodeId', () => {
    const unsub = subscribeToRoadmapTasks('node-abc', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('immediately calls onData with empty array when nodeId is falsy', () => {
    const onData = vi.fn();
    subscribeToRoadmapTasks(null, onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('returns a no-op unsubscribe when nodeId is falsy', () => {
    const unsub = subscribeToRoadmapTasks('', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});

// ─── Phase 23: Mirror-write regression tests ─────────────────────────────────
describe('Phase 23 — mirror-write to root tasks/ collection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createRoadmapTask: batch.set is called with _mirrorOf="roadmap"', async () => {
    const firestore = await import('firebase/firestore');
    await createRoadmapTask('node-abc', validForm, 'admin-uid');
    const batch = firestore.writeBatch.mock.results[0].value;
    expect(firestore.writeBatch).toHaveBeenCalledTimes(1);
    expect(batch.set).toHaveBeenCalledTimes(1);
    const mirrorData = batch.set.mock.calls[0][1];
    expect(mirrorData._mirrorOf).toBe('roadmap');
    expect(mirrorData.roadmapNodeId).toBe('node-abc');
    expect(mirrorData.workPartnerUids).toEqual([]);
  });

  it('createRoadmapTask: mirror uses same ID as subcollection doc (new-task-id)', async () => {
    const { doc } = await import('firebase/firestore');
    await createRoadmapTask('node-abc', validForm, 'admin-uid');
    // doc() should have been called with the tasks collection + 'new-task-id'
    const docCalls = doc.mock.calls.map((c) => c.slice(1));
    const mirrorCall = docCalls.find((args) => args.includes('new-task-id'));
    expect(mirrorCall).toBeDefined();
  });

  it('updateRoadmapTask: mirror updateDoc is called with synced status field', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateRoadmapTask('node-abc', 'task-xyz', { status: 'completed', progress: 100 }, 'uid-1');
    // 2nd call = mirror update
    const mirrorArgs = updateDoc.mock.calls[1][1];
    expect(mirrorArgs.status).toBe('completed');
    expect(mirrorArgs.progress).toBe(100);
    expect(mirrorArgs.updatedBy).toBe('uid-1');
  });

  it('updateRoadmapTask: mirror does NOT include _mirrorOf (stable marker, not synced)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    await updateRoadmapTask('node-abc', 'task-xyz', { title: 'New title' }, 'uid-1');
    const mirrorArgs = updateDoc.mock.calls[1][1];
    // _mirrorOf should NOT be in the update payload — it was set at creation
    expect(mirrorArgs._mirrorOf).toBeUndefined();
  });

  it('deleteRoadmapTask: deleteDoc called twice (subcollection + mirror)', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteRoadmapTask('node-abc', 'task-xyz');
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  it('createRoadmapTask: mirror failure is non-fatal (batch.commit throws)', async () => {
    const firestore = await import('firebase/firestore');
    // Make batch.commit throw to simulate mirror failure
    firestore.__mockBatch.commit.mockRejectedValueOnce(new Error('mirror network error'));
    // Should not throw — the primary addDoc already succeeded
    await expect(createRoadmapTask('node-abc', validForm, 'admin-uid')).resolves.toBe('new-task-id');
  });
});
