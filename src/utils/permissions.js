/**
 * Permission utility functions
 */

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
    case 'high': return '#rbc-event-high';
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
 * Only admins can create, edit, or delete roadmap node structure.
 * Employees may only update progress on tasks assigned to them.
 *
 * Intentionally checks `userProfile.role` directly (not `isAdmin` from
 * AuthContext) to remain consistent with all other permission helpers.
 *
 * @param {object|null} userProfile - User profile object from Firestore
 * @returns {boolean}
 */
export const canEditRoadmapStructure = (userProfile) => {
  if (!userProfile) return false;
  return userProfile.role === 'admin';
};
