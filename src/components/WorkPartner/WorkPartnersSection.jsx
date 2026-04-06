/**
 * WorkPartnersSection.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Displays the current work partners for a task with chip-style cards,
 *   and surfaces the WorkPartnerSelector popover when adding a new partner.
 *   Lives inside TaskDetailModal between the progress section and the timeline.
 *
 * PROPS:
 *   task           {Object}    — full task document including workPartners array
 *   onPartnerAdded {Function?} — optional callback after a partner is added
 *
 * RULES:
 *   - Never imports from 'firebase/firestore'.
 *   - All writes go through addWorkPartner / removeWorkPartner from collaborationService.
 *   - Role display always uses <RoleBadge />.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';
import { addWorkPartner, removeWorkPartner, checkCanAddPartner } from '../../services/collaborationService';
import RoleBadge from '../shared/RoleBadge';
import WorkPartnerSelector from './WorkPartnerSelector';

// ─── Partner avatar helper ────────────────────────────────────────────────────

function PartnerAvatar({ name, avatar }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange/70 to-orange/40 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
      {initial}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkPartnersSection({ task, onPartnerAdded }) {
  const { userProfile, isAdmin } = useAuth();
  const { allUsers } = useTasks();

  const [showSelector, setShowSelector] = useState(false);
  const [adding, setAdding]             = useState(false);
  const [addError, setAddError]         = useState(null);
  const [removingUid, setRemovingUid]   = useState(null); // uid currently being removed

  if (!task) return null;

  const partners       = Array.isArray(task.workPartners) ? task.workPartners : [];
  const canAddPartner  = isAdmin || checkCanAddPartner(task, userProfile?.uid);
  // Only the task creator or an admin can remove partners
  const canRemoveAny   = isAdmin || task.createdBy === userProfile?.uid;

  // ── Select a partner from the popover ────────────────────────────────────
  const handleSelectPartner = async (selectedUser) => {
    setShowSelector(false);
    setAdding(true);
    setAddError(null);
    try {
      await addWorkPartner(
        task.id,
        { uid: selectedUser.uid, name: selectedUser.name, avatar: selectedUser.avatar || '' },
        { uid: userProfile.uid, name: userProfile.name, avatar: userProfile.avatar || '' }
      );
      onPartnerAdded?.();
    } catch (err) {
      console.error('[WorkPartnersSection] addWorkPartner failed:', err);
      setAddError('Could not add partner. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  // ── Remove a partner ──────────────────────────────────────────────────────
  const handleRemovePartner = async (partnerUid) => {
    setRemovingUid(partnerUid);
    setAddError(null);
    try {
      await removeWorkPartner(task.id, partnerUid, task.workPartners);
      onPartnerAdded?.();
    } catch (err) {
      console.error('[WorkPartnersSection] removeWorkPartner failed:', err);
      setAddError('Could not remove partner. Please try again.');
    } finally {
      setRemovingUid(null);
    }
  };

  return (
    <div>
      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide flex items-center gap-2">
          Work Partners
          {partners.length > 0 && (
            <span className="badge-orange text-[10px] px-1.5 py-0.5 rounded-full">
              {partners.length}
            </span>
          )}
        </h4>

        {/* Add Partner button + popover wrapper */}
        {canAddPartner && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSelector((prev) => !prev)}
              disabled={adding}
              className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Adding...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Partner
                </>
              )}
            </button>

            {/* Selector popover */}
            {showSelector && (
              <WorkPartnerSelector
                currentPartners={partners}
                currentUserUid={userProfile?.uid}
                onSelect={handleSelectPartner}
                onClose={() => setShowSelector(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Partner chips ───────────────────────────────────────────────── */}
      {partners.length === 0 ? (
        <p className="text-sm text-text-muted italic py-2">
          No work partners yet. Add team members to collaborate.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {partners.map((partner) => {
            // Look up the full user object to get customRole
            const fullUser = allUsers[partner.uid] || {};
            const isRemoving = removingUid === partner.uid;

            return (
              <div
                key={partner.uid}
                className={`flex items-center gap-2 bg-surfaceHover border border-border rounded-xl px-3 py-1.5 transition-opacity ${isRemoving ? 'opacity-50' : ''}`}
              >
                <PartnerAvatar name={partner.name} avatar={partner.avatar} />

                <span className="text-xs text-text-primary font-medium">
                  {partner.name || 'Unknown'}
                </span>

                <RoleBadge
                  role={fullUser.role || 'employee'}
                  customRole={fullUser.customRole || ''}
                  size="xs"
                />

                {/* Remove button — creator or admin only */}
                {canRemoveAny && (
                  <button
                    type="button"
                    onClick={() => handleRemovePartner(partner.uid)}
                    disabled={isRemoving}
                    title={`Remove ${partner.name}`}
                    className="ml-1 w-4 h-4 flex items-center justify-center text-text-muted hover:text-red-400 transition-colors disabled:cursor-not-allowed"
                  >
                    {isRemoving ? (
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error message ───────────────────────────────────────────────── */}
      {addError && (
        <p className="text-xs text-red-400 mt-2">{addError}</p>
      )}
    </div>
  );
}
