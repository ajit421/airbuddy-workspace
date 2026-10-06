/**
 * tools.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The MCP tool surface. Each tool is a thin Zod-validated wrapper over a
 * WorkspaceApi method — Zod here is the write boundary, the same role
 * `Schema.parse(form)` plays in src/services/.
 *
 * Read and write only, for everybody, admins included. There is no tool that
 * deletes, archives or removes anything: not tasks, milestones, checklist
 * items, work partners, assignees or comments. FirestoreClient.commit()
 * enforces the same thing underneath (assertNoRemoval), so a future tool
 * cannot quietly add one. Removing things is done in the web app.
 *
 * Who can use what:
 *   everyone       reads, own-work updates, comments, personal tasks
 *   roadmap.edit   create_milestone, update_milestone (admins hold every key)
 *   tasks.assign   assign_task
 *   tasks.viewAll  list_my_work for somebody else
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import { FirestoreError, RemovalNotAllowedError } from './firestore.js';
import { MODULE_OPTIONS } from './workItems.js';
import { NotSignedInError } from './session.js';

/** Sent to Claude on connect, by both the local server (cli.js) and the hosted one (api/mcp.js). */
export const SERVER_INSTRUCTIONS = `Tools for AirBuddy Aerospace WorkSpace — the team's tasks, company roadmap milestones, work partners and checklists.
You act as the signed-in employee and can do what their role and admin-granted permissions allow in the web app; the database's security rules enforce it.
Call whoami first to see the role and permissions: roadmap.edit unlocks create_milestone/update_milestone, tasks.assign unlocks assign_task, tasks.viewAll lets list_my_work show somebody else's work. Admins hold all of them.
This connector is read and write only: nothing can be deleted, archived or removed (tasks, milestones, checklist items, partners, assignees). If the user asks for that, tell them to do it in the web app.
Start with list_my_work (or search_roadmap / browse_roadmap) to find ids, and get_work_item before changing something.
Progress drives status: 0 pending, 1-99 in-progress, 100 completed (needs a completion_note).
Dates are YYYY-MM-DD in India time. Confirm with the user before completing work, assigning tasks to other people or creating milestones.`;

const id = z.string().min(1).describe('Task or milestone id (from list_my_work, search_roadmap or browse_roadmap)');
const kind = z.enum(['task', 'milestone']).optional()
  .describe('Optional. Skip it unless an id is ambiguous; the server finds the right collection.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const person = z.string().min(1).describe('Name, email or uid of a team member');

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/** Turn a thrown error into a tool result Claude can act on. */
function toErrorText(err) {
  if (err instanceof NotSignedInError || err instanceof RemovalNotAllowedError) return err.message;
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
    description:
      'The WorkSpace account this Claude is acting as: name, email, role (admin or employee), the permissions an admin has granted, ' +
      'and what that lets you do here. Check it before trying something that needs a permission.',
    annotations: READ,
  }, () => api.capabilities());

  tool('list_my_work', {
    title: 'List my work',
    description:
      'Your open work items — the same list as your WorkSpace Dashboard: tasks assigned to you or where you are a work partner, ' +
      'plus roadmap milestones assigned to you or partnered by you. Sorted by due date. ' +
      'With the tasks.viewAll permission (admins have it) you may pass `assignee` to see somebody else\'s.',
    inputSchema: {
      include_completed: z.boolean().optional().describe('Also include completed items (default false)'),
      assignee: person.optional().describe('Needs tasks.viewAll: whose work to list'),
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
      'Set progress (0–100) on a task or milestone you are assigned to (or any milestone, with roadmap.edit). Status follows progress the way the web app does it: 0 = pending, 1–99 = in-progress, 100 = completed. ' +
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

  // ─── Checklist ─────────────────────────────────────────────────────────────

  tool('add_checklist_item', {
    title: 'Add checklist item',
    description: 'Add a to-do to a task or milestone checklist. Any participant (assignee, creator, work partner) can.',
    inputSchema: { id, kind, text: z.string().min(1).max(500) },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, text }) => api.addTodo({ id: itemId, kind: k, text }));

  tool('set_checklist_item', {
    title: 'Tick or untick checklist item',
    description: 'Mark a checklist item done or not done. `item` is the item number from get_work_item, its id, or a unique part of its text. Items cannot be deleted from here.',
    inputSchema: { id, kind, item: z.string().min(1), done: z.boolean() },
    annotations: WRITE,
  }, ({ id: itemId, kind: k, item, done }) => api.setTodoDone({ id: itemId, kind: k, item, done }));

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

  tool('assign_task', {
    title: 'Assign task (tasks.assign)',
    description:
      'Needs the tasks.assign permission (admins have it). Assign a task to one or more teammates, the same as Admin Panel > Assign Task. ' +
      'Assignees get a notification, a push and a Google Calendar event from the server. Due date defaults to today.',
    inputSchema: {
      title: z.string().trim().min(1).max(200),
      assignees: z.array(person).min(1),
      description: z.string().max(5000).optional(),
      module: z.enum(MODULE_OPTIONS).optional().describe('Default "Other"'),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      start_date: date.optional(),
      due_date: date.optional(),
    },
    annotations: WRITE,
  }, ({ title, assignees, description, module, priority, start_date, due_date }) =>
    api.assignTask({ title, assignees, description, module, priority, startDate: start_date, dueDate: due_date }));

  tool('create_milestone', {
    title: 'Create milestone (roadmap.edit)',
    description:
      'Needs the roadmap.edit permission (admins have it). Add a roadmap milestone — a root milestone, or a child under parent_id (child milestones are how work is broken down). ' +
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
    title: 'Update milestone (roadmap.edit)',
    description:
      'Needs the roadmap.edit permission (admins have it). Edit a milestone\'s title, description, priority, status or dates, or add assignees. ' +
      'Pass only what changes. Removing an assignee or clearing a date is not possible here; do it in the web app.',
    inputSchema: {
      id: z.string().min(1).describe('Milestone id'),
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).optional(),
      due_date: date.optional(),
      start_date: date.optional(),
      add_assignees: z.array(person).optional(),
    },
    annotations: WRITE,
  }, ({ id: itemId, due_date, start_date, add_assignees, ...rest }) =>
    api.updateMilestone({
      id: itemId, ...rest, dueDate: due_date, startDate: start_date, addAssignees: add_assignees,
    }));
}
