/**
 * RoleBadge.jsx
 * Shared badge component that renders a user's display role consistently
 * across the entire app: ProfileCard, ViewProfileModal, Navbar, Sidebar, etc.
 *
 * - customRole  → purple/violet badge (admin-assigned display label)
 * - role 'admin' → orange badge (RBAC admin)
 * - role 'employee' → blue badge (default)
 *
 * Priority: customRole label > RBAC role label
 */

export default function RoleBadge({ role, customRole, size = 'sm' }) {
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';

  // Custom role — admin-assigned display label (highest priority)
  if (customRole) {
    return (
      <span
        className={`${textSize} font-semibold px-2 py-0.5 rounded-full border bg-violet-500/15 text-violet-400 border-violet-500/25 inline-block`}
      >
        {customRole}
      </span>
    );
  }

  // RBAC role fallback
  if (role === 'admin') {
    return (
      <span className={`${textSize} font-semibold px-2 py-0.5 rounded-full border badge-orange inline-block`}>
        ⭐ Admin
      </span>
    );
  }

  return (
    <span
      className={`${textSize} font-semibold px-2 py-0.5 rounded-full border bg-blue-500/15 text-blue-400 border-blue-500/25 inline-block`}
    >
      Employee
    </span>
  );
}
