/**
 * WorkPartnerSelector.jsx  — v2 (Portal-based, smart-positioned)
 * ─────────────────────────────────────────────────────────────────────────────
 * Uses ReactDOM.createPortal to render at document.body level, so it can
 * NEVER be clipped by overflow:hidden on a parent (modal, card, etc.).
 *
 * Smart positioning: measures the trigger button's getBoundingClientRect()
 * and automatically places the panel left, right, above, or below — whichever
 * fits the viewport best.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTasks } from '../../context/TaskContext';
import RoleBadge from '../shared/RoleBadge';

// ─── Avatar ───────────────────────────────────────────────────────────────────
function SelectorAvatar({ name, avatar, size = 9 }) {
  const sz = `w-${size} h-${size}`;
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${sz} rounded-full object-cover flex-shrink-0 ring-2 ring-border`}
        onError={(e) => { e.currentTarget.src = ''; }}
      />
    );
  }
  const colors = [
    'from-orange to-amber-500',
    'from-blue-500 to-cyan-400',
    'from-purple-500 to-pink-400',
    'from-green-500 to-teal-400',
    'from-rose-500 to-red-400',
  ];
  const colorIdx = initial.charCodeAt(0) % colors.length;
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br ${colors[colorIdx]} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ring-2 ring-border`}>
      {initial}
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({ user, onSelect, isAlready }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      disabled={isAlready}
      onClick={() => !isAlready && onSelect(user)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150 group
        ${isAlready
          ? 'opacity-40 cursor-not-allowed'
          : hovered
            ? 'bg-orange/8 cursor-pointer'
            : 'cursor-pointer hover:bg-surfaceHover'
        }`}
    >
      <div className="relative flex-shrink-0">
        <SelectorAvatar name={user.name} avatar={user.avatar} />
        {/* Online dot (decorative) */}
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface bg-green-400" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate transition-colors duration-150
          ${hovered && !isAlready ? 'text-orange' : 'text-text-primary'}`}>
          {user.name || 'Unknown'}
        </p>
        {user.email && (
          <p className="text-[11px] text-text-muted truncate">{user.email}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex-shrink-0 flex items-center gap-2">
        {isAlready ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Added
          </span>
        ) : (
          <>
            <RoleBadge role={user.role} customRole={user.customRole} size="xs" />
            <div className={`transition-all duration-150 ${hovered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1'}`}>
              <svg className="w-4 h-4 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

// ─── Main Selector (Portal) ───────────────────────────────────────────────────
export default function WorkPartnerSelector({
  currentPartners,
  onSelect,
  onClose,
  currentUserUid,
  triggerRef, // ref to the trigger button (for positioning)
}) {
  const { allUsers } = useTasks();
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 320 });
  const [visible, setVisible] = useState(false); // for enter animation
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  const PANEL_W = 340;
  const PANEL_H = 420; // approx max height

  // ── Smart positioning ─────────────────────────────────────────────────────
  const computePosition = useCallback(() => {
    if (!triggerRef?.current) return;
    const tr = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = tr.bottom + 8;
    let left = tr.right - PANEL_W; // prefer right-aligned with trigger

    // Flip above if not enough space below
    if (top + PANEL_H > vh - 12) {
      top = tr.top - PANEL_H - 8;
    }
    // Clamp left so panel never goes off-screen
    if (left < 8) left = 8;
    if (left + PANEL_W > vw - 8) left = vw - PANEL_W - 8;

    setPos({ top, left, width: PANEL_W });
  }, [triggerRef]);

  useEffect(() => {
    computePosition();
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [computePosition]);

  // Trigger enter animation after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    inputRef.current?.focus();
    return () => clearTimeout(t);
  }, []);

  // ── Outside click → close ─────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e) => {
      const clickedTrigger = triggerRef?.current?.contains(e.target);
      const clickedPanel = panelRef.current?.contains(e.target);
      if (!clickedPanel && !clickedTrigger) onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose, triggerRef]);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Build candidate list ──────────────────────────────────────────────────
  const excludedUids = new Set([
    currentUserUid,
    ...(currentPartners || []).map((p) => p.uid),
  ]);

  const candidates = Object.values(allUsers)
    .filter((u) => {
      if (!u.uid) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const aEx = excludedUids.has(a.uid);
      const bEx = excludedUids.has(b.uid);
      if (aEx !== bEx) return aEx ? 1 : -1; // already-added go to bottom
      return (a.name || '').localeCompare(b.name || '');
    });

  const availableCount = candidates.filter(u => !excludedUids.has(u.uid)).length;

  // ── Portal content  ───────────────────────────────────────────────────────
  const panel = (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
        transformOrigin: 'top right',
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(-8px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.18s cubic-bezier(.34,1.4,.64,1), opacity 0.15s ease',
      }}
    >
      {/* Glass-dark card */}
      <div style={{
        background: 'linear-gradient(135deg, #1c2128 0%, #161b22 100%)',
        border: '1px solid rgba(48,54,61,0.8)',
        borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        overflow: 'hidden',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(48,54,61,0.6)',
          background: 'linear-gradient(180deg, rgba(249,115,22,0.06) 0%, transparent 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* People icon */}
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(249,115,22,0.12)',
                border: '1px solid rgba(249,115,22,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" fill="none" stroke="#f97316" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3', margin: 0 }}>Add Work Partner</p>
                <p style={{ fontSize: 10, color: '#7d8590', margin: 0 }}>
                  {availableCount} member{availableCount !== 1 ? 's' : ''} available
                </p>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                width: 26, height: 26, borderRadius: 6,
                background: 'transparent', border: 'none',
                color: '#7d8590', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,81,73,0.1)'; e.currentTarget.style.color = '#f85149'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#7d8590'; }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#7d8590', pointerEvents: 'none' }}
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px 8px 32px',
                background: 'rgba(13,17,23,0.6)',
                border: '1px solid rgba(48,54,61,0.8)',
                borderRadius: 8,
                color: '#e6edf3',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'rgba(249,115,22,0.5)';
                e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.08)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'rgba(48,54,61,0.8)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#7d8590', cursor: 'pointer', padding: 2,
                }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── User list ────────────────────────────────────────────────────── */}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}
          className="custom-scrollbar"
        >
          {candidates.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
              <p style={{ fontSize: 13, color: '#7d8590', margin: 0 }}>
                {search.trim() ? `No results for "${search}"` : 'No team members available'}
              </p>
            </div>
          ) : (
            candidates.map((user) => {
              const isAlready = excludedUids.has(user.uid);
              return (
                <UserRow
                  key={user.uid}
                  user={user}
                  isAlready={isAlready}
                  onSelect={onSelect}
                />
              );
            })
          )}
        </div>

        {/* ── Footer hint ──────────────────────────────────────────────────── */}
        <div style={{
          padding: '8px 14px',
          borderTop: '1px solid rgba(48,54,61,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(13,17,23,0.3)',
        }}>
          <span style={{ fontSize: 10, color: '#484f58' }}>
            Press <kbd style={{ padding: '1px 5px', background: 'rgba(48,54,61,0.8)', borderRadius: 4, fontSize: 10, color: '#7d8590', border: '1px solid rgba(99,110,123,0.3)' }}>Esc</kbd> to close
          </span>
          <span style={{ fontSize: 10, color: '#484f58' }}>
            {availableCount} available · {(currentPartners || []).length} added
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
