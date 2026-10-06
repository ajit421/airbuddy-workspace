/**
 * permissionCatalog.js
 * The single list of grantable permissions.
 *
 * Stored on users/{uid}.permissions as a flat map of { '<key>': true }.
 * A missing key means "not granted"; admins pass every check regardless.
 * Keys are flat dotted strings, not nested maps, because firestore.rules
 * tests them with `permissions.get('<key>', false)` in can().
 *
 * Adding a permission:
 *   1. add it here (the Admin Panel, Zod schema and tests all read this list)
 *   2. gate the UI with `can('<key>')` from useAuth()
 *   3. enforce it in firestore.rules with `can('<key>')` — the sidebar hiding
 *      a link is not access control.
 *
 * There is deliberately no key that grants the admin role itself.
 */

export const PERMISSION_GROUPS = ['HRMS', 'KPI', 'Roadmap', 'Tasks', 'Admin'];

export const PERMISSION_CATALOG = [
  { key: 'hrms.directory',     group: 'HRMS',    label: 'Employee Directory',  description: 'See every employee\'s profile, department and designation. Never shows salary.' },
  { key: 'hrms.attendance',    group: 'HRMS',    label: 'Attendance',          description: 'See the whole team\'s attendance records.' },
  { key: 'hrms.leaves',        group: 'HRMS',    label: 'Approve leaves',      description: 'See every leave request and approve or reject it.' },
  { key: 'hrms.recruitment',   group: 'HRMS',    label: 'Recruitment',         description: 'See and manage job candidates (personal data).' },
  { key: 'hrms.performance',   group: 'HRMS',    label: 'Performance',         description: 'See and write performance reviews for everyone.' },
  { key: 'kpi.edit',           group: 'KPI',     label: 'Edit KPI',            description: 'Add, edit and delete industries, clients, products, sales and IP.' },
  { key: 'roadmap.edit',       group: 'Roadmap', label: 'Edit roadmap',        description: 'Create, edit and archive company roadmap milestones.' },
  { key: 'tasks.assign',       group: 'Tasks',   label: 'Assign tasks',        description: 'Assign tasks to other people from the Admin Panel.' },
  { key: 'tasks.viewAll',      group: 'Tasks',   label: 'See all tasks',       description: 'See every task in the company, not only their own.' },
  { key: 'announcements.post', group: 'Admin',   label: 'Post announcements',  description: 'Create and delete team announcements.' },
];

export const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

/**
 * The Admin Panel opens for anyone holding at least one of these, and each
 * tab is gated on its own key — so nobody lands on an empty panel. Granting
 * permissions (the Permissions tab) stays with real admins only.
 */
export const ADMIN_PANEL_PERMISSIONS = ['tasks.assign', 'tasks.viewAll', 'announcements.post'];

/**
 * One-click starting points in the permissions modal. Applying a preset
 * replaces the current selection; the admin can still tick extra boxes.
 */
export const PERMISSION_PRESETS = {
  None:    [],
  HR:      ['hrms.directory', 'hrms.attendance', 'hrms.leaves', 'hrms.recruitment', 'hrms.performance'],
  Sales:   ['kpi.edit'],
  Manager: ['tasks.assign', 'tasks.viewAll', 'roadmap.edit'],
};

/** Count of granted (true) keys that are still in the catalog. */
export const countGranted = (permissions) =>
  PERMISSION_KEYS.filter((k) => permissions?.[k] === true).length;
