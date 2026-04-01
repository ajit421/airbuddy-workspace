/**
 * RecruitmentBoard.jsx
 * HRMS — Kanban Recruitment Board
 *
 * Features:
 *  - 4 columns: Applied → Interviewing → Hired → Rejected
 *  - Native HTML5 Drag & Drop (no external library)
 *  - Optimistic UI: card moves instantly; snapshot-based rollback on Firestore error
 *  - Admin-only: Add Candidate modal + drag-and-drop
 *  - Employee view: read-only pipeline overview
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  getCandidates,
  addCandidate,
  updateCandidateStatus,
} from '../../../services/hrmsService';

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = ['Applied', 'Interviewing', 'Hired', 'Rejected'];

const COL = {
  Applied:      { borderL: 'border-l-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500',   icon: '📥' },
  Interviewing: { borderL: 'border-l-orange-400',  bg: 'bg-orange/10',     text: 'text-orange',      border: 'border-orange',      icon: '🎤' },
  Hired:        { borderL: 'border-l-green-500',   bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500',  icon: '✅' },
  Rejected:     { borderL: 'border-l-red-500',     bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500',    icon: '❌' },
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const initials = (name = '') =>
  name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

function fmtDate(ts) {
  if (!ts) return '';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Add Candidate Modal ──────────────────────────────────────────────────────
function AddCandidateModal({ onClose, onAdded }) {
  const [form, setForm]   = useState({ name: '', email: '', role: '', experience: '', resumeUrl: '', notes: '' });
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return setError('Full name is required.');
    if (!form.role.trim())  return setError('Role / position is required.');
    setError('');
    setBusy(true);
    try {
      const id = await addCandidate(form);
      onAdded({ id, ...form, status: 'Applied', createdAt: null });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add candidate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text-primary">Add Candidate</h2>
            <p className="text-xs text-text-muted mt-0.5">Starts in the Applied column</p>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg
                             bg-surfaceHover text-text-muted hover:text-text-primary transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="p-6 space-y-4">
          {[
            { k: 'name',       label: 'Full Name *',     ph: 'Priya Sharma'     },
            { k: 'email',      label: 'Email',            ph: 'priya@example.com'},
            { k: 'role',       label: 'Applying For *',  ph: 'Senior Engineer'  },
            { k: 'experience', label: 'Experience',       ph: '3 years'          },
            { k: 'resumeUrl',  label: 'Resume Link',      ph: 'https://drive.google.com/...' },
          ].map(({ k, label, ph }) => (
            <div key={k}>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">{label}</label>
              <input type="text" value={form[k]} placeholder={ph}
                     onChange={(e) => set(k, e.target.value)}
                     className="w-full bg-background border border-border rounded-lg px-3 py-2
                                text-sm text-text-primary focus:outline-none focus:border-orange
                                transition-colors" />
            </div>
          ))}

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes} placeholder="Any initial observations…"
                      onChange={(e) => set('notes', e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2
                                 text-sm text-text-primary focus:outline-none focus:border-orange
                                 transition-colors resize-none" />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20
                          rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
                    className="px-4 py-2 rounded-lg border border-border text-text-secondary
                               text-sm hover:bg-surfaceHover transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={busy}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange text-white
                               text-sm font-bold hover:bg-orange-hover transition-colors
                               disabled:opacity-60 disabled:cursor-not-allowed">
              {busy && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white
                                        rounded-full animate-spin" />}
              {busy ? 'Adding…' : 'Add Candidate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────
/**
 * @param {{
 *   candidate: object,
 *   isDragging: boolean,
 *   isAdmin: boolean,
 *   onDragStart: (e: DragEvent) => void
 * }} props
 */
function CandidateCard({ candidate, isDragging, isAdmin, onDragStart }) {
  const col = COL[candidate.status] ?? COL.Applied;

  return (
    <div
      draggable={isAdmin}
      onDragStart={isAdmin ? onDragStart : undefined}
      className={[
        'bg-surface border border-border border-l-4',
        col.borderL,
        'rounded-xl p-4 shadow-sm select-none transition-all duration-150',
        isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        isDragging
          ? 'opacity-40 scale-95 rotate-1 shadow-xl'
          : 'hover:shadow-md hover:-translate-y-0.5',
      ].join(' ')}
    >
      {/* Avatar + identity */}
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${col.bg} ${col.text}
                         flex items-center justify-center text-sm font-black flex-shrink-0`}>
          {initials(candidate.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text-primary text-sm truncate">{candidate.name}</p>
          <p className="text-[11px] text-text-muted truncate">{candidate.email || '—'}</p>
        </div>
      </div>

      {/* Role / experience */}
      <div className="mt-3 space-y-1">
        {candidate.role && (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none"
                 stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2
                   0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2
                   2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="truncate">{candidate.role}</span>
          </div>
        )}
        {candidate.experience && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {candidate.experience}
          </div>
        )}
        {candidate.resumeUrl && (
          <div className="flex items-center gap-1.5 text-xs">
            <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer"
               className="text-blue-400 hover:text-blue-300 hover:underline truncate"
               // Prevent drag event from firing when clicking the link
               onClick={(e) => e.stopPropagation()}
               onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              View Resume
            </a>
          </div>
        )}
      </div>

      {/* Notes */}
      {candidate.notes && (
        <p className="mt-2.5 text-[11px] text-text-muted bg-background rounded-lg px-2.5
                      py-1.5 line-clamp-2 leading-relaxed">
          {candidate.notes}
        </p>
      )}

      {/* Added date */}
      {candidate.createdAt && (
        <p className="mt-2 text-[10px] text-text-muted text-right opacity-60">
          Added {fmtDate(candidate.createdAt)}
        </p>
      )}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────
function KanbanColumn({ name, candidates, draggingId, isAdmin, onDrop, onCardDragStart }) {
  const [dragOver, setDragOver] = useState(false);
  const col = COL[name];

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        // Only clear if leaving the column itself, not a child card
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
      }}
      onDrop={(e) => { setDragOver(false); onDrop(e, name); }}
      className={[
        'flex flex-col gap-3 rounded-xl border p-4 min-h-[600px] transition-all duration-150',
        dragOver && isAdmin
          ? `${col.bg} border-dashed border-2 ${col.border}`
          : 'bg-surfaceHover border-border',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span>{col.icon}</span>
          <h3 className={`font-bold text-sm ${col.text}`}>{name}</h3>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${col.bg} ${col.text}`}>
          {candidates.length}
        </span>
      </div>

      {/* Drop-zone indicator */}
      {dragOver && isAdmin && (
        <div className={`border-2 border-dashed ${col.border} rounded-xl h-16 flex items-center
                         justify-center text-xs ${col.text} font-semibold opacity-70 animate-pulse`}>
          Drop here
        </div>
      )}

      {/* Cards */}
      {candidates.map((c) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          isDragging={draggingId === c.id}
          isAdmin={isAdmin}
          onDragStart={(e) => onCardDragStart(e, c.id)}
        />
      ))}

      {/* Empty state */}
      {candidates.length === 0 && !dragOver && (
        <div className="flex-1 flex items-center justify-center opacity-40">
          <p className="text-xs text-text-muted text-center">
            {isAdmin ? 'Drag a card here' : 'No candidates yet'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RecruitmentBoard() {
  const { isAdmin } = useAuth();

  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [draggingId, setDraggingId] = useState(null);
  const [showModal, setShowModal]   = useState(false);

  // Pre-drag snapshot for rollback
  const snapshot = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCandidates(await getCandidates());
    } catch (err) {
      setError(err.message || 'Failed to load candidates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  /** Called with the native DragEvent and the candidate id */
  const handleCardDragStart = (e, id) => {
    // Store the candidate id in the drag payload (needed for cross-window safety)
    e.dataTransfer.setData('candidateId', id);
    e.dataTransfer.effectAllowed = 'move';
    snapshot.current = candidates;   // save for rollback
    setDraggingId(id);
  };

  /** Called when a card is dropped on a column */
  const handleDrop = async (e, targetCol) => {
    e.preventDefault();

    const id = e.dataTransfer.getData('candidateId');
    if (!id) return;

    const candidate = (snapshot.current ?? candidates).find((c) => c.id === id);
    if (!candidate || candidate.status === targetCol) {
      setDraggingId(null);
      return;
    }

    // Optimistic update
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: targetCol } : c))
    );
    setDraggingId(null);

    try {
      await updateCandidateStatus(id, targetCol);
    } catch (err) {
      console.error('[RecruitmentBoard] updateCandidateStatus failed:', err);
      // Rollback
      if (snapshot.current) setCandidates(snapshot.current);
      setError('Could not update candidate status. Your change has been reverted.');
    } finally {
      snapshot.current = null;
    }
  };

  // ── Group candidates by column ─────────────────────────────────────────────
  const colMap = Object.fromEntries(COLUMNS.map((c) => [c, []]));
  candidates.forEach((c) => {
    const col = COLUMNS.includes(c.status) ? c.status : 'Applied';
    colMap[col].push(c);
  });

  const total = candidates.length;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-background min-h-screen text-text-primary">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gradient">Recruitment Board</h1>
          <p className="text-text-muted text-sm mt-1">
            {total} candidate{total !== 1 ? 's' : ''} in the pipeline
            {isAdmin && ' · Drag cards between columns to update stage'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh */}
          <button onClick={load} disabled={loading}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border
                             text-text-secondary text-sm hover:bg-surface transition-colors
                             disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0
                   0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          {/* Add Candidate — admin only */}
          {isAdmin && (
            <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange text-white
                               text-sm font-bold hover:bg-orange-hover transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Candidate
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {COLUMNS.map((col) => (
          <div key={col}
               className={`${COL[col].bg} border border-border rounded-lg px-3 py-1.5
                           flex items-center gap-2`}>
            <span className="text-sm">{COL[col].icon}</span>
            <span className={`text-sm font-bold ${COL[col].text}`}>{colMap[col].length}</span>
            <span className="text-xs text-text-muted">{col}</span>
          </div>
        ))}
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 flex items-center gap-3 text-red-400 text-sm bg-red-500/10
                        border border-red-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2
              0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-300 hover:text-red-100">
            ✕
          </button>
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-2 border-orange border-t-transparent
                          rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Loading recruitment pipeline…</p>
        </div>
      )}

      {/* ── Kanban Board Grid ─────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col}
              name={col}
              candidates={colMap[col]}
              draggingId={draggingId}
              isAdmin={isAdmin}
              onCardDragStart={handleCardDragStart}
              onDrop={handleDrop}
            />
          ))}
        </div>
      )}

      {/* ── Add Candidate Modal ───────────────────────────────────────────── */}
      {showModal && (
        <AddCandidateModal
          onClose={() => setShowModal(false)}
          onAdded={(candidate) =>
            setCandidates((prev) => [candidate, ...prev])
          }
        />
      )}
    </div>
  );
}
