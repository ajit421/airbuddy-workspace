/**
 * ProfileCard.jsx
 * A single team member card displayed in the Team Members grid.
 * Shows avatar, name, role, task stats, attendance rate, social links, and an action button.
 */

import { useState } from 'react';
import RoleBadge from '../../shared/RoleBadge';

// ─── Social link icons (inline SVG to keep zero extra deps) ──────────────────
function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0-2.209-1.791-4 4-4z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function OnshapeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 3a7 7 0 110 14A7 7 0 0112 5zm0 2a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6A3 3 0 0112 9z" />
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.28 3h11.44l-2.927 5.07H3.353zm-.927 1.607L1.5 12.535h5.853L11.28 5.07zm9.504 7.928H3.353L6.28 21h11.44l-2.927-5.07 2.927-4.465zm-4.514 0l-2.927 5.07h5.854l-2.927-5.07zm2.927-7.928L20 12.535l-2.927 2.393-2.927-4.465z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  );
}

// function BehanceIcon() {
//   return (
//     <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
//       <path d="M6.938 4.503c.702 0 1.34.06 1.92.188.577.13 1.07.33 1.485.61.41.28.733.65.96 1.12.225.47.34 1.05.34 1.73 0 .74-.17 1.36-.507 1.86-.338.49-.837.9-1.502 1.22.906.26 1.576.72 2.022 1.37.448.66.665 1.45.665 2.36 0 .75-.13 1.39-.41 1.93-.28.55-.67 1-1.16 1.35-.49.35-1.06.61-1.7.78-.65.17-1.32.25-2.03.25H0V4.503h6.938zm-.41 5.71c.59 0 1.07-.14 1.44-.44.37-.3.55-.72.55-1.27 0-.3-.05-.55-.17-.76A1.3 1.3 0 007.8 7.23a2.1 2.1 0 00-.67-.27 3.8 3.8 0 00-.83-.09H2.62v3.35h3.91zm.22 5.96c.32 0 .62-.03.9-.1.28-.07.52-.18.73-.34.21-.15.38-.36.5-.61.12-.26.18-.57.18-.93 0-.74-.21-1.27-.64-1.59-.42-.32-.99-.48-1.7-.48H2.62v4.05h4.13zM18.45 16.9c.44.43.96.65 1.57.65.49 0 .91-.12 1.27-.37.36-.26.58-.53.66-.81h2.52c-.4 1.26-1.02 2.16-1.84 2.69-.82.55-1.81.82-2.98.82-.81 0-1.54-.13-2.19-.39a4.69 4.69 0 01-1.65-1.1 4.87 4.87 0 01-1.03-1.69c-.24-.65-.36-1.37-.36-2.15 0-.76.12-1.47.37-2.12.25-.65.6-1.22 1.05-1.69.45-.48.99-.85 1.64-1.11.64-.27 1.36-.4 2.14-.4.88 0 1.64.17 2.3.5.65.34 1.19.79 1.6 1.37.42.57.72 1.22.9 1.96.18.74.23 1.52.16 2.32h-7.52c.04.76.28 1.36.72 1.8zm2.73-5.67c-.36-.39-.87-.58-1.53-.58-.44 0-.81.08-1.1.22-.3.15-.54.34-.73.57-.2.23-.33.48-.42.74a3.72 3.72 0 00-.14.75h4.54c-.12-.72-.38-1.3-.62-1.7zM15.96 5.51h6.08V6.8h-6.08V5.51z" />
//     </svg>
//   );
// }

// ─── Avatar sub-component ─────────────────────────────────────────────────────
function Avatar({ avatar, name, size = 'lg' }) {
  const [imgError, setImgError] = useState(false);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  const sizeClass = size === 'lg'
    ? 'w-20 h-20 text-2xl'
    : 'w-10 h-10 text-base';

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full border-4 border-surface object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full border-4 border-surface bg-gradient-to-br from-orange to-orange/60 flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initial}
    </div>
  );
}

// ─── Main ProfileCard component ───────────────────────────────────────────────
export default function ProfileCard({
  user,
  attendanceData,
  attendanceLoading,
  onEdit,
  onView,
  currentUserUid,
  isAdmin,
}) {
  const canEdit = isAdmin || user.uid === currentUserUid;

  const socialLinks = user.socialLinks || {};
  const presentSocialLinks = [
    socialLinks.github      && { href: socialLinks.github,      icon: <GitHubIcon />,      label: 'GitHub' },
    socialLinks.linkedin    && { href: socialLinks.linkedin,    icon: <LinkedInIcon />,    label: 'LinkedIn' },
    socialLinks.twitter     && { href: socialLinks.twitter,     icon: <TwitterIcon />,     label: 'X / Twitter' },
    socialLinks.instagram   && { href: socialLinks.instagram,   icon: <InstagramIcon />,   label: 'Instagram' },
    socialLinks.onshape     && { href: socialLinks.onshape,     icon: <OnshapeIcon />,     label: 'Onshape' },
    // socialLinks.behance     && { href: socialLinks.behance,     icon: <BehanceIcon />,     label: 'Behance' },
    socialLinks.youtube     && { href: socialLinks.youtube,     icon: <YouTubeIcon />,     label: 'YouTube' },
    socialLinks.googledrive && { href: socialLinks.googledrive, icon: <GoogleDriveIcon />, label: 'Google Drive' },
    socialLinks.notion      && { href: socialLinks.notion,      icon: <NotionIcon />,      label: 'Notion' },
    socialLinks.portfolio   && { href: socialLinks.portfolio,   icon: <GlobeIcon />,       label: 'Portfolio' },
  ].filter(Boolean);

  const taskStats = user.taskStats || {
    totalTasks: 0,
    completedTasks: 0,
    completionRate: '0%',
  };

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden transition-all duration-300 hover:border-orange/40 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)] flex flex-col">

      {/* ── 1. Header Banner ── */}
      <div className="relative h-20 bg-gradient-to-br from-orange/20 via-orange/5 to-transparent flex-shrink-0">
        {/* Aerospace dot-grid overlay */}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(249,115,22,0.15) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      </div>

      {/* ── 2. Avatar ── */}
      <div className="flex flex-col items-center -mt-10 px-4">
        <Avatar avatar={user.avatar} name={user.name} />

        {/* Role badge */}
        <div className="mt-2">
          <RoleBadge role={user.role} customRole={user.customRole} size="xs" />
        </div>
      </div>

      {/* ── 3. Name & Info Block ── */}
      <div className="text-center mt-2 mb-3 px-4">
        <p className="text-text-primary font-bold text-base leading-tight truncate">
          {user.name || 'Unknown'}
        </p>
        <p className="text-text-muted text-xs mt-0.5 truncate">
          {user.designation || '—'}
        </p>
        {user.department && (
          <p className="text-orange text-xs font-semibold mt-0.5 truncate">
            {user.department}
          </p>
        )}
      </div>

      {/* ── 4. Stats Row ── */}
      <div className="grid grid-cols-3 divide-x divide-border border-t border-b border-border py-3 my-0">
        {/* Total Tasks */}
        <div className="flex flex-col items-center px-2">
          <span className="text-text-primary font-bold text-sm">
            {taskStats.totalTasks}
          </span>
          <span className="text-text-muted text-[10px] uppercase tracking-wider mt-0.5">
            Tasks
          </span>
        </div>

        {/* Completed */}
        <div className="flex flex-col items-center px-2">
          <span className="text-text-primary font-bold text-sm">
            {taskStats.completedTasks}
          </span>
          <span className="text-text-muted text-[10px] uppercase tracking-wider mt-0.5">
            Done
          </span>
        </div>

        {/* Attendance Rate — lazy, shows skeleton while loading */}
        <div className="flex flex-col items-center px-2">
          {attendanceLoading ? (
            <div className="w-8 h-4 animate-pulse bg-border rounded" />
          ) : (
            <span className="text-text-primary font-bold text-sm">
              {attendanceData ? attendanceData.attendanceRate : '—'}
            </span>
          )}
          <span className="text-text-muted text-[10px] uppercase tracking-wider mt-0.5">
            Present
          </span>
        </div>
      </div>

      {/* ── 5. Social Links Row ── */}
      <div className="flex items-center justify-center gap-3 px-4 py-3">
        {presentSocialLinks.length > 0 ? (
          presentSocialLinks.map(({ href, icon, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="p-2 rounded-lg bg-surfaceHover hover:bg-orange-muted hover:text-orange text-text-muted transition-colors"
            >
              {icon}
            </a>
          ))
        ) : (
          <p className="text-text-muted text-xs italic">No social links added</p>
        )}
      </div>

      {/* ── 6. Action Button ── */}
      <div className="mt-auto">
        {canEdit ? (
          <button
            onClick={() => onEdit(user)}
            className="btn-ghost w-full text-xs py-2.5 border-t border-border rounded-b-2xl"
          >
            ✏️ Edit Profile
          </button>
        ) : (
          <button
            onClick={() => onView(user)}
            className="btn-ghost w-full text-xs py-2.5 border-t border-border rounded-b-2xl"
          >
            👤 View Profile
          </button>
        )}
      </div>
    </div>
  );
}
