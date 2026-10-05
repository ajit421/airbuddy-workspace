/**
 * tools.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The MCP tool surface. Each tool is a thin Zod-validated wrapper over a
 * WorkspaceApi method — Zod here is the write boundary, the same role
 * `Schema.parse(form)` plays in src/services/.
 *
 * Deliberately absent:
 *   - Deleting tasks. TaskDetailModal's delete does not route roadmap tasks
 *     (a known open bug, see CLAUDE.md); copying it here would copy the bug.
 *   - Archiving milestones. Hiding a subtree is a roadmap-page decision an
 *     admin should make looking at the tree, not from a chat.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import { FirestoreError } from './firestore.js';
import { NotSignedInError } from './session.js';

const id = z.string().min(1).describe('Task or milestone id (from list_my_work, search_roadmap or browse_roadmap)');
const kind = z.enum(['task', 'milestone']).optional()
  .describe('Optional. Skip it unless an id is ambiguous; the server finds the right collection.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const person = z.string().min(1).describe('Name, email or uid of a team member');

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const REMOVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

/** Turn a thrown error into a tool result Claude can act on. */
function toErrorText(err) {
  if (err instanceof NotSignedInError) return err.message;
  if (err instanceof FirestoreError) {
    if (err.status === 'PERMISSION_DENIED') {
      return 'WorkSpace security rules rejected this. You are signed in as yourself, so this is something your account is not allowed to do — the same thing would fail in the web app.';
    }
    if (err.status === 'FAILED_PRECONDITION' && /index/i.test(err.message)) {
      return `Firestore needs an index for this query: ${err.message}`;
    }
    return `Firestore error (${err.status}): ${err.message}`;
  }
  if (err instanceof z.ZodError) return `Invalid input: ${err.issues.map((i) => i.message).join('; ')}`;
  return err?.message ?? String(err);
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {import('./workspace.js').WorkspaceApi} api
 */
export function registerTools(server, api) {
  const tool = (name, { title, description, inputSchema = {}, annotations }, fn) =>
    server.registerTool(name, { title, description, inputSchema, annotations }, async (args) => {
      try {
        const result = await fn(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        console.error(`[airbuddy-mcp] ${name}:`, err);
        return { isError: true, content: [{ type: 'text', text: toErrorText(err) }] };
      }
    });

  // ─── Read ──────────────────────────────────────────────────────────────────

  tool('whoami', {
    title: 'Who am I',
    description: 'The WorkSpace account this Claude is acting as: name, email, role (admin or employee).',
    annotations: READ,
  }, async () => {
    const me = await api.me();
    return { name: me.name, email: me.email, role: me.role, uid: me.uid };
  });

  tool('list_my_work', {
    title: 'List my work',
    description:
      'Your open work items — the same list as your WorkSpace Dashboard: tasks assigned to you or where you are a work partner, ' +
      'plus roadmap milestones assigned to you or partnered by you. Sorted by due date. Admins may pass `assignee` to see somebody else\'s.',
    inputSchema: {
      include_completed: z.boolean().optional().describe('Also include completed items (default false)'),
      assignee: person.optional().describe('Admins only: whose work to list'),
    },
    annotations: READ,
  }, ({ include_completed, assignee }) => api.listWork({ includeCompleted: include_completed, assignee }));

  tool('get_work_item', {
    title: 'Get work item',
    description:
      'Full detail of one task or milestone: description, checklist (with item numbers), work partners, completion note and recent activity. ' +
      'For a milestone also its breadcrumb, child milestones and recent comments. Read this before changing an item.',
    inputSchema: { id, kind },
    annotations: READ,
  }, ({ id: itemId, kind: k }) => api.getItem(itemId, k));

  tool('browse_roadmap', {
    title: 'Browse roadmap',
    description: 'The company roadmap tree. With no parent_id, lists the root milestones; with one, lists that milestone\'s children. depth 1–3.',
    inputSchema: {
      parent_id: z.string().optional().describe('Milestone id to start from; omit for the roadmap root'),
      depth: z.number().int().min(1).max(3).optional().describe('Levels to expand (default 1)'),
    },
    annotations: READ,
  }, ({ parent_id, depth }) => api.browseRoadmap({ parentId: parent_id ?? null, depth: depth ?? 1 }));

  tool('search_roadmap', {
    title: 'Search roadmap',
    description: 'Find roadmap milestones whose title or description contains the text. Returns ids and breadcrumbs.',
    inputSchema: { query: z.string().min(1) },
    annotations: READ,
  }, ({ query }) => api.searchRoadmap(query));

  tool('list_team', {
    title: 'List team',
    description: 'Everyone on WorkSpace (name, email, role, designation) — use it to pick work partners or assignees.',
    annotations: READ,
  }, async () => (await api.team()).map(({ avatar: _a, ...p }) => p));

  // ─── Progress and dates ────────────────────────────────────────────────────

  tool('update_progress', {
    title: 'Update progress',
    description:
      'Set progress (0–100) on a task or milestone you are assigned to. Status follows progress the way the web app does it: 0 = pending, 1–99 = in-progress, 100 = completed. ' +
      'Completing needs a completion_note. Assignees are notified; a status change also triggers the usual push and calendar updates.',
    inputSchema: {
      id, kind,
      progress: z.number().int().min(0).max(100),
      completion_note: z.string().max(2000).optional().describe('Required when setting 100: what was delivered'),
    },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, progress, completion_note }) =>
    api.updateProgress({ id: itemId, kind: k, progress, completionNote: completion_note }));

  tool('extend_due_date', {
    title: 'Extend due date',
    description: 'Move the due date of a task or milestone you are assigned to. Marks it "Extended" and moves its Google Calendar event.',
    inputSchema: { id, kind, due_date: date },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, due_date }) => api.extendDueDate({ id: itemId, kind: k, dueDate: due_date }));

  // ─── Work partners ─────────────────────────────────────────────────────────

  tool('add_work_partner', {
    title: 'Add work partner',
    description: 'Add a teammate as a Work Partner on a task or milestone. Allowed for its creator, assignees and existing partners. The partner is notified.',
    inputSchema: { id, kind, person },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, person: p }) => api.addWorkPartner({ id: itemId, kind: k, person: p }));

  tool('remove_work_partner', {
    title: 'Remove work partner',
    description: 'Remove a Work Partner. Only the item\'s creator or an admin can.',
    inputSchema: { id, kind, person },
    annotations: REMOVE,
  }, ({ id: itemId, kind: k, person: p }) => api.removeWorkPartner({ id: itemId, kind: k, person: p }));

  // ─── Checklist ─────────────────────────────────────────────────────────────

  tool('add_checklist_item', {
    title: 'Add checklist item',
    description: 'Add a to-do to a task or milestone checklist. Any participant (assignee, creator, work partner) can.',
    inputSchema: { id, kind, text: z.string().min(1).max(500) },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, text }) => api.addTodo({ id: itemId, kind: k, text }));

  tool('set_checklist_item', {
    title: 'Tick or untick checklist item',
    description: 'Mark a checklist item done or not done. `item` is the item number from get_work_item, its id, or a unique part of its text.',
    inputSchema: { id, kind, item: z.string().min(1), done: z.boolean() },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, item, done }) => api.setTodoDone({ id: itemId, kind: k, item, done }));

  tool('delete_checklist_item', {
    title: 'Delete checklist item',
    description: 'Remove a checklist item. `item` is its number, id, or a unique part of its text.',
    inputSchema: { id, kind, item: z.string().min(1) },
    annotations: REMOVE,
  }, ({ id: itemId, kind: k, item }) => api.deleteTodo({ id: itemId, kind: k, item }));

  // ─── Updates and comments ──────────────────────────────────────────────────

  tool('post_update', {
    title: 'Post update',
    description:
      'Post a progress note ("commit") to a task or milestone\'s collaboration timeline — what you did, optionally with a Drive or document link. Any participant can.',
    inputSchema: {
      id, kind,
      message: z.string().min(1).max(2000),
      link: z.string().url().optional(),
      link_label: z.string().max(200).optional(),
    },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, message, link, link_label }) =>
    api.postUpdate({ id: itemId, kind: k, message, link, linkLabel: link_label }));

  tool('comment_on_milestone', {
    title: 'Comment on milestone',
    description: 'Add a comment to a roadmap milestone\'s Comments tab. Anyone on WorkSpace can comment.',
    inputSchema: { id: z.string().min(1).describe('Milestone id'), text: z.string().min(1).max(2000) },
    annotations: WRITE,
  }, ({ id: itemId, text }) => api.commentOnMilestone({ id: itemId, text }));

  // ─── Creating work ─────────────────────────────────────────────────────────

  tool('create_personal_task', {
    title: 'Create personal task',
    description: 'Create a self-assigned personal task on your own Dashboard. Due date defaults to tomorrow.',
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      description: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      due_date: date.optional(),
    },
    annotations: WRITE,
  }, ({ title, description, priority, due_date }) =>
    api.createPersonalTask({ title, description, priority, dueDate: due_date }));

  tool('create_milestone', {
    title: 'Create milestone (admin)',
    description:
      'Admins only. Add a roadmap milestone — a root milestone, or a child under parent_id (child milestones are how work is broken down). ' +
      'Assignees get a notification and a Google Calendar event from the server.',
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      parent_id: z.string().optional().describe('Parent milestone id; omit for a root milestone'),
      description: z.string().max(5000).optional(),
      due_date: date.optional(),
      start_date: date.optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      assignees: z.array(person).optional(),
    },
    annotations: WRITE,
  }, ({ title, parent_id, description, due_date, start_date, priority, assignees }) =>
    api.createMilestone({ title, parentId: parent_id, description, dueDate: due_date, startDate: start_date, priority, assignees }));

  tool('update_milestone', {
    title: 'Update milestone (admin)',
    description: 'Admins only. Edit a milestone\'s title, description, priority, status, dates, or add/remove assignees. Pass only what changes.',
    inputSchema: {
      id: z.string().min(1).describe('Milestone id'),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).optional(),
      due_date: date.nullable().optional().describe('YYYY-MM-DD, or null to clear'),
      start_date: date.nullable().optional(),
      add_assignees: z.array(person).optional(),
      remove_assignees: z.array(person).optional(),
    },
    annotations: WRITE,
  }, ({ id: itemId, due_date, start_date, add_assignees, remove_assignees, ...rest }) =>
    api.updateMilestone({
      id: itemId, ...rest, dueDate: due_date, startDate: start_date,
      addAssignees: add_assignees, removeAssignees: remove_assignees,
    }));
}
