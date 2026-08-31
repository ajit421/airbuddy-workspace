/**
 * todoService.test.js — Task Todo List unit tests
 *
 * Covers the Zod write boundaries, the pure helpers (normalizeTodos,
 * getTodoStats), and the field assembly of every CRUD operation.
 * Firestore is fully mocked — no real database connection needed.
 *
 * Follows roadmapCommentService.test.js conventions exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
// runTransaction is driven by `txDocData`: the fake transaction reads from it,
// so each test can stage the server-side state the mutation will see.
vi.mock('firebase/firestore', () => ({
  doc:             vi.fn().mockReturnValue('doc-ref'),
  updateDoc:       vi.fn().mockResolvedValue(undefined),
  onSnapshot:      vi.fn().mockReturnValue(() => {}),
  arrayUnion:      vi.fn((v) => ({ __arrayUnion: v })),
  serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
  runTransaction:  vi.fn(),
}));

// ── Mock firebase.js init module ──────────────────────────────────────────────
vi.mock('./firebase', () => ({ db: {} }));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import {
  normalizeTodos,
  getTodoStats,
  subscribeToTaskTodos,
  addTodo,
  updateTodoText,
  toggleTodo,
  deleteTodo,
  TODO_MAX_LENGTH,
} from './todoService';
import { updateDoc, onSnapshot, runTransaction } from 'firebase/firestore';

const AUTHOR = { uid: 'uid-1', name: 'Tech Team' };

/** Captures what the fake transaction wrote: [{ ref, payload }]. */
let txWrites = [];

/**
 * Stages the server-side todo array that the next transaction will read, and
 * wires runTransaction to a fake tx that records its update() calls.
 *
 * @param {Array<Object>|undefined} todos - Stored `todos` field
 * @param {{ exists?: boolean }} [opts]   - Pass { exists: false } for a deleted task
 */
function stageTransaction(todos, { exists = true } = {}) {
  txWrites = [];
  runTransaction.mockImplementation(async (_db, cb) =>
    cb({
      get: async () => ({ exists: () => exists, data: () => ({ todos }) }),
      update: (ref, payload) => { txWrites.push({ ref, payload }); },
    })
  );
}

/** The payload of the single write the last transaction performed. */
const lastTxPayload = () => txWrites[txWrites.length - 1]?.payload;

/** Builds a stored todo item with sensible defaults. */
const makeTodo = (over = {}) => ({
  id:              'todo-1',
  text:            'Draft the RFQ',
  done:            false,
  createdAt:       '2026-08-01T10:00:00.000Z',
  createdBy:       'uid-1',
  createdByName:   'Tech Team',
  completedAt:     null,
  completedBy:     null,
  completedByName: null,
  ...over,
});

// ─── normalizeTodos ───────────────────────────────────────────────────────────
describe('normalizeTodos', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeTodos(undefined)).toEqual([]);
    expect(normalizeTodos(null)).toEqual([]);
    expect(normalizeTodos('nope')).toEqual([]);
    expect(normalizeTodos({ 0: 'a' })).toEqual([]);
  });

  it('drops entries that are not objects with text', () => {
    const out = normalizeTodos([makeTodo(), null, 'string', 42, { done: true }]);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Draft the RFQ');
  });

  it('coerces missing fields to safe defaults', () => {
    const [item] = normalizeTodos([{ text: 'bare item' }]);
    expect(item).toMatchObject({
      text:            'bare item',
      done:            false,
      createdAt:       '',
      createdBy:       '',
      createdByName:   '',
      completedAt:     null,
      completedBy:     null,
      completedByName: null,
    });
    expect(item.id).toBe('legacy-0');
  });

  it('treats only done === true as done (no truthiness coercion)', () => {
    const out = normalizeTodos([
      { text: 'a', done: 'yes' },
      { text: 'b', done: 1 },
      { text: 'c', done: true },
    ]);
    expect(out.map((t) => t.done)).toEqual([false, false, true]);
  });

  it('sorts oldest-first by createdAt', () => {
    const out = normalizeTodos([
      makeTodo({ id: 'b', text: 'second', createdAt: '2026-08-02T00:00:00.000Z' }),
      makeTodo({ id: 'a', text: 'first',  createdAt: '2026-08-01T00:00:00.000Z' }),
      makeTodo({ id: 'c', text: 'third',  createdAt: '2026-08-03T00:00:00.000Z' }),
    ]);
    expect(out.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

// ─── getTodoStats ─────────────────────────────────────────────────────────────
describe('getTodoStats', () => {
  it('reports 0% for an empty list rather than NaN', () => {
    expect(getTodoStats([])).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it('handles non-array input defensively', () => {
    expect(getTodoStats(undefined)).toEqual({ total: 0, done: 0, percent: 0 });
    expect(getTodoStats(null)).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it('counts done items and rounds the percentage', () => {
    const todos = [
      makeTodo({ id: '1', done: true }),
      makeTodo({ id: '2', done: true }),
      makeTodo({ id: '3', done: false }),
    ];
    expect(getTodoStats(todos)).toEqual({ total: 3, done: 2, percent: 67 });
  });

  it('reports 100% when every item is done', () => {
    const todos = [makeTodo({ id: '1', done: true }), makeTodo({ id: '2', done: true })];
    expect(getTodoStats(todos)).toEqual({ total: 2, done: 2, percent: 100 });
  });
});

// ─── subscribeToTaskTodos ─────────────────────────────────────────────────────
describe('subscribeToTaskTodos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function for a valid taskId', () => {
    const unsub = subscribeToTaskTodos('task-1', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('throws when the work item is missing', () => {
    expect(() => subscribeToTaskTodos('', vi.fn())).toThrow(/task is required/);
  });

  it('passes the normalized array to onData', () => {
    const onData = vi.fn();
    onSnapshot.mockImplementationOnce((_ref, next) => {
      next({ exists: () => true, data: () => ({ todos: [makeTodo(), { text: 'raw' }] }) });
      return () => {};
    });

    subscribeToTaskTodos('task-1', onData, vi.fn());

    expect(onData).toHaveBeenCalledTimes(1);
    const todos = onData.mock.calls[0][0];
    expect(todos).toHaveLength(2);
    expect(todos.every((t) => typeof t.done === 'boolean')).toBe(true);
  });

  it('emits [] when the task document does not exist', () => {
    const onData = vi.fn();
    onSnapshot.mockImplementationOnce((_ref, next) => {
      next({ exists: () => false, data: () => undefined });
      return () => {};
    });

    subscribeToTaskTodos('task-1', onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('forwards snapshot errors to onError', () => {
    const onError = vi.fn();
    const boom = new Error('permission-denied');
    onSnapshot.mockImplementationOnce((_ref, _next, err) => { err(boom); return () => {}; });

    subscribeToTaskTodos('task-1', vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(boom);
  });
});

// ─── addTodo ──────────────────────────────────────────────────────────────────
describe('addTodo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes an unchecked item via arrayUnion and bumps updatedAt', async () => {
    const item = await addTodo('task-1', 'Draft the RFQ', AUTHOR);

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const payload = updateDoc.mock.calls[0][1];
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
    expect(payload.todos.__arrayUnion).toEqual(item);

    expect(item).toMatchObject({
      text:          'Draft the RFQ',
      done:          false,
      createdBy:     'uid-1',
      createdByName: 'Tech Team',
      completedAt:   null,
    });
    expect(item.id).toBeTruthy();
  });

  it('trims the text before writing', async () => {
    const item = await addTodo('task-1', '   spaced out   ', AUTHOR);
    expect(item.text).toBe('spaced out');
  });

  it('rejects empty or whitespace-only text without writing', async () => {
    await expect(addTodo('task-1', '   ', AUTHOR)).rejects.toThrow();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it(`rejects text longer than ${TODO_MAX_LENGTH} characters`, async () => {
    await expect(addTodo('task-1', 'x'.repeat(TODO_MAX_LENGTH + 1), AUTHOR)).rejects.toThrow();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it(`accepts text of exactly ${TODO_MAX_LENGTH} characters`, async () => {
    const item = await addTodo('task-1', 'x'.repeat(TODO_MAX_LENGTH), AUTHOR);
    expect(item.text).toHaveLength(TODO_MAX_LENGTH);
  });

  it('throws when the work item is missing', async () => {
    await expect(addTodo('', 'text', AUTHOR)).rejects.toThrow(/task is required/);
  });

  it('tolerates a missing author without throwing', async () => {
    const item = await addTodo('task-1', 'orphan item', undefined);
    expect(item.createdBy).toBe('');
    expect(item.createdByName).toBe('');
  });

  it('generates a distinct id per item', async () => {
    const a = await addTodo('task-1', 'one', AUTHOR);
    const b = await addTodo('task-1', 'two', AUTHOR);
    expect(a.id).not.toBe(b.id);
  });

  it('rethrows Firestore failures', async () => {
    updateDoc.mockRejectedValueOnce(new Error('offline'));
    await expect(addTodo('task-1', 'text', AUTHOR)).rejects.toThrow('offline');
  });
});

// ─── updateTodoText ───────────────────────────────────────────────────────────
describe('updateTodoText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rewrites only the targeted item', async () => {
    stageTransaction([makeTodo({ id: 'a' }), makeTodo({ id: 'b', text: 'Untouched' })]);
    const next = await updateTodoText('task-1', 'a', 'Rewritten');

    expect(next.find((t) => t.id === 'a').text).toBe('Rewritten');
    expect(next.find((t) => t.id === 'b').text).toBe('Untouched');
    expect(lastTxPayload().updatedAt).toBe('SERVER_TIMESTAMP');
    expect(lastTxPayload().todos).toEqual(next);
  });

  it('preserves the done state and author of the edited item', async () => {
    stageTransaction([makeTodo({
      id: 'a', done: true,
      completedBy: 'uid-9', completedAt: '2026-08-05T00:00:00.000Z', completedByName: 'Someone',
    })]);
    const [item] = await updateTodoText('task-1', 'a', 'New text');

    expect(item.done).toBe(true);
    expect(item.completedBy).toBe('uid-9');
    expect(item.createdBy).toBe('uid-1');
  });

  it('edits against the SERVER array, not a caller-supplied one (no lost update)', async () => {
    // Server already has b checked by someone else; our edit must not revert it.
    stageTransaction([makeTodo({ id: 'a' }), makeTodo({ id: 'b', done: true, completedBy: 'uid-2', completedAt: '2026-08-06T00:00:00.000Z', completedByName: 'Colleague' })]);
    const next = await updateTodoText('task-1', 'a', 'Rewritten');

    expect(next.find((t) => t.id === 'b').done).toBe(true);
    expect(next.find((t) => t.id === 'b').completedBy).toBe('uid-2');
  });

  it('trims the new text', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    const [item] = await updateTodoText('task-1', 'a', '   padded   ');
    expect(item.text).toBe('padded');
  });

  it('rejects an unknown todoId without writing', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    await expect(updateTodoText('task-1', 'ghost', 'x')).rejects.toThrow(/not found/);
    expect(txWrites).toHaveLength(0);
  });

  it('aborts when the task has been deleted', async () => {
    stageTransaction(undefined, { exists: false });
    await expect(updateTodoText('task-1', 'a', 'x')).rejects.toThrow(/no longer exists/);
    expect(txWrites).toHaveLength(0);
  });

  it('rejects empty text before opening a transaction', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    await expect(updateTodoText('task-1', 'a', '  ')).rejects.toThrow();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it(`rejects text longer than ${TODO_MAX_LENGTH} characters`, async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    await expect(updateTodoText('task-1', 'a', 'x'.repeat(TODO_MAX_LENGTH + 1))).rejects.toThrow();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('throws when ids are missing', async () => {
    await expect(updateTodoText('', 'a', 'x')).rejects.toThrow(/task is required/);
    await expect(updateTodoText('task-1', '', 'x')).rejects.toThrow(/todoId is required/);
  });
});

// ─── toggleTodo ───────────────────────────────────────────────────────────────
describe('toggleTodo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks an open item and stamps who completed it', async () => {
    stageTransaction([makeTodo({ id: 'a', done: false })]);
    const [item] = await toggleTodo('task-1', 'a', AUTHOR);

    expect(item.done).toBe(true);
    expect(item.completedBy).toBe('uid-1');
    expect(item.completedByName).toBe('Tech Team');
    expect(typeof item.completedAt).toBe('string');
    expect(lastTxPayload().updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('clears the completion stamp when unchecking', async () => {
    stageTransaction([makeTodo({
      id: 'a', done: true,
      completedAt: '2026-08-05T00:00:00.000Z', completedBy: 'uid-1', completedByName: 'Tech Team',
    })]);
    const [item] = await toggleTodo('task-1', 'a', AUTHOR);

    expect(item.done).toBe(false);
    expect(item.completedAt).toBeNull();
    expect(item.completedBy).toBeNull();
    expect(item.completedByName).toBeNull();
  });

  it('flips from the SERVER value, so a stale client view cannot desync it', async () => {
    // Client last saw `a` unchecked, but the server says it is already checked:
    // the transaction must flip server-true -> false, not re-apply true.
    stageTransaction([makeTodo({ id: 'a', done: true, completedBy: 'uid-2', completedAt: '2026-08-06T00:00:00.000Z', completedByName: 'Colleague' })]);
    const [item] = await toggleTodo('task-1', 'a', AUTHOR);
    expect(item.done).toBe(false);
  });

  it('leaves sibling items untouched', async () => {
    stageTransaction([makeTodo({ id: 'a' }), makeTodo({ id: 'b', done: true })]);
    const next = await toggleTodo('task-1', 'a', AUTHOR);
    expect(next.find((t) => t.id === 'b').done).toBe(true);
  });

  it('rejects an unknown todoId without writing', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    await expect(toggleTodo('task-1', 'ghost', AUTHOR)).rejects.toThrow(/not found/);
    expect(txWrites).toHaveLength(0);
  });

  it('tolerates a missing actor when checking', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    const [item] = await toggleTodo('task-1', 'a', undefined);
    expect(item.done).toBe(true);
    expect(item.completedBy).toBe('');
  });

  it('throws when ids are missing', async () => {
    await expect(toggleTodo('', 'a', AUTHOR)).rejects.toThrow(/task is required/);
    await expect(toggleTodo('task-1', '', AUTHOR)).rejects.toThrow(/todoId is required/);
  });
});

// ─── deleteTodo ───────────────────────────────────────────────────────────────
describe('deleteTodo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes the targeted item and keeps the rest', async () => {
    stageTransaction([makeTodo({ id: 'a' }), makeTodo({ id: 'b' })]);
    const next = await deleteTodo('task-1', 'a');

    expect(next.map((t) => t.id)).toEqual(['b']);
    expect(lastTxPayload().todos).toEqual(next);
  });

  it('writes an empty array when the last item is removed', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    const next = await deleteTodo('task-1', 'a');
    expect(next).toEqual([]);
    expect(lastTxPayload().todos).toEqual([]);
  });

  it('keeps items another user added since the client last synced', async () => {
    stageTransaction([makeTodo({ id: 'a' }), makeTodo({ id: 'newcomer', text: 'Added elsewhere' })]);
    const next = await deleteTodo('task-1', 'a');
    expect(next.map((t) => t.id)).toEqual(['newcomer']);
  });

  it('is a no-op write for an unknown id (list unchanged)', async () => {
    stageTransaction([makeTodo({ id: 'a' })]);
    const next = await deleteTodo('task-1', 'ghost');
    expect(next).toHaveLength(1);
  });

  it('throws when ids are missing', async () => {
    await expect(deleteTodo('', 'a')).rejects.toThrow(/task is required/);
    await expect(deleteTodo('task-1', '')).rejects.toThrow(/todoId is required/);
  });

  it('rethrows Firestore failures', async () => {
    runTransaction.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(deleteTodo('task-1', 'a')).rejects.toThrow('permission-denied');
  });
});
