import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { canEditRoadmapStructure } from '../../utils/permissions';
import { subscribeToComments, postComment, deleteComment } from '../../services/roadmapCommentService';
import { timeFromNow } from '../../utils/dateHelpers';
import { notifyUsers, ROADMAP_NOTIF_TYPES } from '../../services/notificationService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

/**
 * RoadmapCommentsTab.jsx
 * Real-time comment feed for a roadmap node.
 *
 * Permissions:
 *  - All signed-in users can post comments.
 *  - Users can delete their own comments.
 *  - Admins can delete any comment.
 *
 * Props:
 *  - nodeId {string} Parent roadmap node ID
 */
export default function RoadmapCommentsTab({ nodeId }) {
  const { userProfile, effectiveUid } = useAuth();
  const isAdmin = canEditRoadmapStructure(userProfile);
  const uid     = effectiveUid ?? userProfile?.uid;

  const [comments,  setComments]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [text,      setText]      = useState('');
  const [posting,   setPosting]   = useState(false);
  const [postError, setPostError] = useState('');

  const feedRef    = useRef(null);
  const textareaRef = useRef(null);
  const unsubRef   = useRef(null);

  // ── Subscribe to comments realtime ────────────────────────────────────────
  useEffect(() => {
    if (!nodeId) return;
    setLoading(true);
    unsubRef.current = subscribeToComments(
      nodeId,
      (data) => { setComments(data); setLoading(false); },
      (err)  => { console.error('[CommentsTab]', err); setLoading(false); }
    );
    return () => { unsubRef.current?.(); };
  }, [nodeId]);

  // Auto-scroll to bottom when new comment arrives
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [comments]);

  // ── Post comment ──────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!text.trim() || !uid) return;
    setPosting(true);
    setPostError('');
    try {
      await postComment(nodeId, text.trim(), {
        uid,
        name:   userProfile?.name   ?? 'Unknown',
        avatar: userProfile?.avatar ?? '',
      });
      setText('');
      textareaRef.current?.focus();

      // Notify node assignees (one-shot getDoc, not a subscription)
      getDoc(doc(db, 'roadmapNodes', nodeId)).then((snap) => {
        if (!snap.exists()) return;
        const assignedTo = snap.data()?.assignedTo ?? [];
        if (assignedTo.length === 0) return;
        const commenterName = userProfile?.name ?? 'Someone';
        notifyUsers(
          assignedTo,
          uid,
          `New Comment on "${snap.data()?.title ?? 'Milestone'}"`,
          `${commenterName} posted a comment. Open the Roadmap to view it.`,
          ROADMAP_NOTIF_TYPES.COMMENT_POSTED
        ).catch((err) => console.warn('[CommentsTab] notify comment:', err));
      }).catch(() => {/* silent — notification is best-effort */});
    } catch (err) {
      setPostError(err?.message ?? 'Failed to post comment.');
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl+Enter or Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handlePost();
    }
  };

  // ── Delete comment ────────────────────────────────────────────────────────
  const handleDelete = async (comment) => {
    const canDelete = isAdmin || comment.authorUid === uid;
    if (!canDelete) return;
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteComment(nodeId, comment.id);
    } catch (err) {
      console.error('[CommentsTab] deleteComment:', err);
      alert(`Failed to delete: ${err.message}`);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-surfaceHover animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 bg-surfaceHover rounded animate-pulse" />
              <div className="h-10 bg-surfaceHover rounded-xl animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Comment feed ───────────────────────────────────────────────── */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-surfaceHover border border-border flex items-center justify-center">
              <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-text-secondary font-medium text-sm">No comments yet</p>
              <p className="text-text-muted text-xs mt-0.5">Be the first to comment on this milestone.</p>
            </div>
          </div>
        ) : (
          comments.map((comment) => {
            const isOwn    = comment.authorUid === uid;
            const canDelete = isAdmin || isOwn;
            const initial  = (comment.authorName?.charAt(0) ?? '?').toUpperCase();

            return (
              <div key={comment.id} className="group flex gap-2.5">
                {/* Avatar initial */}
                <div className={`
                  w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold
                  ${isOwn ? 'bg-orange text-white' : 'bg-surfaceHover text-text-secondary border border-border'}
                `}>
                  {initial}
                </div>

                {/* Comment body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-semibold text-text-primary">
                      {comment.authorName}
                      {isOwn && <span className="text-orange ml-1 text-[10px] font-normal">(you)</span>}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {timeFromNow(comment.createdAt)}
                    </span>
                  </div>
                  <div className={`
                    px-3 py-2 rounded-xl rounded-tl-sm text-sm text-text-primary leading-relaxed whitespace-pre-wrap
                    ${isOwn ? 'bg-orange-muted border border-orange/20' : 'bg-surfaceHover border border-border'}
                  `}>
                    {comment.text}
                  </div>
                </div>

                {/* Delete button — hover reveal for own/admin */}
                {canDelete && (
                  <button
                    onClick={() => handleDelete(comment)}
                    className="opacity-0 group-hover:opacity-100 self-start mt-1 btn-ghost p-1 rounded hover:text-red-400 transition-opacity flex-shrink-0"
                    title="Delete comment"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Compose box ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-border p-3 space-y-2">
        {postError && (
          <p className="text-red-400 text-xs px-1">{postError}</p>
        )}
        <div className="flex gap-2 items-end">
          {/* Own avatar */}
          <div className="w-7 h-7 rounded-full bg-orange text-white flex-shrink-0 flex items-center justify-center text-[11px] font-bold">
            {(userProfile?.name?.charAt(0) ?? '?').toUpperCase()}
          </div>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setPostError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="Write a comment… (Ctrl+Enter to send)"
              rows={2}
              className="input-field resize-none text-sm w-full pr-10"
              disabled={posting}
            />
          </div>

          <button
            onClick={handlePost}
            disabled={posting || !text.trim()}
            className="btn-primary h-9 px-3 flex-shrink-0 disabled:opacity-50"
            title="Send comment (Ctrl+Enter)"
          >
            {posting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-text-muted pl-9">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}
