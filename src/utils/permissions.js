/**
 * Permission utility functions
 */

/**
 * Whether a user holds an admin-granted permission (see permissionCatalog.js).
 * Admins hold every permission. Checks `userProfile.role` directly, like the
 * other helpers here; the employee-view toggle is applied by `can()` in
 * AuthContext, which is what UI code should call.
 *
 * firestore.rules mirrors this in its own can(key) and is the real boundary.
 *
 * @param {object|null} userProfile - User profile object from Firestore
 * @param {string} key              - A key from PERMISSION_KEYS
 * @returns {boolean}
 */
export const hasPermission = (userProfile, key) => {
  if (!userProfile) return false;
  if (userProfile.role === 'admin') return true;
  return userProfile.permissions?.[key] === true;
};

export const canEditTask = (task, userProfile) => {
  if (!task || !userProfile) return false;
  if (userProfile.role === 'admin') return true;
  if (task.isAdminTask) return false;
  return task.createdBy === userProfile.uid;
};

export const canUpdateProgress = (task, userProfile) => {
  if (!task || !userProfile) return false;
  if (userProfile.role === 'admin') return true;
  if (task.createdBy === userProfile.uid) return true;
  return Array.isArray(task.assignedTo) && task.assignedTo.includes(userProfile.uid);
};

export const canDeleteTask = (task, userProfile) => canEditTask(task, userProfile);

/**
 * Who may add / check / edit / delete items on a task's todo list.
 *
 * Everyone who actually works the task: admins, the creator, assignees, and
 * work partners. Wider than canUpdateProgress by design — a partner brought in
 * to help should be able to tick items off the shared checklist.
 *
 * Mirrors the task update rules in firestore.rules; the rules remain the real
 * boundary (see the `todos` entry in the participant carve-out there).
 *
 * @param {object|null} task        - Task document
 * @param {object|null} userProfile - User profile object from Firestore
 * @returns {boolean}
 */
export const canManageTodos = (task, userProfile) => {
  if (!task || !userProfile) return false;
  if (userProfile.role === 'admin') return true;
  if (task.createdBy === userProfile.uid) return true;
  if (Array.isArray(task.assignedTo) && task.assignedTo.includes(userProfile.uid)) return true;
  return Array.isArray(task.workPartnerUids) && task.workPartnerUids.includes(userProfile.uid);
};

export const canViewTask = (task, userProfile) => {
  if (!task || !userProfile) return false;
  if (userProfile.role === 'admin') return true;
  return Array.isArray(task.assignedTo) && task.assignedTo.includes(userProfile.uid);
};

export const getPriorityColor = (priority) => {
  switch (priority) {
    case 'high': return '#EF4444';
    case 'medium': return '#F59E0B';
    case 'low': return '#3B82F6';
    default: return '#8B949E';
  }
};

export const getPriorityBg = (priority) => {
  switch (priority) {
    case 'high': return '#EF4444';
    case 'medium': return '#F59E0B';
    case 'low': return '#3B82F6';
    default: return '#8B949E';
  }
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'completed': return '#22C55E';
    case 'in-progress': return '#3B82F6';
    case 'pending': return '#F59E0B';
    default: return '#8B949E';
  }
};

export const PRIORITY_OPTIONS = ['high', 'medium', 'low'];
export const STATUS_OPTIONS = ['pending', 'in-progress', 'completed'];
export const MODULE_OPTIONS = [
  'Mission Planning',
  'Avionics',
  'Propulsion',
  'Structures',
  'Navigation',
  'Ground Support',
  'Quality Assurance',
  'Research & Development',
  'Documentation',
  'Testing',
  'Other',
];

// ── Roadmap Permissions ─────────────────────────────────────────────────────

/**
 * Admins, and anyone granted `roadmap.edit`, can create, edit, or archive
 * roadmap node structure. Other employees may only update progress on work
 * assigned to them. Mirrors can('roadmap.edit') on roadmapNodes in firestore.rules.
 *
 * Intentionally checks `userProfile.role` directly (not `isAdmin` from
 * AuthContext) to remain consistent with all other permission helpers.
 *
 * @param {object|null} userProfile - User profile object from Firestore
 * @returns {boolean}
 */
export const canEditRoadmapStructure = (userProfile) =>
  hasPermission(userProfile, 'roadmap.edit');
