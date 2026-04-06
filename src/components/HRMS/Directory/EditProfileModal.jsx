/**
 * EditProfileModal.jsx
 * Edit Profile modal — allows users to update their own safe profile fields.
 * Admins see an extra section to update department, designation, and role.
 */

import { useState, useEffect, useRef } from 'react';
import Modal from '../../shared/Modal';
import {
  updateUserProfile,
  updateUserAdminFields,
} from '../../../services/teamMembersService';

// ─── Inline icons (same set as ProfileCard) ────────────────────────────────
function GitHubIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0-2.209-1.791-4 4-4z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function OnshapeIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 3a7 7 0 110 14A7 7 0 0112 5zm0 2a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6A3 3 0 0112 9z" />
    </svg>
  );
}

function GoogleDriveIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.28 3h11.44l-2.927 5.07H3.353zm-.927 1.607L1.5 12.535h5.853L11.28 5.07zm9.504 7.928H3.353L6.28 21h11.44l-2.927-5.07 2.927-4.465zm-4.514 0l-2.927 5.07h5.854l-2.927-5.07zm2.927-7.928L20 12.535l-2.927 2.393-2.927-4.465z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function NotionIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  );
}

// function BehanceIcon() {
//   return (
//     <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
//       <path d="M6.938 4.503c.702 0 1.34.06 1.92.188.577.13 1.07.33 1.485.61.41.28.733.65.96 1.12.225.47.34 1.05.34 1.73 0 .74-.17 1.36-.507 1.86-.338.49-.837.9-1.502 1.22.906.26 1.576.72 2.022 1.37.448.66.665 1.45.665 2.36 0 .75-.13 1.39-.41 1.93-.28.55-.67 1-1.16 1.35-.49.35-1.06.61-1.7.78-.65.17-1.32.25-2.03.25H0V4.503h6.938zm-.41 5.71c.59 0 1.07-.14 1.44-.44.37-.3.55-.72.55-1.27 0-.3-.05-.55-.17-.76A1.3 1.3 0 007.8 7.23a2.1 2.1 0 00-.67-.27 3.8 3.8 0 00-.83-.09H2.62v3.35h3.91zm.22 5.96c.32 0 .62-.03.9-.1.28-.07.52-.18.73-.34.21-.15.38-.36.5-.61.12-.26.18-.57.18-.93 0-.74-.21-1.27-.64-1.59-.42-.32-.99-.48-1.7-.48H2.62v4.05h4.13zM18.45 16.9c.44.43.96.65 1.57.65.49 0 .91-.12 1.27-.37.36-.26.58-.53.66-.81h2.52c-.4 1.26-1.02 2.16-1.84 2.69-.82.55-1.81.82-2.98.82-.81 0-1.54-.13-2.19-.39a4.69 4.69 0 01-1.65-1.1 4.87 4.87 0 01-1.03-1.69c-.24-.65-.36-1.37-.36-2.15 0-.76.12-1.47.37-2.12.25-.65.6-1.22 1.05-1.69.45-.48.99-.85 1.64-1.11.64-.27 1.36-.4 2.14-.4.88 0 1.64.17 2.3.5.65.34 1.19.79 1.6 1.37.42.57.72 1.22.9 1.96.18.74.23 1.52.16 2.32h-7.52c.04.76.28 1.36.72 1.8zm2.73-5.67c-.36-.39-.87-.58-1.53-.58-.44 0-.81.08-1.1.22-.3.15-.54.34-.73.57-.2.23-.33.48-.42.74a3.72 3.72 0 00-.14.75h4.54c-.12-.72-.38-1.3-.62-1.7zM15.96 5.51h6.08V6.8h-6.08V5.51z" />
//     </svg>
//   );
// }

// ─── Prefixed input with icon ─────────────────────────────────────────────────
function IconInput({ icon, label, value, onChange, placeholder, type = 'url' }) {
  return (
    <div>
      <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 py-2 focus-within:border-orange transition-colors">
        <span className="text-text-muted flex-shrink-0">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-text-primary text-sm placeholder-text-muted outline-none"
        />
      </div>
    </div>
  );
}

// ─── Avatar preview ─────────────────────────────────────────────────────────
function AvatarPreview({ src, name }) {
  const [imgError, setImgError] = useState(false);
  const initial = name ? name.charAt(0).toUpperCase() : '?';

  // Reset error flag whenever the URL changes so a newly-typed valid URL renders
  useEffect(() => { setImgError(false); }, [src]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt="Preview"
        onError={() => setImgError(true)}
        className="w-10 h-10 rounded-full object-cover border-2 border-border flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange to-orange/60 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
      {initial}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function EditProfileModal({ isOpen, onClose, user, currentUserUid, isAdmin }) {
  const viewingOtherUser = user?.uid !== currentUserUid;

  // ── Form state ──
  const [avatar,      setAvatar]      = useState('');
  const [bio,         setBio]         = useState('');
  const [phone,       setPhone]       = useState('');
  const [skills,      setSkills]      = useState([]);
  const [skillInput,  setSkillInput]  = useState('');
  const [socialLinks, setSocialLinks] = useState({
    github: '', linkedin: '', instagram: '', portfolio: '',
    twitter: '', onshape: '', googledrive: '', youtube: '', notion: '', behance: ''
  });
  // Admin-only fields
  const [department,  setDepartment]  = useState('');
  const [designation, setDesignation] = useState('');
  const [role,        setRole]        = useState('employee');
  const [customRole,  setCustomRole]  = useState('');  // display-only label

  // ── Submit state ──
  const [saving,        setSaving]        = useState(false);
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  const [errorMessage,  setErrorMessage]  = useState('');

  const skillInputRef = useRef(null);

  // Pre-populate form when modal opens / user changes
  useEffect(() => {
    if (!user) return;
    setAvatar(user.avatar || '');
    setBio(user.bio || '');
    setPhone(user.phone || '');
    setSkills(Array.isArray(user.skills) ? [...user.skills] : []);
    setSocialLinks({
      github:      user.socialLinks?.github      || '',
      linkedin:    user.socialLinks?.linkedin    || '',
      instagram:   user.socialLinks?.instagram   || '',
      portfolio:   user.socialLinks?.portfolio   || '',
      twitter:     user.socialLinks?.twitter     || '',
      onshape:     user.socialLinks?.onshape     || '',
      googledrive: user.socialLinks?.googledrive || '',
      youtube:     user.socialLinks?.youtube     || '',
      notion:      user.socialLinks?.notion      || '',
      // behance:     user.socialLinks?.behance     || '',
    });
    setDepartment(user.department || '');
    setDesignation(user.designation || '');
    setRole(user.role || 'employee');
    setCustomRole(user.customRole || '');
    setErrorMessage('');
    setSaveSuccess(false);
  }, [user, isOpen]);

  // ── Skill tag handlers ──
  const addSkill = (raw) => {
    const tag = raw.trim().replace(/,$/, '');
    if (!tag || skills.length >= 10 || skills.includes(tag)) return;
    setSkills((prev) => [...prev, tag]);
    setSkillInput('');
  };

  const handleSkillKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkill(skillInput);
    }
  };

  const removeSkill = (tag) => setSkills((prev) => prev.filter((s) => s !== tag));

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage('');

    try {
      // Safe personal fields — always written via the service whitelist
      await updateUserProfile(user.uid, {
        avatar:      avatar.trim(),
        bio:         bio.trim(),
        phone:       phone.trim(),
        skills,
        socialLinks: {
          github:      socialLinks.github.trim(),
          linkedin:    socialLinks.linkedin.trim(),
          instagram:   socialLinks.instagram.trim(),
          portfolio:   socialLinks.portfolio.trim(),
          twitter:     socialLinks.twitter.trim(),
          onshape:     socialLinks.onshape.trim(),
          googledrive: socialLinks.googledrive.trim(),
          youtube:     socialLinks.youtube.trim(),
          notion:      socialLinks.notion.trim(),
          // behance:     socialLinks.behance.trim(),
        },
      });

      // Admin-only fields — written via the service (no direct Firebase in components)
      if (isAdmin && viewingOtherUser) {
        await updateUserAdminFields(user.uid, {
          department:  department.trim(),
          designation: designation.trim(),
          role,
          customRole:  customRole.trim(),
        });
      }

      setSaveSuccess(true);
      // Auto-reset success state and close after 2s
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('[EditProfileModal] save failed:', err);
      setErrorMessage('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── 1. Profile Photo URL ── */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-2">
            Profile Photo URL
          </label>
          <div className="flex items-center gap-3">
            <AvatarPreview src={avatar} name={user?.name} />
            <input
              type="url"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="input-field flex-1"
            />
          </div>
        </div>

        {/* ── 2. Bio ── */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-2">
            Short Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short bio about yourself..."
            rows={3}
            className="input-field resize-none w-full"
          />
        </div>

        {/* ── 3. Phone ── */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="input-field w-full"
          />
        </div>

        {/* ── 4. Skills Tag Input ── */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">
            Skills
          </label>
          <p className="text-text-muted text-[11px] mb-2">Press Enter or comma to add (max 10)</p>

          {/* Existing skill chips */}
          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((skill) => (
                <span key={skill} className="badge-orange flex items-center gap-1 text-xs">
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="ml-0.5 opacity-70 hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${skill}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            ref={skillInputRef}
            type="text"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={handleSkillKeyDown}
            onBlur={() => skillInput.trim() && addSkill(skillInput)}
            placeholder={skills.length >= 10 ? 'Max 10 skills reached' : 'e.g. React, Firebase...'}
            disabled={skills.length >= 10}
            className="input-field w-full"
          />
        </div>

        {/* ── 5. Social Links ── */}
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">
            Social &amp; Professional Links
          </label>
          <p className="text-text-muted text-[11px] mb-3">Only fill in the platforms you use. Blank fields won't be shown.</p>

          <div className="space-y-5">
            {/* Professional */}
            <div>
              <p className="text-[10px] text-orange font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="block w-3 h-px bg-orange/50"></span> Professional
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <IconInput icon={<GitHubIcon />}    label="GitHub"    value={socialLinks.github}    onChange={(e) => setSocialLinks((p) => ({ ...p, github: e.target.value }))}    placeholder="github.com/username" />
                <IconInput icon={<LinkedInIcon />}  label="LinkedIn"  value={socialLinks.linkedin}  onChange={(e) => setSocialLinks((p) => ({ ...p, linkedin: e.target.value }))}  placeholder="linkedin.com/in/username" />
                <IconInput icon={<OnshapeIcon />}   label="Onshape"   value={socialLinks.onshape}   onChange={(e) => setSocialLinks((p) => ({ ...p, onshape: e.target.value }))}   placeholder="cad.onshape.com/documents/..." />
                {/* <IconInput icon={<BehanceIcon />}   label="Behance"   value={socialLinks.behance}   onChange={(e) => setSocialLinks((p) => ({ ...p, behance: e.target.value }))}   placeholder="behance.net/username" /> */}
              </div>
            </div>

            {/* Social */}
            <div>
              <p className="text-[10px] text-orange font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="block w-3 h-px bg-orange/50"></span> Social
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <IconInput icon={<TwitterIcon />}   label="X / Twitter" value={socialLinks.twitter}   onChange={(e) => setSocialLinks((p) => ({ ...p, twitter: e.target.value }))}   placeholder="x.com/username" />
                <IconInput icon={<InstagramIcon />} label="Instagram"   value={socialLinks.instagram} onChange={(e) => setSocialLinks((p) => ({ ...p, instagram: e.target.value }))} placeholder="instagram.com/username" />
                <IconInput icon={<YouTubeIcon />}   label="YouTube"     value={socialLinks.youtube}   onChange={(e) => setSocialLinks((p) => ({ ...p, youtube: e.target.value }))}   placeholder="youtube.com/@channel" />
              </div>
            </div>

            {/* Productivity */}
            <div>
              <p className="text-[10px] text-orange font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="block w-3 h-px bg-orange/50"></span> Productivity &amp; Portfolio
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <IconInput icon={<GlobeIcon />}        label="Portfolio / Website" value={socialLinks.portfolio}   onChange={(e) => setSocialLinks((p) => ({ ...p, portfolio: e.target.value }))}   placeholder="myportfolio.com" />
                <IconInput icon={<GoogleDriveIcon />}  label="Google Drive"        value={socialLinks.googledrive} onChange={(e) => setSocialLinks((p) => ({ ...p, googledrive: e.target.value }))} placeholder="drive.google.com/drive/folders/..." />
                <IconInput icon={<NotionIcon />}       label="Notion"              value={socialLinks.notion}      onChange={(e) => setSocialLinks((p) => ({ ...p, notion: e.target.value }))}      placeholder="notion.so/username" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Admin Controls ── */}
        {isAdmin && viewingOtherUser && (
          <div className="pt-4 border-t border-border space-y-4">
            <p className="text-xs font-semibold text-orange uppercase tracking-wider">
              Admin Controls
            </p>
            <p className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              ⚠️ Changing role grants or revokes admin access immediately.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Avionics"
                  className="input-field w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Systems Engineer"
                  className="input-field w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Custom Role Label
              </label>
              <p className="text-text-muted text-[11px] mb-1.5">
                Display badge shown on profile cards, sidebar, and navbar. Leave blank to hide.
              </p>
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="e.g. Team Lead, QA Engineer, Project Manager"
                className="input-field w-full"
                maxLength={40}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="select-field w-full"
              >
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        )}

        {/* ── Error message ── */}
        {errorMessage && (
          <p className="text-red-400 text-sm text-center">{errorMessage}</p>
        )}

        {/* ── Action buttons ── */}
        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || saveSuccess}
            className="btn-primary flex-1"
          >
            {saveSuccess ? '✓ Saved!' : saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

      </form>
    </Modal>
  );
}
