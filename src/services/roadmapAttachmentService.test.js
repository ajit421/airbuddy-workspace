/**
 * roadmapAttachmentService.test.js — Phase 20 unit tests
 *
 * Tests pure helper functions (isMimeAllowed, getMimeLabel, formatFileSize),
 * constant correctness (MAX_FILE_SIZE_BYTES, ALLOWED_MIME_PREFIXES),
 * subscription guard clauses, and deleteAttachment guard clauses.
 *
 * uploadAttachment is NOT unit-tested here because it depends on
 * Firebase Storage's resumable upload task event emitter
 * (uploadBytesResumable / task.on), which cannot be meaningfully
 * mocked at the unit level without becoming an integration test.
 * It is covered by the e2e / manual verification process.
 *
 * Follows roadmapTaskService.test.js conventions exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection:      vi.fn().mockReturnValue('col-ref'),
  doc:             vi.fn().mockReturnValue('doc-ref'),
  addDoc:          vi.fn().mockResolvedValue({ id: 'new-attach-id' }),
  deleteDoc:       vi.fn().mockResolvedValue(undefined),
  query:           vi.fn().mockReturnValue('query-ref'),
  orderBy:         vi.fn().mockReturnValue('order-ref'),
  onSnapshot:      vi.fn().mockReturnValue(() => {}),
  serverTimestamp: vi.fn().mockReturnValue('SERVER_TIMESTAMP'),
}));

// ── Mock firebase/storage ─────────────────────────────────────────────────────
vi.mock('firebase/storage', () => ({
  ref:                    vi.fn().mockReturnValue('storage-ref'),
  uploadBytesResumable:   vi.fn(),
  getDownloadURL:         vi.fn(),
  deleteObject:           vi.fn().mockResolvedValue(undefined),
}));

// ── Mock firebase.js init module ──────────────────────────────────────────────
vi.mock('./firebase', () => ({ db: {}, storage: {} }));

// ── Import AFTER mocks ────────────────────────────────────────────────────────
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_PREFIXES,
  isMimeAllowed,
  getMimeLabel,
  formatFileSize,
  subscribeToAttachments,
  deleteAttachment,
} from './roadmapAttachmentService';
import { deleteDoc } from 'firebase/firestore';

// ─── Constants ────────────────────────────────────────────────────────────────
describe('MAX_FILE_SIZE_BYTES', () => {
  it('is exactly 10 MB (10 * 1024 * 1024 bytes)', () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('ALLOWED_MIME_PREFIXES', () => {
  it('includes image/ prefix', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('image/');
  });

  it('includes application/pdf prefix', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('application/pdf');
  });

  it('includes text/plain prefix', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('text/plain');
  });

  it('includes text/csv prefix', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('text/csv');
  });

  it('includes application/msword prefix', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('application/msword');
  });

  it('includes application/vnd. prefix (Office docs)', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('application/vnd.');
  });
});

// ─── isMimeAllowed ────────────────────────────────────────────────────────────
describe('isMimeAllowed', () => {
  it('allows image/jpeg', () => {
    expect(isMimeAllowed('image/jpeg')).toBe(true);
  });

  it('allows image/png', () => {
    expect(isMimeAllowed('image/png')).toBe(true);
  });

  it('allows image/webp', () => {
    expect(isMimeAllowed('image/webp')).toBe(true);
  });

  it('allows application/pdf', () => {
    expect(isMimeAllowed('application/pdf')).toBe(true);
  });

  it('allows application/msword', () => {
    expect(isMimeAllowed('application/msword')).toBe(true);
  });

  it('allows application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx)', () => {
    expect(isMimeAllowed('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
  });

  it('allows text/plain', () => {
    expect(isMimeAllowed('text/plain')).toBe(true);
  });

  it('allows text/csv', () => {
    expect(isMimeAllowed('text/csv')).toBe(true);
  });

  it('rejects application/zip', () => {
    expect(isMimeAllowed('application/zip')).toBe(false);
  });

  it('rejects application/x-executable', () => {
    expect(isMimeAllowed('application/x-executable')).toBe(false);
  });

  it('rejects video/mp4', () => {
    expect(isMimeAllowed('video/mp4')).toBe(false);
  });

  it('rejects audio/mpeg', () => {
    expect(isMimeAllowed('audio/mpeg')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isMimeAllowed('')).toBe(false);
  });
});

// ─── getMimeLabel ─────────────────────────────────────────────────────────────
describe('getMimeLabel', () => {
  it('returns "Image" for image/jpeg', () => {
    expect(getMimeLabel('image/jpeg')).toBe('Image');
  });

  it('returns "PDF" for application/pdf', () => {
    expect(getMimeLabel('application/pdf')).toBe('PDF');
  });

  it('returns "Word" for application/msword', () => {
    expect(getMimeLabel('application/msword')).toBe('Word');
  });

  it('returns "Document" for application/vnd.* types', () => {
    expect(getMimeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Document');
  });

  it('returns "Text" for text/plain', () => {
    expect(getMimeLabel('text/plain')).toBe('Text');
  });

  it('returns "CSV" for text/csv', () => {
    expect(getMimeLabel('text/csv')).toBe('CSV');
  });

  it('returns "File" for unknown MIME types', () => {
    expect(getMimeLabel('application/zip')).toBe('File');
  });

  it('returns "File" for empty string', () => {
    expect(getMimeLabel('')).toBe('File');
  });
});

// ─── formatFileSize ───────────────────────────────────────────────────────────
describe('formatFileSize', () => {
  it('formats bytes < 1024 as "N B"', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats bytes 0 as "0 B"', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats exactly 1023 bytes as "1023 B"', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats 1024 bytes as "1.0 KB"', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats 1536 bytes as "1.5 KB"', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats 1 MB (1048576 bytes) as "1.0 MB"', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats 10 MB (MAX_FILE_SIZE_BYTES) correctly', () => {
    expect(formatFileSize(MAX_FILE_SIZE_BYTES)).toBe('10.0 MB');
  });

  it('formats 5.5 MB correctly', () => {
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });
});

// ─── subscribeToAttachments ───────────────────────────────────────────────────
describe('subscribeToAttachments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an unsubscribe function for valid nodeId', () => {
    const unsub = subscribeToAttachments('node-abc', vi.fn(), vi.fn());
    expect(typeof unsub).toBe('function');
  });

  it('calls onData([]) immediately when nodeId is null', () => {
    const onData = vi.fn();
    subscribeToAttachments(null, onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('calls onData([]) immediately when nodeId is empty string', () => {
    const onData = vi.fn();
    subscribeToAttachments('', onData, vi.fn());
    expect(onData).toHaveBeenCalledWith([]);
  });

  it('returns a no-op unsubscribe when nodeId is falsy', () => {
    const unsub = subscribeToAttachments(null, vi.fn(), vi.fn());
    expect(() => unsub()).not.toThrow();
  });
});

// ─── deleteAttachment ─────────────────────────────────────────────────────────
describe('deleteAttachment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteDoc once for valid ids', async () => {
    await deleteAttachment('node-abc', 'attach-xyz', 'roadmapAttachments/node-abc/file.pdf');
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('resolves to undefined on success', async () => {
    await expect(
      deleteAttachment('node-abc', 'attach-xyz', 'path/to/file')
    ).resolves.toBeUndefined();
  });

  it('throws when nodeId is missing', async () => {
    await expect(deleteAttachment('', 'attach-xyz', 'path'))
      .rejects.toThrow('[roadmapAttachmentService] deleteAttachment: nodeId and attachmentId are required');
  });

  it('throws when attachmentId is missing', async () => {
    await expect(deleteAttachment('node-abc', '', 'path'))
      .rejects.toThrow('[roadmapAttachmentService] deleteAttachment: nodeId and attachmentId are required');
  });

  it('throws when nodeId is null', async () => {
    await expect(deleteAttachment(null, 'attach-xyz', 'path'))
      .rejects.toThrow('[roadmapAttachmentService] deleteAttachment: nodeId and attachmentId are required');
  });

  it('does not throw when storagePath is undefined (storage delete is best-effort)', async () => {
    await expect(
      deleteAttachment('node-abc', 'attach-xyz', undefined)
    ).resolves.toBeUndefined();
  });
});
