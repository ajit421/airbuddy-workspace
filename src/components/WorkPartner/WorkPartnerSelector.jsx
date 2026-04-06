/**
 * WorkPartnerSelector.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   GitHub-style autocomplete popover for picking a team member to add as a
 *   Work Partner. Rendered as an absolute-positioned dropdown inside a
 *   `relative` parent container — NOT a full-screen modal.
 *
 * PROPS:
 *   currentPartners  {Array}    — current workPartners array from the task
 *   onSelect         {Function} — (user: { uid, name, avatar, role, customRole }) => void
 *   onClose          {Function} — () => void
 *   currentUserUid   {String}   — exclude the acting user from the list
 *
 * RULES:
 *   - Never imports from 'firebase/firestore' directly.
 *   - Uses allUsers from useTasks() for the candidate list.
 *   - Closes on outside click via mousedown listener.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react';
import { useTasks } from '../../context/TaskContext';
import RoleBadge from '../shared/RoleBadge';

// ─── Avatar helper ────────────────────────────────────────────────────────────

function SelectorAvatar({ name, avatar }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
      />
    );
  }
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange to-orange/60 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
      {initial}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkPartnerSelector({ currentPartners, onSelect, onClose, currentUserUid }) {
  const { allUsers } = useTasks();
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);

  // ── Build the set of already-excluded UIDs ────────────────────────────────
  const excludedUids = new Set([
    currentUserUid,
    ...(currentPartners || []).map((p) => p.uid),
  ]);

  // ── Filter the users map into a sorted, searchable array ─────────────────
  const candidates = Object.values(allUsers)
    .filter((u) => {
      // Must have a UID
      if (!u.uid) return false;
      // Exclude current user and already-added partners
      if (excludedUids.has(u.uid)) return false;
      // Search filter — name or email, case-insensitive
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          (u.name  || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  // ── Also close on Escape ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute z-50 top-full mt-2 left-0 w-80 bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 animate-fade-in overflow-hidden"
    >
      {/* ── Search input ─────────────────────────────────────────────────── */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team members..."
          className="input-field rounded-none border-0 border-b border-border pl-10 pr-4 py-3 text-sm w-full focus:ring-0"
        />
      </div>

      {/* ── User list ─────────────────────────────────────────────────────── */}
      <div className="max-h-[300px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div className="py-6 text-center text-text-muted text-sm">
            {search.trim() ? `No results for "${search}"` : 'No team members to add'}
          </div>
        ) : (
          candidates.map((user) => {
            const alreadyPartner = (currentPartners || []).some((p) => p.uid === user.uid);
            return (
              <button
                key={user.uid}
                type="button"
                disabled={alreadyPartner}
                onClick={() => {
                  if (!alreadyPartner) onSelect(user);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                  ${alreadyPartner
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:bg-surfaceHover'
                  }`}
              >
                {/* Avatar */}
                <SelectorAvatar name={user.name} avatar={user.avatar} />

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary font-medium truncate">{user.name || 'Unknown'}</p>
                  {user.email && (
                    <p className="text-xs text-text-muted truncate">{user.email}</p>
                  )}
                </div>

                {/* Right side: checkmark if already partner, otherwise role badge */}
                {alreadyPartner ? (
                  <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <RoleBadge role={user.role} customRole={user.customRole} size="xs" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
