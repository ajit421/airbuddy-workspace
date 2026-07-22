/**
 * roadmapAttachmentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for file attachments on roadmap nodes.
 *
 * Storage path:  roadmapAttachments/{nodeId}/{timestamp}_{sanitizedFilename}
 * Firestore path: roadmapNodes/{nodeId}/attachments/{attachmentId}
 *
 * Firestore attachment document shape:
 *   {
 *     fileName:    string,   // original file name
 *     fileSize:    number,   // bytes
 *     fileType:    string,   // MIME type
 *     storagePath: string,   // full Storage path (for deletion)
 *     downloadUrl: string,   // public download URL
 *     uploadedBy:  string,   // uid
 *     uploadedAt:  Timestamp,
 *   }
 *
 * Client-side constraints (defense in depth — Firestore/Storage Rules enforce server-side):
 *   - Max file size: 10 MB
 *   - Allowed MIME type prefixes: image/, application/pdf, application/msword,
 *     application/vnd.*, text/plain
 *
 * Permissions:
 *   - Any authenticated user can upload.
 *   - Only admins can delete (enforced at UI + Firestore Rules layer).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db, storage } from './firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

// ─── Constants ────────────────────────────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.',
  'text/plain',
  'text/csv',
];

export const FILE_TYPE_LABELS = {
  'image/':             'Image',
  'application/pdf':    'PDF',
  'application/msword': 'Word',
  'application/vnd.':   'Document',
  'text/plain':         'Text',
  'text/csv':           'CSV',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const attachmentsCol = (nodeId) =>
  collection(db, 'roadmapNodes', nodeId, 'attachments');

/** Sanitise filename: strip path separators, replace spaces */
const sanitiseFilename = (name) =>
  name.replace(/[/\\]/g, '_').replace(/\s+/g, '_').slice(0, 120);

/** Check if a MIME type is in the allowed list */
export function isMimeAllowed(mimeType) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

/** Human-readable label for a MIME type */
export function getMimeLabel(mimeType) {
  const entry = Object.entries(FILE_TYPE_LABELS).find(([prefix]) =>
    mimeType.startsWith(prefix)
  );
  return entry ? entry[1] : 'File';
}

/** Human-readable file size */
export function formatFileSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── 1. subscribeToAttachments ────────────────────────────────────────────────
/**
 * Real-time listener on roadmapNodes/{nodeId}/attachments, ordered newest-first.
 *
 * @param {string}   nodeId
 * @param {function} onData   - Called with attachment array
 * @param {function} [onError]
 * @returns {function} unsubscribe
 */
export function subscribeToAttachments(nodeId, onData, onError) {
  if (!nodeId) {
    onData([]);
    return () => {};
  }

  const q = query(attachmentsCol(nodeId), orderBy('uploadedAt', 'desc'));

  return onSnapshot(
    q,
    (snap) => {
      const attachments = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        uploadedAt: d.data().uploadedAt?.toDate?.() ?? new Date(),
      }));
      onData(attachments);
    },
    (err) => {
      console.error('[roadmapAttachmentService] subscribeToAttachments:', err);
      if (onError) onError(err);
    }
  );
}

// ─── 2. uploadAttachment ──────────────────────────────────────────────────────
/**
 * Uploads a file to Firebase Storage and writes metadata to Firestore.
 *
 * @param {string}   nodeId
 * @param {File}     file           - Browser File object
 * @param {string}   uid            - Uploader's uid
 * @param {function} [onProgress]   - Called with upload percentage (0-100)
 * @returns {Promise<string>}       - resolves with downloadUrl on success
 * @throws {Error} on validation failure or upload/write error
 */
export function uploadAttachment(nodeId, file, uid, onProgress) {
  return new Promise((resolve, reject) => {
    // ── Client-side validation ────────────────────────────────────────────
    if (!nodeId) return reject(new Error('nodeId is required'));
    if (!file)   return reject(new Error('file is required'));

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return reject(new Error(`File is too large (max 10 MB). This file is ${formatFileSize(file.size)}.`));
    }
    if (!isMimeAllowed(file.type)) {
      return reject(new Error(`File type "${file.type}" is not allowed. Upload images, PDFs, Word docs, or plain text files.`));
    }

    // ── Build Storage path ────────────────────────────────────────────────
    const timestamp     = Date.now();
    const safeName      = sanitiseFilename(file.name);
    const storagePath   = `roadmapAttachments/${nodeId}/${timestamp}_${safeName}`;
    const storageRef    = ref(storage, storagePath);

    // ── Start resumable upload ────────────────────────────────────────────
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => {
        console.error('[roadmapAttachmentService] uploadAttachment storage error:', err);
        reject(err);
      },
      async () => {
        // Upload complete — get download URL and write Firestore metadata
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          await addDoc(attachmentsCol(nodeId), {
            fileName:    file.name,
            fileSize:    file.size,
            fileType:    file.type,
            storagePath,
            downloadUrl,
            uploadedBy:  uid,
            uploadedAt:  serverTimestamp(),
          });

          resolve(downloadUrl);
        } catch (err) {
          console.error('[roadmapAttachmentService] uploadAttachment metadata write:', err);
          reject(err);
        }
      }
    );
  });
}

// ─── 3. deleteAttachment ──────────────────────────────────────────────────────
/**
 * Deletes an attachment from both Firebase Storage and Firestore.
 * Admin only (enforced at UI level + Firestore Rules).
 *
 * @param {string} nodeId
 * @param {string} attachmentId  - Firestore document ID
 * @param {string} storagePath   - Storage path (from attachment.storagePath)
 * @returns {Promise<void>}
 */
export async function deleteAttachment(nodeId, attachmentId, storagePath) {
  if (!nodeId || !attachmentId)
    throw new Error('[roadmapAttachmentService] deleteAttachment: nodeId and attachmentId are required');

  try {
    // Delete from Storage first (best-effort — continue even if file missing)
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (storageErr) {
        // File may already be deleted or path wrong — log but don't block Firestore delete
        console.warn('[roadmapAttachmentService] deleteAttachment storage:', storageErr.code);
      }
    }

    // Delete Firestore metadata
    await deleteDoc(doc(db, 'roadmapNodes', nodeId, 'attachments', attachmentId));
  } catch (err) {
    console.error('[roadmapAttachmentService] deleteAttachment:', err);
    throw err;
  }
}
