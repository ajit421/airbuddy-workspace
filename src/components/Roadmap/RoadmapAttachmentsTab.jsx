import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { canEditRoadmapStructure } from '../../utils/permissions';
import {
  subscribeToAttachments,
  uploadAttachment,
  deleteAttachment,
  formatFileSize,
  getMimeLabel,
  MAX_FILE_SIZE_BYTES,
} from '../../services/roadmapAttachmentService';
import { timeFromNow } from '../../utils/dateHelpers';

/**
 * RoadmapAttachmentsTab.jsx
 * File attachment tab for a roadmap node.
 *
 * Permissions:
 *  - All signed-in users can upload (client + Storage Rules).
 *  - Only admins can delete attachments (client + Firestore Rules).
 *
 * Props:
 *  - nodeId {string} Parent roadmap node ID
 */

const ALLOWED_ACCEPT = 'image/*,application/pdf,application/msword,application/vnd.*,text/plain,text/csv';

/** Returns a tailwind color class for a MIME type category */
function mimeColor(mimeType) {
  if (mimeType.startsWith('image/'))        return 'text-purple-400 bg-purple-500/10';
  if (mimeType === 'application/pdf')       return 'text-red-400    bg-red-500/10';
  if (mimeType.startsWith('text/'))         return 'text-blue-400   bg-blue-500/10';
  return                                           'text-text-muted bg-surfaceHover';
}

/** File icon SVG path by MIME category */
function FileIcon({ mimeType, className = 'w-5 h-5' }) {
  if (mimeType.startsWith('image/')) {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

export default function RoadmapAttachmentsTab({ nodeId }) {
  const { userProfile, effectiveUid } = useAuth();
  const isAdmin = canEditRoadmapStructure(userProfile);
  const uid     = effectiveUid ?? userProfile?.uid;

  const [attachments,  setAttachments]  = useState([]);
  const [loading,      setLoading]      = useState(true);

  // Upload state
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [uploadError,  setUploadError]  = useState('');
  const [dragOver,     setDragOver]     = useState(false);

  const fileInputRef = useRef(null);
  const unsubRef     = useRef(null);

  // ── Subscribe to attachments realtime ─────────────────────────────────────
  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    unsubRef.current = subscribeToAttachments(
      nodeId,
      (data) => { setAttachments(data); setLoading(false); },
      (err)  => { console.error('[AttachmentsTab]', err); setLoading(false); }
    );
    return () => { unsubRef.current?.(); };
  }, [nodeId]);

  // ── Handle file selection/drop ────────────────────────────────────────────
  const processFile = async (file) => {
    if (!file || !uid) return;
    setUploadError('');
    setUploading(true);
    setUploadPct(0);

    try {
      await uploadAttachment(nodeId, file, uid, (pct) => setUploadPct(pct));
    } catch (err) {
      setUploadError(err?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Delete attachment ─────────────────────────────────────────────────────
  const handleDelete = async (att) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete "${att.fileName}"? This cannot be undone.`)) return;
    try {
      await deleteAttachment(nodeId, att.id, att.storagePath);
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-surfaceHover rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Attachment list ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {attachments.length === 0 && !uploading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-surfaceHover border border-border flex items-center justify-center">
              <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </div>
            <div>
              <p className="text-text-secondary font-medium text-sm">No attachments yet</p>
              <p className="text-text-muted text-xs mt-0.5">Upload files below (max 10 MB each).</p>
            </div>
          </div>
        ) : (
          attachments.map((att) => {
            const isImage   = att.fileType?.startsWith('image/');
            const colorCls  = mimeColor(att.fileType ?? '');
            const label     = getMimeLabel(att.fileType ?? '');

            return (
              <div
                key={att.id}
                className="group flex items-start gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surfaceHover transition-colors"
              >
                {/* Thumbnail for images, icon for others */}
                {isImage ? (
                  <img
                    src={att.downloadUrl}
                    alt={att.fileName}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-border"
                    loading="lazy"
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                    <FileIcon mimeType={att.fileType ?? ''} />
                  </div>
                )}

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate" title={att.fileName}>
                    {att.fileName}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-[10px] text-text-muted">{label}</span>
                    <span className="text-[10px] text-text-muted">·</span>
                    <span className="text-[10px] text-text-muted">{formatFileSize(att.fileSize ?? 0)}</span>
                    <span className="text-[10px] text-text-muted">·</span>
                    <span className="text-[10px] text-text-muted">{timeFromNow(att.uploadedAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Download */}
                  <a
                    href={att.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={att.fileName}
                    className="btn-ghost p-1.5 rounded-lg"
                    title="Download"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>

                  {/* Admin delete */}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(att)}
                      className="btn-ghost p-1.5 rounded-lg hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete attachment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Upload progress card */}
        {uploading && (
          <div className="p-3 rounded-xl border border-orange/30 bg-orange-muted/20 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-orange/40 border-t-orange rounded-full animate-spin" />
              <span className="text-xs text-orange font-medium">Uploading… {uploadPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-orange rounded-full transition-all duration-300"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Upload zone ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border p-3 space-y-2">
        {uploadError && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
            </svg>
            <p className="text-red-400 text-xs">{uploadError}</p>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ACCEPT}
          onChange={handleFileInput}
          className="hidden"
          id="rm-attachment-input"
        />

        {/* Drag-and-drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-xl border-2 border-dashed cursor-pointer
            transition-colors select-none
            ${dragOver
              ? 'border-orange bg-orange-muted/30 text-orange'
              : 'border-border hover:border-orange/50 hover:bg-orange-muted/10 text-text-muted'}
            ${uploading ? 'pointer-events-none opacity-50' : ''}
          `}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div className="text-center">
            <p className="text-xs font-medium">
              {dragOver ? 'Drop to upload' : 'Click or drag & drop to upload'}
            </p>
            <p className="text-[10px] mt-0.5">Images, PDF, Word, Text · Max 10 MB</p>
          </div>
        </div>
      </div>
    </div>
  );
}
