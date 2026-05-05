/**
 * TeamMembers.jsx
 * Main Team Members page — rendered at the /team route.
 * Displays a searchable, filterable grid of ProfileCards.
 */

import { useState, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useTeamMembers } from '../../../hooks/useTeamMembers';
import { getUserAttendanceSummary } from '../../../services/teamMembersService';
import ProfileCard from './ProfileCard';
import EditProfileModal from './EditProfileModal';
import ViewProfileModal from './ViewProfileModal';

// ─── Loading skeleton card ────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="card animate-pulse h-72 rounded-2xl overflow-hidden">
      <div className="h-20 bg-surfaceHover rounded-t-2xl" />
      <div className="flex flex-col items-center px-4 -mt-8">
        <div className="w-16 h-16 rounded-full bg-border border-4 border-surface" />
        <div className="h-3 bg-border rounded w-3/4 mx-auto mt-4 mb-2" />
        <div className="h-2 bg-border rounded w-1/2 mx-auto" />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ query, filterRole }) {
  const hasFilters = query.trim() || filterRole !== 'all';
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 gap-3">
      <span className="text-5xl">👥</span>
      <h3 className="text-text-primary font-bold text-lg">No team members found</h3>
      <p className="text-text-muted text-sm text-center max-w-xs">
        {hasFilters
          ? 'Try adjusting your search or filter criteria.'
          : 'No profiles have been created yet.'}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TeamMembers() {
  const { user, isAdmin, effectiveUid } = useAuth();
  const { members, loading, error } = useTeamMembers();

  // ── Local UI state ──
  const [selectedUser,  setSelectedUser]  = useState(null);
  const [modalMode,     setModalMode]     = useState(null); // 'edit' | 'view' | null
  const [searchQuery,   setSearchQuery]   = useState('');
  const [filterRole,    setFilterRole]    = useState('all');

  // ── Lazy attendance cache per uid ──
  const [attendanceMap,     setAttendanceMap]     = useState({}); // { [uid]: summaryObj }
  const [attendanceLoading, setAttendanceLoading] = useState({}); // { [uid]: bool }

  // ── Attendance lazy loader ── (only fires once per uid per page session)
  const fetchAttendanceIfNeeded = useCallback(async (uid) => {
    if (attendanceMap[uid]) return; // already fetched

    setAttendanceLoading((prev) => ({ ...prev, [uid]: true }));
    try {
      const summary = await getUserAttendanceSummary(uid);
      setAttendanceMap((prev) => ({ ...prev, [uid]: summary }));
    } catch (err) {
      console.error('[TeamMembers] fetchAttendanceIfNeeded failed for uid:', uid, err);
    } finally {
      setAttendanceLoading((prev) => ({ ...prev, [uid]: false }));
    }
  }, [attendanceMap]);

  // ── Modal openers ──
  const openEditModal = useCallback((member) => {
    setSelectedUser(member);
    setModalMode('edit');
  }, []);

  const openViewModal = useCallback((member) => {
    setSelectedUser(member);
    setModalMode('view');
  }, []);

  const closeModal = useCallback(() => {
    setSelectedUser(null);
    setModalMode(null);
  }, []);

  // ── Filter logic ──
  const filteredMembers = members.filter((m) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (m.department || '').toLowerCase().includes(q);

    const matchesRole = filterRole === 'all' || m.role === filterRole;

    return matchesSearch && matchesRole;
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">

      {/* ── Page header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text-primary">Team Members</h1>
        <p className="text-sm text-text-secondary mt-1">
          {loading ? 'Loading profiles…' : `${members.length} aerospace professional${members.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="card p-4 mb-6 border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ── Search & Filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search by name, email, or department..."
          className="input-field flex-1 min-w-[200px]"
        />

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="select-field w-36"
        >
          <option value="all">All Roles</option>
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>

        {!loading && (
          <span className="badge-orange text-xs flex-shrink-0">
            {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Members grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {loading ? (
          Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} />)
        ) : filteredMembers.length === 0 ? (
          <EmptyState query={searchQuery} filterRole={filterRole} />
        ) : (
          filteredMembers.map((member) => {
            const canEdit = isAdmin || member.uid === effectiveUid;
            return (
              <ProfileCard
                key={member.uid}
                user={member}
                attendanceData={attendanceMap[member.uid] || null}
                attendanceLoading={attendanceLoading[member.uid] === true}
                currentUserUid={effectiveUid}
                isAdmin={isAdmin}
                onEdit={(u) => {
                  openEditModal(u);
                  fetchAttendanceIfNeeded(u.uid);
                }}
                onView={(u) => {
                  openViewModal(u);
                  fetchAttendanceIfNeeded(u.uid);
                }}
              />
            );
          })
        )}
      </div>

      {/* ── Modals ── */}
      {modalMode === 'edit' && selectedUser && (
        <EditProfileModal
          isOpen
          onClose={closeModal}
          user={selectedUser}
          currentUserUid={effectiveUid}
          isAdmin={isAdmin}
        />
      )}

      {modalMode === 'view' && selectedUser && (
        <ViewProfileModal
          isOpen
          onClose={closeModal}
          user={{
            ...selectedUser,
            attendanceData: attendanceMap[selectedUser.uid] || null,
          }}
          attendanceLoading={attendanceLoading[selectedUser.uid] === true}
        />
      )}
    </div>
  );
}
