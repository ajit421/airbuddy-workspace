/**
 * roadmapCommentService.test.js — Phase 20 unit tests
 *
 * Tests guard clauses, field assembly, and subscription behaviour for
 * roadmapCommentService. Firestore calls are fully mocked — no real
 * database connection needed.
 *
 * Follows roadmapTaskService.test.js conventions exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection:       vi.fn().mockReturnValue('col-ref'),
  doc:              vi.fn().mockReturnValue('doc-ref'),
  addDoc:           vi.fn().mockResolvedValue({ id: 'new-comment-id' }),
  deleteDoc:        vi.fn().mockResolvedValue(undefined),
  query:            vi.fn().mockReturnValue('query-ref'),
  orderBy:          vi.fn().mockReturnValue('order-ref'),
  onSnapshot:       vi.fn().mockReturnValue(() => {}),
  serverTimestamp:  vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
}));

// ── Mock firebase.js init module ──────────────────────────────────────────────
vi.mock('./firebase', () => ({ db: {} }));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import {
  subscribeToComments,
  postComment,
  deleteComment,
} from './roadmapCommentService';
import { addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ─── subscribeToComments ──────────────────────────────────────────────────────
describe('subscribeToComments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function for valid nodeId', () => {
    const unsub = subscribeToComments('node-abc', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('calls onData([]) immediately when nodeId is falsy (null)', () => {
    const onData = vi.fn();
    subscribeToComments(null, onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('calls onData([]) immediately when nodeId is empty string', () => {
    const onData = vi.fn();
    subscribeToComments('', onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('returns a no-op unsubscribe when nodeId is falsy', () => {
    const unsub = subscribeToComments(null, vi.fn(), vi.fn());
    expect(() => unsub()).not.toThrow();
  });

  it('does NOT call onSnapshot when nodeId is falsy', async () => {
    subscribeToComments(null, vi.fn());
    expect(onSnapshot).not.toHaveBeenCalled();
  });
});

// ─── postComment ──────────────────────────────────────────────────────────────
describe('postComment', () => {
  beforeEach(() => vi.clearAllMocks());

  const author = { uid: 'user-uid', name: 'Alice', avatar: 'https://avatar.url' };

  it('returns new comment ID on success', async () => {
    const id = await postComment('node-abc', 'Great progress!', author);
    expect(id).toBe('new-comment-id');
  });

  it('calls addDoc once', async () => {
    await postComment('node-abc', 'Hello', author);
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('writes trimmed text to Firestore', async () => {
    await postComment('node-abc', '  trimmed comment  ', author);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.text).toBe('trimmed comment');
  });

  it('writes correct authorUid', async () => {
    await postComment('node-abc', 'Hi', author);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.authorUid).toBe('user-uid');
  });

  it('writes correct authorName', async () => {
    await postComment('node-abc', 'Hi', author);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.authorName).toBe('Alice');
  });

  it('writes authorAvatar to payload', async () => {
    await postComment('node-abc', 'Hi', author);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.authorAvatar).toBe('https://avatar.url');
  });

  it('uses serverTimestamp() for createdAt', async () => {
    await postComment('node-abc', 'Hi', author);
    const payload = addDoc.mock.calls[0][1];
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
  });

  it('defaults authorName to "Unknown" when not provided', async () => {
    await postComment('node-abc', 'Hi', { uid: 'x' });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.authorName).toBe('Unknown');
  });

  it('defaults authorAvatar to "" when not provided', async () => {
    await postComment('node-abc', 'Hi', { uid: 'x', name: 'Bob' });
    const payload = addDoc.mock.calls[0][1];
    expect(payload.authorAvatar).toBe('');
  });

  it('throws when text is empty string', async () => {
    await expect(postComment('node-abc', '', author)).rejects.toThrow();
  });

  it('throws when text is whitespace-only', async () => {
    await expect(postComment('node-abc', '   ', author)).rejects.toThrow();
  });

  it('throws when nodeId is falsy', async () => {
    await expect(postComment('', 'Hello', author))
      .rejects.toThrow('[roadmapCommentService] postComment: nodeId is required');
  });

  it('throws when nodeId is null', async () => {
    await expect(postComment(null, 'Hello', author))
      .rejects.toThrow('[roadmapCommentService] postComment: nodeId is required');
  });
});

// ─── deleteComment ────────────────────────────────────────────────────────────
describe('deleteComment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteDoc once for valid ids', async () => {
    await deleteComment('node-abc', 'comment-xyz');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('resolves to undefined on success', async () => {
    await expect(deleteComment('node-abc', 'comment-xyz')).resolves.toBeUndefined();
  });

  it('throws when nodeId is missing', async () => {
    await expect(deleteComment('', 'comment-xyz'))
      .rejects.toThrow('[roadmapCommentService] deleteComment: nodeId and commentId are required');
  });

  it('throws when commentId is missing', async () => {
    await expect(deleteComment('node-abc', ''))
      .rejects.toThrow('[roadmapCommentService] deleteComment: nodeId and commentId are required');
  });

  it('throws when both ids are missing', async () => {
    await expect(deleteComment('', ''))
      .rejects.toThrow('[roadmapCommentService] deleteComment: nodeId and commentId are required');
  });

  it('throws when nodeId is null', async () => {
    await expect(deleteComment(null, 'comment-xyz'))
      .rejects.toThrow('[roadmapCommentService] deleteComment: nodeId and commentId are required');
  });
});
