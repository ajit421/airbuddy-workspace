/**
 * ViewProfileModal.jsx
 * Read-only profile modal for non-owners / non-admins viewing another member's profile.
 */

import { useState } from 'react';
import Modal from '../../shared/Modal';
import { formatDate } from '../../../utils/dateHelpers';
import RoleBadge from '../../shared/RoleBadge';

// ─── Shared icon components ──────────────────────────────────────────────────
function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0-2.209-1.791-4 4-4z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
function Avatar({ avatar, name }) {
  const [imgError, setImgError] = useState(false);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={name}
        onError={() => setImgError(true)}
        className="w-16 h-16 rounded-2xl object-cover border-2 border-border flex-shrink-0"
      />
    );
  }

  return (
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange to-orange/60 flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
      {initial}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ value, label, loading }) {
  return (
    <div className="card p-3 text-center">
      {loading ? (
        <div className="h-8 w-12 animate-pulse bg-border rounded mx-auto mb-1" />
      ) : (
        <p className="text-2xl font-black text-text-primary">{value ?? '—'}</p>
      )}
      <p className="text-xs text-text-muted uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ViewProfileModal({ isOpen, onClose, user, attendanceLoading }) {
  if (!user) return null;

  const socialLinks = user.socialLinks || {};
  const presentSocialLinks = [
    socialLinks.github && { href: socialLinks.github, icon: <GitHubIcon />, label: 'GitHub' },
    socialLinks.linkedin && { href: socialLinks.linkedin, icon: <LinkedInIcon />, label: 'LinkedIn' },
    socialLinks.instagram && { href: socialLinks.instagram, icon: <InstagramIcon />, label: 'Instagram' },
    socialLinks.portfolio && { href: socialLinks.portfolio, icon: <GlobeIcon />, label: 'Portfolio' },
  ].filter(Boolean);

  const taskStats = user.taskStats || { totalTasks: 0, completedTasks: 0 };
  const attendanceData = user.attendanceData || null;
  const skills = Array.isArray(user.skills) ? user.skills : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Member Profile" size="md">
      <div className="space-y-6">

        {/* ── 1. Top section ── */}
        <div className="flex items-center gap-4">
          <Avatar avatar={user.avatar} name={user.name} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-text-primary truncate">
                {user.name || 'Unknown'}
              </h2>
              <RoleBadge role={user.role} customRole={user.customRole} />
            </div>
            <p className="text-text-muted text-sm mt-0.5 truncate">
              {user.designation || '—'}
            </p>
            <p className="text-orange text-sm font-medium mt-0.5 truncate">
              {user.email}
            </p>
            {user.department && (
              <p className="text-text-secondary text-xs mt-1">
                📍 {user.department}
              </p>
            )}
          </div>
        </div>

        {/* ── 2. Stats strip ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={taskStats.totalTasks} label="Total Tasks" />
          <StatCard value={taskStats.completedTasks} label="Completed" />
          <StatCard
            value={attendanceData ? attendanceData.attendanceRate : '—'}
            label="Attendance"
            loading={attendanceLoading}
          />
        </div>

        {/* ── 3. Social Links ── */}
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Connect
          </p>
          {presentSocialLinks.length > 0 ? (
            <div className="flex gap-3 flex-wrap">
              {presentSocialLinks.map(({ href, icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surfaceHover hover:bg-orange-muted hover:text-orange text-text-muted text-xs transition-colors"
                >
                  {icon}
                  <span>{label}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-xs italic">No social links added</p>
          )}
        </div>

        {/* ── 4. Skills ── */}
        <div>
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Skills
          </p>
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span key={skill} className="badge-orange text-xs">
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-xs italic">No skills listed</p>
          )}
        </div>

        {/* ── 5. Bio ── */}
        {user.bio && (
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
              About
            </p>
            <div className="card p-4">
              <p className="text-sm text-text-secondary leading-relaxed">
                {user.bio}
              </p>
            </div>
          </div>
        )}

        {/* ── 6. Member Since ── */}
        {user.createdAt && (
          <p className="text-xs text-text-muted text-center pt-2 border-t border-border">
            🚀 Member since {formatDate(user.createdAt)}
          </p>
        )}

      </div>
    </Modal>
  );
}
