/**
 * roadmapHistoryService.test.js — Phase 20 unit tests
 *
 * Tests guard clauses, pagination logic, and subscription behaviour for
 * roadmapHistoryService. Firestore calls are fully mocked.
 *
 * Key behaviours under test:
 *  - subscribeToNodeHistory: real-time listener with pageSize limit
 *  - getNodeHistoryPage: paginated one-shot fetch with hasMore detection
 *    (fetches pageSize+1 documents to detect whether more exist)
 *
 * Follows roadmapTaskService.test.js conventions exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection:   vi.fn().mockReturnValue('col-ref'),
  query:        vi.fn().mockReturnValue('query-ref'),
  orderBy:      vi.fn().mockReturnValue('order-ref'),
  limit:        vi.fn().mockReturnValue('limit-ref'),
  startAfter:   vi.fn().mockReturnValue('start-after-ref'),
  getDocs:      vi.fn(),
  onSnapshot:   vi.fn().mockReturnValue(() => {}),
}));

// ── Mock firebase.js init module ──────────────────────────────────────────────
vi.mock('./firebase', () => ({ db: {} }));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import {
  subscribeToNodeHistory,
  getNodeHistoryPage,
} from './roadmapHistoryService';
import { getDocs, onSnapshot, limit, orderBy, startAfter } from 'firebase/firestore';

// Helper: build a mock Firestore snapshot with N fake docs
function makeSnap(count, withTimestamp = true) {
  const docs = Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    data: () => ({
      action:      'updated',
      changedBy:   'uid-1',
      changedFields: [],
      entityType:  'node',
      timestamp:   withTimestamp ? { toDate: () => new Date('2026-01-01') } : null,
    }),
  }));
  return { docs };
}

// ─── subscribeToNodeHistory ───────────────────────────────────────────────────
describe('subscribeToNodeHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function for valid nodeId', () => {
    const unsub = subscribeToNodeHistory('node-abc', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('calls onData([]) immediately when nodeId is falsy (null)', () => {
    const onData = vi.fn();
    subscribeToNodeHistory(null, onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('calls onData([]) immediately when nodeId is empty string', () => {
    const onData = vi.fn();
    subscribeToNodeHistory('', onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('returns a no-op unsubscribe when nodeId is falsy', () => {
    const unsub = subscribeToNodeHistory(null, vi.fn(), vi.fn());
    expect(() => unsub()).not.toThrow();
  });

  it('does NOT call onSnapshot when nodeId is falsy', () => {
    subscribeToNodeHistory(null, vi.fn());
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('calls onSnapshot when nodeId is valid', () => {
    subscribeToNodeHistory('node-abc', vi.fn());
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('orders by timestamp descending', () => {
    subscribeToNodeHistory('node-abc', vi.fn());
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
  });

  it('applies default page limit of 20', () => {
    subscribeToNodeHistory('node-abc', vi.fn());
    expect(limit).toHaveBeenCalledWith(20);
  });

  it('applies custom pageSize when provided', () => {
    subscribeToNodeHistory('node-abc', vi.fn(), vi.fn(), 5);
    expect(limit).toHaveBeenCalledWith(5);
  });
});

// ─── getNodeHistoryPage ───────────────────────────────────────────────────────
describe('getNodeHistoryPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty result for falsy nodeId (null)', async () => {
    const result = await getNodeHistoryPage(null);
    expect(result).toEqual({ entries: [], lastDoc: null, hasMore: false });
  });

  it('returns empty result for empty string nodeId', async () => {
    const result = await getNodeHistoryPage('');
    expect(result).toEqual({ entries: [], lastDoc: null, hasMore: false });
  });

  it('does NOT call getDocs when nodeId is falsy', async () => {
    await getNodeHistoryPage(null);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('calls getDocs once for valid nodeId', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(3));
    await getNodeHistoryPage('node-abc');
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('fetches pageSize+1 documents (hasMore detection trick)', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(5));
    await getNodeHistoryPage('node-abc', null, 4); // pageSize=4 → fetches 5
    expect(limit).toHaveBeenCalledWith(5); // pageSize + 1
  });

  it('hasMore=false when docs returned ≤ pageSize', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(3)); // 3 docs, pageSize default 20
    const result = await getNodeHistoryPage('node-abc');
    expect(result.hasMore).toBe(false);
    expect(result.entries.length).toBe(3);
  });

  it('hasMore=true and slices to pageSize when extra doc returned', async () => {
    // pageSize=3, fetch returns 4 (3+1), so hasMore=true and we slice to 3
    getDocs.mockResolvedValueOnce(makeSnap(4));
    const result = await getNodeHistoryPage('node-abc', null, 3);
    expect(result.hasMore).toBe(true);
    expect(result.entries.length).toBe(3);
  });

  it('returns lastDoc=null when no docs returned', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(0));
    const result = await getNodeHistoryPage('node-abc');
    expect(result.lastDoc).toBeNull();
  });

  it('returns lastDoc as the last entry in the docs array', async () => {
    const snap = makeSnap(3);
    getDocs.mockResolvedValueOnce(snap);
    const result = await getNodeHistoryPage('node-abc');
    expect(result.lastDoc).toBe(snap.docs[2]);
  });

  it('calls startAfter when lastDoc is provided', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(0));
    const mockLastDoc = { id: 'cursor-doc' };
    await getNodeHistoryPage('node-abc', mockLastDoc);
    expect(startAfter).toHaveBeenCalledWith(mockLastDoc);
  });

  it('does NOT call startAfter when lastDoc is null', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(0));
    await getNodeHistoryPage('node-abc', null);
    expect(startAfter).not.toHaveBeenCalled();
  });

  it('normalises timestamp via toDate() when present', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(1, true));
    const result = await getNodeHistoryPage('node-abc');
    expect(result.entries[0].timestamp).toBeInstanceOf(Date);
  });

  it('orders results by timestamp descending', async () => {
    getDocs.mockResolvedValueOnce(makeSnap(1));
    await getNodeHistoryPage('node-abc');
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
  });

  it('throws (re-throws) when getDocs rejects', async () => {
    getDocs.mockRejectedValueOnce(new Error('Firestore unavailable'));
    await expect(getNodeHistoryPage('node-abc')).rejects.toThrow('Firestore unavailable');
  });
});
