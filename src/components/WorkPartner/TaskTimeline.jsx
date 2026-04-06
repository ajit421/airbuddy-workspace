/**
 * TaskTimeline.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   GitHub-style collaboration feed for a task.
 *   - Shows the GitBranchGraph network visualization at the top
 *   - Activity feed (vertical commit list) below
 *   - Commit form for posting updates
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTaskTimeline } from '../../hooks/useTaskTimeline';
import { postCommit, checkCanAddPartner } from '../../services/collaborationService';
import { StatusBadge } from '../shared/TaskCard';
import { timeFromNow } from '../../utils/dateHelpers';
import GitBranchGraph from './GitBranchGraph';

// ─── Event node config ─────────────────────────────────────────────────────────
const NODE_CONFIG = {
  commit:           { border: 'border-orange',       iconColor: 'text-orange',       icon: '●' },
  partner_added:    { border: 'border-green-500',    iconColor: 'text-green-400',    icon: '👤' },
  status_changed:   { border: 'border-blue-500',     iconColor: 'text-blue-400',     icon: '⚡' },
  progress_updated: { border: 'border-purple-500',   iconColor: 'text-purple-400',   icon: '📊' },
};

// ─── Avatar helper ─────────────────────────────────────────────────────────────
function EventAvatar({ name, avatar, size = 'sm' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${dim} rounded-full object-cover flex-shrink-0`}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className={`${dim} rounded-full bg-gradient-to-br from-orange/70 to-orange/40 text-white font-bold flex items-center justify-center flex-shrink-0`}>
      {initial}
    </div>
  );
}

// ─── EventBody (type-specific content) ───────────────────────────────────────
function EventBody({ event }) {
  switch (event.type) {
    case 'commit':
      return (
        <div>
          <p className="text-sm text-text-secondary leading-relaxed">{event.message}</p>
          {event.metadata?.driveLink && (
            <a
              href={event.metadata.driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
            >
              📎 {event.metadata.driveLinkLabel || 'View Document'}
            </a>
          )}
        </div>
      );

    case 'partner_added':
      return (
        <p className="text-sm text-text-secondary">
          <span className="text-text-primary font-medium">{event.authorName}</span>
          {' added '}
          <span className="text-text-primary font-medium">{event.metadata?.targetName || 'a team member'}</span>
          {' as a work partner'}
        </p>
      );

    case 'status_changed':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={event.metadata?.fromStatus} />
            <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <StatusBadge status={event.metadata?.toStatus} />
          </div>
          <p className="text-xs text-text-muted">{event.message}</p>
        </div>
      );

    case 'progress_updated':
      return (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">{event.message}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-text-muted">{event.metadata?.fromProgress ?? 0}%</span>
            <span className="text-orange">→</span>
            <span className="text-green-400 font-bold">{event.metadata?.toProgress ?? 0}%</span>
          </div>
        </div>
      );

    default:
      return <p className="text-sm text-text-secondary">{event.message}</p>;
  }
}

// ─── Single timeline event row ─────────────────────────────────────────────────
function TimelineEvent({ event }) {
  const config = NODE_CONFIG[event.type] || NODE_CONFIG.commit;
  return (
    <div className="relative flex items-start gap-4 pb-6 pl-12 animate-fade-in">
      <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border-2 bg-[#0d1117] ${config.border} flex items-center justify-center z-10 flex-shrink-0`}>
        <span className={`${config.iconColor} text-xs leading-none`}>{config.icon}</span>
      </div>
      <div className="card p-3 flex-1 min-w-0 border border-[#21262d] bg-[#0d1117]">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <EventAvatar name={event.authorName} avatar={event.authorAvatar} />
          <span className="text-xs font-semibold text-text-primary">{event.authorName || 'System'}</span>
          <span className="text-text-muted text-xs">·</span>
          <span className="text-xs text-[#7d8590]">
            {event.createdAt ? timeFromNow(event.createdAt) : 'just now'}
          </span>
        </div>
        <EventBody event={event} />
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function TimelineSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="relative flex gap-4 pl-12 pb-6">
          <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-border animate-pulse" />
          <div className="card flex-1 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-border animate-pulse" />
              <div className="h-2.5 bg-border rounded animate-pulse w-1/3" />
            </div>
            <div className="h-2 bg-border rounded animate-pulse w-3/4" />
            <div className="h-2 bg-border rounded animate-pulse w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────
export default function TaskTimeline({ taskId, task, compact = false }) {
  const { userProfile, isAdmin } = useAuth();
  const { events, loading, error } = useTaskTimeline(taskId);

  const [showCommitForm, setShowCommitForm] = useState(false);
  const [commitMessage, setCommitMessage]   = useState('');
  const [driveLink, setDriveLink]           = useState('');
  const [driveLinkLabel, setDriveLinkLabel] = useState('');
  const [posting, setPosting]               = useState(false);
  const [postError, setPostError]           = useState(null);

  const canPostCommit = isAdmin || checkCanAddPartner(task, userProfile?.uid);
  const displayEvents = compact ? events.slice(0, 5) : events;

  const handlePostCommit = async () => {
    if (!commitMessage.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      await postCommit(
        taskId,
        { uid: userProfile.uid, name: userProfile.name, avatar: userProfile.avatar || '' },
        commitMessage,
        driveLink || null,
        driveLinkLabel || null
      );
      setCommitMessage('');
      setDriveLink('');
      setDriveLinkLabel('');
      setShowCommitForm(false);
    } catch (err) {
      console.error('[TaskTimeline] postCommit failed:', err);
      setPostError('Could not post commit. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleCancelCommit = () => {
    setShowCommitForm(false);
    setCommitMessage('');
    setDriveLink('');
    setDriveLinkLabel('');
    setPostError(null);
  };

  return (
    <div className="space-y-5">

      {/* ── GitHub-style Branch Graph ────────────────────────────────────── */}
      <GitBranchGraph
        task={task}
        events={events}
        loading={loading}
        onAddPartner={() => {}}
      />

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Activity Feed ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-bold text-[#7d8590] uppercase tracking-widest flex items-center gap-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Activity Feed
          </h4>
          {canPostCommit && !showCommitForm && (
            <button
              type="button"
              onClick={() => setShowCommitForm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316] text-[11px] font-bold hover:bg-[#f97316]/20 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Post Commit
            </button>
          )}
        </div>

        {/* Commit form */}
        {showCommitForm && (
          <div className="mb-4 rounded-xl border border-[#f97316]/20 bg-[#0d1117] p-4 space-y-3 animate-fade-in">
            <textarea
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#7d8590] outline-none focus:border-[#f97316] resize-none transition-colors"
              rows={3}
              placeholder="Describe your work, findings, or update..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              maxLength={500}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#7d8590] outline-none focus:border-[#3b82f6] transition-colors"
                type="url"
                placeholder="Google Drive link (optional)"
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
              />
              <input
                className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e6edf3] placeholder-[#7d8590] outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-40"
                placeholder="Link label (e.g. 'Report v2')"
                value={driveLinkLabel}
                onChange={(e) => setDriveLinkLabel(e.target.value)}
                disabled={!driveLink}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#7d8590]">{commitMessage.length}/500</span>
              {postError && <span className="text-xs text-red-400">{postError}</span>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancelCommit}
                  className="px-3 py-1.5 rounded-md border border-[#30363d] text-[#7d8590] text-xs font-medium hover:text-[#e6edf3] hover:border-[#7d8590] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePostCommit}
                  disabled={posting || !commitMessage.trim()}
                  className="px-3 py-1.5 rounded-md bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {posting
                    ? <><svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Posting...</>
                    : <>↑ Commit</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Timeline events */}
        {loading ? (
          <TimelineSkeleton />
        ) : displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-[#21262d] bg-[#0d1117]/30">
            <div className="text-3xl mb-2">🚀</div>
            <p className="text-sm text-[#7d8590]">No commits yet. Post your first update!</p>
          </div>
        ) : (
          <div className="relative">
            {/* GitHub-green vertical line */}
            <div
              className="absolute left-4 top-0 bottom-0 w-0.5"
              style={{ background: 'linear-gradient(to bottom, #238636 0%, #1a7f3740 100%)' }}
            />
            <div className="space-y-0">
              {displayEvents.map((event) => (
                <TimelineEvent key={event.id} event={event} />
              ))}
            </div>

            {compact && events.length > 5 && (
              <p className="text-xs text-[#7d8590] text-center pt-2 pb-1">
                + {events.length - 5} more — open task for full history
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
