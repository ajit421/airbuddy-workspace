/**
 * workItems.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure logic shared by every tool: which collection a work item lives in, who
 * may do what to it, and how a document is presented to Claude.
 *
 * Everything here mirrors a counterpart in the web app, and the parity tests
 * in workItems.test.js import those counterparts and compare — so a change to
 * src/ that is not repeated here fails `npm test` instead of producing writes
 * the rules reject in production:
 *
 *   NODE_ASSIGNEE_WRITABLE_FIELDS  ⇔ src/services/roadmapService.js
 *   normalizeTodos                 ⇔ src/services/todoService.js
 *   computeHierarchy               ⇔ src/services/roadmapService.js
 *   canUpdateProgress / canManageTodos ⇔ src/utils/permissions.js
 *   canAddPartner                  ⇔ checkCanAddPartner in collaborationService.js
 *   hasPermission                  ⇔ src/utils/permissions.js
 *   PERMISSION_KEYS                ⇔ src/utils/permissionCatalog.js
 *   MODULE_OPTIONS                 ⇔ src/utils/permissions.js
 *
 * The client-side permission checks only exist to give Claude a clear reason
 * before a write is attempted. firestore.rules is still the actual boundary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const KIND_TASK = 'task';
export const KIND_MILESTONE = 'milestone';

export const COLLECTION = {
  [KIND_TASK]: 'tasks',
  [KIND_MILESTONE]: 'roadmapNodes',
};

/**
 * Fields an assignee (non-admin) may write on a roadmap node. Must equal both
 * NODE_ASSIGNEE_WRITABLE_FIELDS in roadmapService.js and the assignee hasOnly()
 * list on `match /roadmapNodes/{nodeId}` in firestore.rules.
 */
export const NODE_ASSIGNEE_WRITABLE_FIELDS = [
  'status', 'progress', 'completionNote', 'attachments',
  'dueDate', 'isExtended', 'updatedBy', 'updatedAt',
];

/** Fields a task assignee may NOT write (firestore.rules, `tasks` update). */
export const TASK_ASSIGNEE_DENIED_FIELDS = [
  'title', 'description', 'assignedTo', 'startDate', 'priority', 'module', 'isAdminTask',
];

export const TODO_MAX_LENGTH = 500;
export const COMMENT_MAX_LENGTH = 2000;

/** Progress drives status, exactly as TaskDetailModal's doSaveProgress does. */
export function deriveStatus(progress) {
  if (progress >= 100) return 'completed';
  if (progress > 0) return 'in-progress';
  return 'pending';
}

// ─── Dates ────────────────────────────────────────────────────────────────────

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Calendar day in India for a stored date. Due dates are written as UTC
 * midnight of the picked day (05:30 IST, same day), and personal-task defaults
 * as "now + 24h" — formatting in IST gives the day the person picked for both,
 * where a UTC toISOString().slice(0,10) would be a day early for anything
 * written between 00:00 and 05:30 IST.
 *
 * @param {Date|string|null|undefined} d
 * @returns {string|null} YYYY-MM-DD
 */
export function istDate(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return isNaN(date) ? null : IST_DATE.format(date);
}

/**
 * Parse a YYYY-MM-DD the way the web app's date inputs are stored:
 * `new Date('YYYY-MM-DD')`, i.e. UTC midnight of that day. Writing it the same
 * way keeps calendar sync (functions/time.js) and the Dashboard agreeing on the day.
 *
 * @param {string} s
 * @returns {Date}
 */
export function parseDateInput(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? '')) {
    throw new Error(`Dates must be YYYY-MM-DD, got "${s}".`);
  }
  const d = new Date(s);
  if (isNaN(d) || d.toISOString().slice(0, 10) !== s) throw new Error(`"${s}" is not a real date.`);
  return d;
}

/** Today in India as YYYY-MM-DD. */
export const todayIst = () => istDate(new Date());

// ─── Admin-granted permissions ───────────────────────────────────────────────

/** Same list as src/utils/permissionCatalog.js (parity-tested). */
export const PERMISSION_KEYS = [
  'hrms.directory', 'hrms.attendance', 'hrms.leaves', 'hrms.recruitment', 'hrms.performance',
  'kpi.edit', 'roadmap.edit', 'tasks.assign', 'tasks.viewAll', 'announcements.post',
];

/**
 * The permissions the connector's tools actually use. The rest of the catalog
 * (HRMS, KPI, announcements) has no tool yet, so it grants nothing here.
 */
export const TOOL_PERMISSIONS = {
  'roadmap.edit': 'create_milestone, update_milestone; update progress/dates on any milestone',
  'tasks.assign': 'assign_task — assign a task to teammates',
  'tasks.viewAll': "list_my_work with `assignee` — see anybody's work",
};

/**
 * Admins hold every permission; an employee holds the keys an admin granted
 * (users/{uid}.permissions). Same as hasPermission() in src/utils/permissions.js
 * and can(key) in firestore.rules — which is still the real boundary.
 *
 * @param {{role?: string, permissions?: object}|null} me
 * @param {string} key
 */
export function hasPermission(me, key) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  return me.permissions?.[key] === true;
}

/** The granted keys, for whoami. */
export const grantedPermissions = (me) =>
  me?.role === 'admin' ? [...PERMISSION_KEYS] : PERMISSION_KEYS.filter((k) => me?.permissions?.[k] === true);

/** Same as MODULE_OPTIONS in src/utils/permissions.js — the Admin Panel's task modules. */
export const MODULE_OPTIONS = [
  'Mission Planning', 'Avionics', 'Propulsion', 'Structures', 'Navigation', 'Ground Support',
  'Quality Assurance', 'Research & Development', 'Documentation', 'Testing', 'Other',
];

// ─── Roles on an item ─────────────────────────────────────────────────────────

const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []);

/** @param {object} item @param {string} uid */
export const isAssignee = (item, uid) => asList(item?.assignedTo).includes(uid);
/** @param {object} item @param {string} uid */
export const isWorkPartner = (item, uid) => asList(item?.workPartnerUids).includes(uid);

/** @param {object} item @param {{uid: string, role?: string}} me */
export function canUpdateProgress(item, me) {
  if (!item || !me) return false;
  if (me.role === 'admin') return true;
  if (item.createdBy === me.uid) return true;
  return isAssignee(item, me.uid);
}

/** @param {object} item @param {{uid: string, role?: string}} me */
export function canManageTodos(item, me) {
  if (!item || !me) return false;
  if (me.role === 'admin') return true;
  if (item.createdBy === me.uid) return true;
  return isAssignee(item, me.uid) || isWorkPartner(item, me.uid);
}

/**
 * Creator, assignee or an existing partner (the recursive rule) — or an admin,
 * which the web UI checks at component level.
 * @param {object} item @param {{uid: string, role?: string}} me
 */
export function canAddPartner(item, me) {
  if (!item || !me) return false;
  if (me.role === 'admin') return true;
  return item.createdBy === me.uid || isAssignee(item, me.uid) ||
    (Array.isArray(item.workPartners) && item.workPartners.some((p) => p?.uid === me.uid));
}

// ─── Todos ────────────────────────────────────────────────────────────────────

/**
 * Same normalisation as todoService.normalizeTodos — tolerant of legacy shapes,
 * sorted oldest first.
 * @param {unknown} raw
 * @returns {Array<object>}
 */
export function normalizeTodos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === 'object' && typeof t.text === 'string')
    .map((t, i) => ({
      id:              typeof t.id === 'string' && t.id ? t.id : `legacy-${i}`,
      text:            t.text,
      done:            t.done === true,
      createdAt:       typeof t.createdAt === 'string' ? t.createdAt : '',
      createdBy:       typeof t.createdBy === 'string' ? t.createdBy : '',
      createdByName:   typeof t.createdByName === 'string' ? t.createdByName : '',
      completedAt:     typeof t.completedAt === 'string' ? t.completedAt : null,
      completedBy:     typeof t.completedBy === 'string' ? t.completedBy : null,
      completedByName: typeof t.completedByName === 'string' ? t.completedByName : null,
    }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

/**
 * Find one todo by id, 1-based position, or unique case-insensitive text match.
 * @param {Array<object>} todos - normalized
 * @param {string} ref
 * @returns {object}
 */
export function findTodo(todos, ref) {
  const r = String(ref ?? '').trim();
  const byId = todos.find((t) => t.id === r);
  if (byId) return byId;
  if (/^\d+$/.test(r)) {
    const n = Number(r);
    if (n >= 1 && n <= todos.length) return todos[n - 1];
  }
  const needle = r.toLowerCase();
  const exact = todos.filter((t) => t.text.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const hits = todos.filter((t) => t.text.toLowerCase().includes(needle));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`No checklist item matches "${r}".`);
  throw new Error(`"${r}" matches ${hits.length} checklist items: ${hits.map((t) => `"${t.text}"`).join(', ')}. Be more specific or pass the item id.`);
}

// ─── Hierarchy ────────────────────────────────────────────────────────────────

/** Same as roadmapService.computeHierarchy. */
export function computeHierarchy(newNodeId, parentNode) {
  if (!parentNode) {
    return { parentId: null, path: newNodeId, ancestorIds: [], depth: 0 };
  }
  return {
    parentId:    parentNode.id,
    path:        `${parentNode.path}/${newNodeId}`,
    ancestorIds: [...(parentNode.ancestorIds ?? []), parentNode.id],
    depth:       (parentNode.depth ?? 0) + 1,
  };
}

/** dueDate → order → title → id, undated last — roadmapService.sortNodesByDueDate. */
export function sortByDueDate(items) {
  const millis = (x) => {
    const d = x?.dueDate instanceof Date ? x.dueDate : x?.dueDate ? new Date(x.dueDate) : null;
    return d && !isNaN(d) ? d.getTime() : null;
  };
  const tiebreak = (a, b) =>
    (a.order ?? 0) - (b.order ?? 0) ||
    (a.title ?? '').localeCompare(b.title ?? '') ||
    (a.id ?? '').localeCompare(b.id ?? '');
  return [...items].sort((a, b) => {
    const ma = millis(a);
    const mb = millis(b);
    if (ma === null && mb === null) return tiebreak(a, b);
    if (ma === null) return 1;
    if (mb === null) return -1;
    return (ma - mb) || tiebreak(a, b);
  });
}

// ─── People ───────────────────────────────────────────────────────────────────

/**
 * Resolve a person by uid, email, or name (exact, then unique partial match).
 *
 * @param {Array<{uid: string, name?: string, email?: string}>} people
 * @param {string} query
 * @returns {{uid: string, name: string, email: string, avatar: string}}
 */
export function matchPerson(people, query) {
  const q = String(query ?? '').trim();
  const lower = q.toLowerCase();
  const pick = (p) => ({ uid: p.uid, name: p.name || p.email || p.uid, email: p.email || '', avatar: p.avatar || '' });

  const exact = people.find((p) =>
    p.uid === q || (p.email ?? '').toLowerCase() === lower || (p.name ?? '').toLowerCase() === lower);
  if (exact) return pick(exact);

  const partial = people.filter((p) =>
    (p.name ?? '').toLowerCase().includes(lower) || (p.email ?? '').toLowerCase().split('@')[0] === lower);
  if (partial.length === 1) return pick(partial[0]);
  if (partial.length === 0) throw new Error(`Nobody on the team matches "${q}". Use list_team to see names.`);
  throw new Error(`"${q}" matches ${partial.length} people: ${partial.map((p) => `${p.name} <${p.email}>`).join(', ')}. Use the full name or email.`);
}

// ─── Presentation ─────────────────────────────────────────────────────────────

/**
 * Compact, Claude-readable view of a task or milestone document.
 *
 * @param {object} doc   - decoded document
 * @param {'task'|'milestone'} kind
 * @param {(uid: string) => string} nameOf
 * @param {string} [myUid]
 * @param {{detail?: boolean}} [opts]
 */
export function presentWorkItem(doc, kind, nameOf, myUid, { detail = false } = {}) {
  const status = doc.status ?? 'pending';
  const due = istDate(doc.dueDate);
  const myRoles = myUid
    ? [
        isAssignee(doc, myUid) && 'assignee',
        isWorkPartner(doc, myUid) && 'work partner',
        doc.createdBy === myUid && 'creator',
      ].filter(Boolean)
    : [];

  const out = {
    id: doc.id,
    kind,
    title: doc.title ?? '(untitled)',
    status,
    progress: doc.progress ?? 0,
    priority: doc.priority ?? 'medium',
    dueDate: due,
    overdue: Boolean(due && status !== 'completed' && due < todayIst()),
    assignees: asList(doc.assignedTo).map(nameOf),
    workPartners: (Array.isArray(doc.workPartners) ? doc.workPartners : []).map((p) => p?.name || nameOf(p?.uid)),
    ...(myRoles.length ? { yourRole: myRoles } : {}),
  };
  if (doc.isExtended) out.extended = true;
  if (kind === KIND_TASK) {
    out.type = doc.isAdminTask === false ? 'personal' : 'assigned';
    if (doc._mirrorOf === 'roadmap') out.roadmapNodeId = doc.roadmapNodeId;
  } else {
    out.depth = doc.depth ?? 0;
    out.childCount = doc.childCount ?? 0;
  }
  if (!detail) return out;

  const todos = normalizeTodos(doc.todos);
  return {
    ...out,
    description: doc.description ?? '',
    startDate: istDate(doc.startDate),
    createdBy: doc.createdBy ? nameOf(doc.createdBy) : null,
    ...(kind === KIND_TASK && doc.module ? { module: doc.module } : {}),
    completionNote: doc.completionNote
      ? {
          message: doc.completionNote.message,
          by: doc.completionNote.completedBy,
          at: istDate(doc.completionNote.completedAt),
        }
      : null,
    checklist: todos.map((t, i) => ({ n: i + 1, id: t.id, text: t.text, done: t.done })),
    attachments: (Array.isArray(doc.attachments) ? doc.attachments : []).map((a) =>
      typeof a === 'string' ? a : a?.url || a?.name || a),
  };
}
