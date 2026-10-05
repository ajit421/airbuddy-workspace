/**
 * workspace.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Every read and write the MCP tools perform, as the signed-in employee.
 *
 * Each write reproduces what the web app writes for the same action — same
 * fields, same collection routing, same timeline events and bell entries — so
 * a change made from Claude is indistinguishable from one made in the UI, and
 * the Cloud Functions (calendar sync, push, history, rollup) react the same
 * way. The source each one mirrors is named in its comment.
 *
 * Identity follows AuthContext: the Firebase Auth uid is mapped through
 * user_email_map to the *effective* uid, and that is the uid every query and
 * every authorUid/senderUid/updatedBy uses. Rules do the same lookup in
 * getEffectiveUid(), so using the raw auth uid would make queries return
 * nothing and writes be rejected for a mapped secondary account.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  FirestoreError, autoId, arrayRemove, arrayUnion, createWrite, increment, serverTimestamp, updateWrite,
} from './firestore.js';
import {
  COLLECTION, COMMENT_MAX_LENGTH, KIND_MILESTONE, KIND_TASK, TODO_MAX_LENGTH,
  canAddPartner, canManageTodos, canRemovePartner, canUpdateProgress, computeHierarchy,
  deriveStatus, findTodo, isAssignee, matchPerson, normalizeTodos, parseDateInput,
  presentWorkItem, sortByDueDate,
} from './workItems.js';

const CACHE_MS = 5 * 60_000;
const MAX_TREE_NODES = 200;

export class WorkspaceApi {
  /**
   * @param {import('./firestore.js').FirestoreClient} db
   * @param {import('./session.js').Session} session
   */
  constructor(db, session) {
    this.db = db;
    this.session = session;
    this._me = null;
    this._team = null;
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  /**
   * The effective user — mirrors AuthContext's user_email_map lookup.
   * @returns {Promise<{uid: string, authUid: string, email: string, name: string, avatar: string, role: string}>}
   */
  async me() {
    if (this._me && this._me.at + CACHE_MS > Date.now()) return this._me.value;

    const { uid: authUid, email } = await this.session.getAuthIdentity();
    let uid = authUid;
    try {
      const map = await this.db.get(`user_email_map/${encodeURIComponent(email)}`);
      if (map?.primaryUid) uid = map.primaryUid;
    } catch (err) {
      if (!(err instanceof FirestoreError && err.status === 'PERMISSION_DENIED')) throw err;
    }

    let profile;
    try {
      profile = await this.db.get(`users/${uid}`);
    } catch (err) {
      if (err instanceof FirestoreError && err.status === 'PERMISSION_DENIED') {
        throw new Error(`${email} is not allowed into AirBuddy WorkSpace (not @airbuddy.in and not approved in allowed_emails).`);
      }
      throw err;
    }
    if (!profile) {
      throw new Error(`No WorkSpace profile for ${email} yet — sign in to the web app once to create it.`);
    }

    const value = {
      uid,
      authUid,
      email,
      name: profile.name || email || 'Team Member',
      avatar: profile.avatar || '',
      role: profile.role || 'employee',
    };
    this._me = { value, at: Date.now() };
    return value;
  }

  /** Everyone in `users` — readable by any allowed account (Team Members page). */
  async team() {
    if (this._team && this._team.at + CACHE_MS > Date.now()) return this._team.value;
    const docs = await this.db.query({ collection: 'users' });
    const value = docs
      .map((d) => ({
        uid: d.uid || d.id,
        name: d.name || d.email || d.id,
        email: d.email || '',
        role: d.role || 'employee',
        designation: d.designation || '',
        department: d.department || '',
        avatar: d.avatar || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    this._team = { value, at: Date.now() };
    return value;
  }

  async nameOf() {
    const byUid = new Map((await this.team()).map((p) => [p.uid, p.name]));
    return (uid) => byUid.get(uid) ?? uid ?? 'unknown';
  }

  async person(query) {
    return matchPerson(await this.team(), query);
  }

  async requireAdmin(action) {
    const me = await this.me();
    if (me.role !== 'admin') throw new Error(`Only admins can ${action}.`);
    return me;
  }

  // ─── Lookups ───────────────────────────────────────────────────────────────

  /**
   * Find a work item by id. roadmapNodes is tried first because every allowed
   * user can read it, so "not found" there is a real NOT_FOUND; a missing
   * `tasks/{id}` comes back PERMISSION_DENIED for a non-admin instead.
   *
   * @param {string} id
   * @param {'task'|'milestone'} [kind]
   * @returns {Promise<{doc: object, kind: 'task'|'milestone'}>}
   */
  async resolve(id, kind) {
    if (kind !== KIND_TASK) {
      const node = await this.db.get(`roadmapNodes/${id}`);
      if (node && node.isArchived !== true) return { doc: node, kind: KIND_MILESTONE };
      if (kind === KIND_MILESTONE) throw new Error(`No active roadmap milestone with id ${id}.`);
    }
    try {
      const task = await this.db.get(`tasks/${id}`);
      if (task) return { doc: task, kind: KIND_TASK };
    } catch (err) {
      if (!(err instanceof FirestoreError && err.status === 'PERMISSION_DENIED')) throw err;
    }
    throw new Error(`No task or milestone with id ${id} that you can see. Use list_my_work or search_roadmap to find ids.`);
  }

  #path(kind, id) {
    return `${COLLECTION[kind]}/${id}`;
  }

  // ─── Reads ─────────────────────────────────────────────────────────────────

  /**
   * The Dashboard's `myWorkItems`: tasks assigned to or partnered by the
   * person, plus milestones assigned to them (subscribeToAssignedNodes) and
   * milestones they partner on.
   */
  async listWork({ assignee, includeCompleted = false } = {}) {
    const me = await this.me();
    let uid = me.uid;
    if (assignee) {
      const p = await this.person(assignee);
      if (p.uid !== me.uid && me.role !== 'admin') {
        throw new Error("Only admins can list somebody else's work.");
      }
      uid = p.uid;
    }

    const [assigned, partnered, nodes, partnerNodes] = await Promise.all([
      this.db.query({ collection: 'tasks', where: [['assignedTo', 'array-contains', uid]] }),
      this.db.query({ collection: 'tasks', where: [['workPartnerUids', 'array-contains', uid]] }),
      this.db.query({ collection: 'roadmapNodes', where: [['assignedTo', 'array-contains', uid]] }),
      this.db.query({ collection: 'roadmapNodes', where: [['workPartnerUids', 'array-contains', uid]] }),
    ]);

    const seen = new Map();
    for (const d of [...assigned, ...partnered]) seen.set(`task:${d.id}`, { d, kind: KIND_TASK });
    for (const d of [...nodes, ...partnerNodes]) {
      if (d.isArchived === true) continue;
      seen.set(`milestone:${d.id}`, { d, kind: KIND_MILESTONE });
    }

    const nameOf = await this.nameOf();
    const items = sortByDueDate([...seen.values()].map(({ d, kind }) => ({ ...d, _kind: kind })))
      .filter((d) => includeCompleted || d.status !== 'completed')
      .map((d) => presentWorkItem(d, d._kind, nameOf, uid));
    return { person: nameOf(uid), count: items.length, items };
  }

  /** Full detail of one task or milestone, including checklist and recent activity. */
  async getItem(id, kind) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    const nameOf = await this.nameOf();
    const out = presentWorkItem(doc, k, nameOf, me.uid, { detail: true });

    const recent = (collection, limit) =>
      this.db
        .query({ parent: this.#path(k, id), collection, orderBy: [['createdAt', 'desc']], limit })
        .catch(() => null); // not a participant → no read access to events; leave it out

    const [events, comments, children, ancestors] = await Promise.all([
      recent('events', 10),
      k === KIND_MILESTONE ? recent('comments', 5) : null,
      k === KIND_MILESTONE
        ? this.db.query({ collection: 'roadmapNodes', where: [['parentId', '==', id], ['isArchived', '==', false]] })
        : null,
      k === KIND_MILESTONE
        ? Promise.all((doc.ancestorIds ?? []).slice(-10).map((a) => this.db.get(`roadmapNodes/${a}`).catch(() => null)))
        : null,
    ]);

    if (events) {
      out.recentActivity = events.map((e) => ({
        type: e.type, by: e.authorName, message: e.message, at: e.createdAt?.toISOString?.() ?? null,
      }));
    }
    if (k === KIND_MILESTONE) {
      out.breadcrumb = (ancestors ?? []).filter(Boolean).map((a) => a.title);
      out.children = sortByDueDate(children ?? []).map((c) => presentWorkItem(c, KIND_MILESTONE, nameOf));
      if (comments) {
        out.recentComments = comments.map((c) => ({
          by: c.authorName, text: c.text, at: c.createdAt?.toISOString?.() ?? null,
        }));
      }
    }
    return out;
  }

  /** Walk the roadmap tree from a parent (null = root milestones). */
  async browseRoadmap({ parentId = null, depth = 1 } = {}) {
    const nameOf = await this.nameOf();
    let budget = MAX_TREE_NODES;
    const walk = async (pid, level) => {
      const kids = sortByDueDate(await this.db.query({
        collection: 'roadmapNodes',
        where: [['parentId', '==', pid], ['isArchived', '==', false]],
      }));
      const out = [];
      for (const k of kids) {
        if (budget-- <= 0) break;
        const item = presentWorkItem(k, KIND_MILESTONE, nameOf);
        if (level < depth && (k.childCount ?? 0) > 0) item.children = await walk(k.id, level + 1);
        out.push(item);
      }
      return out;
    };
    const parent = parentId ? (await this.resolve(parentId, KIND_MILESTONE)).doc : null;
    return {
      parent: parent ? { id: parent.id, title: parent.title } : 'roadmap root',
      nodes: await walk(parentId, 1),
      ...(budget <= 0 ? { truncated: `Stopped at ${MAX_TREE_NODES} nodes — browse a narrower branch.` } : {}),
    };
  }

  /** Title/description search over every active milestone. */
  async searchRoadmap(text, limit = 25) {
    const all = await this.db.query({ collection: 'roadmapNodes', where: [['isArchived', '==', false]] });
    const byId = new Map(all.map((n) => [n.id, n]));
    const needle = text.toLowerCase();
    const nameOf = await this.nameOf();
    const hits = sortByDueDate(all.filter((n) =>
      (n.title ?? '').toLowerCase().includes(needle) ||
      (n.description ?? '').toLowerCase().includes(needle)));
    return {
      count: hits.length,
      results: hits.slice(0, limit).map((n) => ({
        ...presentWorkItem(n, KIND_MILESTONE, nameOf),
        breadcrumb: (n.ancestorIds ?? []).map((a) => byId.get(a)?.title).filter(Boolean),
      })),
    };
  }

  // ─── Side effects shared by writes ─────────────────────────────────────────

  /**
   * Timeline event — collaborationService.addTimelineEvent. Best-effort, as in
   * TaskDetailModal: a failed event must not fail the change it describes.
   */
  async #event(kind, id, data) {
    const me = await this.me();
    try {
      await this.db.commit([createWrite(
        this.db.docName(`${this.#path(kind, id)}/events/${autoId()}`),
        { authorUid: me.uid, authorName: me.name, authorAvatar: me.avatar, metadata: {}, ...data },
        [serverTimestamp('createdAt')],
      )]);
    } catch (err) {
      console.error('[workspace] timeline event failed:', err.message);
    }
  }

  /**
   * Bell entries — notificationService.notifyUsers: skips the sender, and
   * senderUid must equal the effective uid (CR-6) or the rule rejects it.
   */
  async #notify(uids, title, message, type) {
    const me = await this.me();
    const recipients = [...new Set(uids)].filter((u) => u && u !== me.uid);
    if (!recipients.length) return;
    const writes = recipients.map((u) => createWrite(
      this.db.docName(`notifications/${u}/items/${autoId()}`),
      { title: title.slice(0, 200), message: message.slice(0, 500), type, read: false, senderUid: me.uid },
      [serverTimestamp('createdAt')],
    ));
    try {
      await this.db.commit(writes);
    } catch (err) {
      console.error('[workspace] notification failed:', err.message);
    }
  }

  /**
   * Read-modify-write with an updateTime precondition, retried on conflict —
   * the REST equivalent of todoService's runTransaction, so two people ticking
   * items a second apart cannot revert each other.
   */
  async #mutate(kind, id, build) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const doc = await this.db.get(this.#path(kind, id));
      if (!doc) throw new Error(`${this.#path(kind, id)} no longer exists.`);
      const { fields, result } = build(doc);
      try {
        await this.db.commit([updateWrite(this.db.docName(this.#path(kind, id)), fields, {
          transforms: [serverTimestamp('updatedAt')],
          updateTime: doc._updateTime,
        })]);
        return { doc, result };
      } catch (err) {
        if (err instanceof FirestoreError && err.status === 'FAILED_PRECONDITION' && attempt < 3) continue;
        throw err;
      }
    }
    throw new Error('Too many concurrent edits — try again.');
  }

  async #present(kind, id) {
    const me = await this.me();
    const doc = await this.db.get(this.#path(kind, id));
    return presentWorkItem(doc, kind, await this.nameOf(), me.uid, { detail: true });
  }

  // ─── Progress, status, due date ────────────────────────────────────────────

  /**
   * Mirrors TaskDetailModal.doSaveProgress: status derived from progress,
   * optional completion note, then timeline events and — only when the status
   * did not change — a "progress updated" bell entry (a status change is
   * announced server-side by onTaskUpdate, and doing both duplicated it).
   *
   * `updatedBy` is written for milestones only. updateNodeAsAssignee always
   * writes it on a node, but nothing in the web app writes it on a task — and
   * onTaskUpdate skips notifying `updatedBy`, so a stale value left by this
   * package would silence that person's notifications for every later edit
   * made in the UI.
   */
  async updateProgress({ id, kind, progress, completionNote }) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    if (!canUpdateProgress(doc, me)) {
      throw new Error(`You can't update progress on "${doc.title}" — only its assignees${k === KIND_TASK ? ', creator' : ''} or an admin can. Work partners can tick checklist items and post updates instead.`);
    }

    const prevProgress = doc.progress ?? 0;
    const prevStatus = doc.status ?? 'pending';
    const status = deriveStatus(progress);
    if (status === 'completed' && prevStatus !== 'completed' && !completionNote?.trim()) {
      throw new Error('Marking this complete needs a completion_note saying what was delivered — the web app asks for the same thing.');
    }

    const fields = { progress, status };
    if (completionNote?.trim()) {
      fields.completionNote = { message: completionNote.trim(), completedAt: new Date(), completedBy: me.name || me.email };
    }
    if (k === KIND_MILESTONE) fields.updatedBy = me.uid;

    await this.db.commit([updateWrite(this.db.docName(this.#path(k, id)), fields, {
      transforms: [serverTimestamp('updatedAt')],
    })]);

    // Phase 23: a roadmap mirror task syncs back to its source subcollection.
    if (k === KIND_TASK && doc._mirrorOf === 'roadmap' && doc.roadmapNodeId) {
      const sync = { status, progress, updatedBy: me.uid };
      if (fields.completionNote) sync.completionNote = fields.completionNote;
      await this.db.commit([updateWrite(
        this.db.docName(`roadmapNodes/${doc.roadmapNodeId}/tasks/${id}`), sync,
        { transforms: [serverTimestamp('updatedAt')] },
      )]).catch((err) => console.error('[workspace] roadmap mirror sync failed (non-fatal):', err.message));
    }

    if (Math.abs(progress - prevProgress) >= 10) {
      await this.#event(k, id, {
        type: 'progress_updated',
        message: `Progress updated from ${prevProgress}% to ${progress}%.`,
        metadata: { fromProgress: prevProgress, toProgress: progress },
      });
    }
    if (status !== prevStatus) {
      await this.#event(k, id, {
        type: 'status_changed',
        message: `Status changed from "${prevStatus}" to "${status}".`,
        metadata: { fromStatus: prevStatus, toStatus: status },
      });
    } else {
      await this.#notify(doc.assignedTo ?? [], 'Task Progress Updated', `"${doc.title}" is now at ${progress}%.`, 'task_updated');
    }
    return this.#present(k, id);
  }

  /** TaskDetailModal.handleExtendDueDate. */
  async extendDueDate({ id, kind, dueDate }) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    if (!canUpdateProgress(doc, me)) {
      throw new Error(`You can't change the due date of "${doc.title}" — only its assignees or an admin can.`);
    }
    const fields = { dueDate: parseDateInput(dueDate), isExtended: true };
    if (k === KIND_MILESTONE) fields.updatedBy = me.uid;
    await this.db.commit([updateWrite(this.db.docName(this.#path(k, id)), fields, {
      transforms: [serverTimestamp('updatedAt')],
    })]);
    return this.#present(k, id);
  }

  // ─── Work partners ─────────────────────────────────────────────────────────

  /**
   * collaborationService.addWorkPartner: both arrays in one write, then a
   * `partner_added` timeline event. Also rings the new partner's bell — the
   * web UI does not, but `partner_added` is already a bell type with an icon,
   * and the team's standing rule is that nothing happens silently.
   */
  async addWorkPartner({ id, kind, person }) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    if (!canAddPartner(doc, me)) {
      throw new Error(`You can't add partners to "${doc.title}" — only its creator, assignees, existing partners or an admin can.`);
    }
    const p = await this.person(person);
    if ((doc.workPartnerUids ?? []).includes(p.uid)) return { alreadyPartner: true, item: await this.#present(k, id) };
    if (isAssignee(doc, p.uid)) throw new Error(`${p.name} is already an assignee of "${doc.title}".`);

    const partner = {
      uid: p.uid, name: p.name, avatar: p.avatar || '',
      addedBy: me.uid, addedByName: me.name, addedAt: new Date().toISOString(),
    };
    await this.db.commit([updateWrite(this.db.docName(this.#path(k, id)), {}, {
      transforms: [
        arrayUnion('workPartners', partner),
        arrayUnion('workPartnerUids', p.uid),
        serverTimestamp('updatedAt'),
      ],
    })]);
    await this.#event(k, id, {
      type: 'partner_added',
      message: `${me.name} added ${p.name} as a Work Partner.`,
      metadata: { targetUid: p.uid, targetName: p.name },
    });
    await this.#notify([p.uid], 'Added as Work Partner', `${me.name} added you as a Work Partner on "${doc.title}".`, 'partner_added');
    return this.#present(k, id);
  }

  /** collaborationService.removeWorkPartner: rewrite both arrays from the filtered rich array. */
  async removeWorkPartner({ id, kind, person }) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    if (!canRemovePartner(doc, me)) {
      throw new Error(`Only the creator of "${doc.title}" or an admin can remove work partners.`);
    }
    const partners = Array.isArray(doc.workPartners) ? doc.workPartners : [];
    const p = matchPerson(partners.map((x) => ({ uid: x.uid, name: x.name })), person);
    await this.#mutate(k, id, (fresh) => {
      const kept = (fresh.workPartners ?? []).filter((x) => x?.uid !== p.uid);
      return { fields: { workPartners: kept, workPartnerUids: kept.map((x) => x.uid) } };
    });
    return this.#present(k, id);
  }

  // ─── Checklist ─────────────────────────────────────────────────────────────

  async #requireTodoAccess(id, kind) {
    const me = await this.me();
    const { doc, kind: k } = await this.resolve(id, kind);
    if (!canManageTodos(doc, me)) {
      throw new Error(`You can't edit the checklist of "${doc.title}" — only its participants can.`);
    }
    return { me, doc, k };
  }

  /** todoService.addTodo — arrayUnion, so concurrent adds both survive. */
  async addTodo({ id, kind, text }) {
    const { me, k } = await this.#requireTodoAccess(id, kind);
    const clean = text.trim();
    if (!clean || clean.length > TODO_MAX_LENGTH) throw new Error(`Checklist items must be 1–${TODO_MAX_LENGTH} characters.`);
    const item = {
      id: globalThis.crypto.randomUUID(), text: clean, done: false,
      createdAt: new Date().toISOString(), createdBy: me.uid, createdByName: me.name,
      completedAt: null, completedBy: null, completedByName: null,
    };
    await this.db.commit([updateWrite(this.db.docName(this.#path(k, id)), {}, {
      transforms: [arrayUnion('todos', item), serverTimestamp('updatedAt')],
    })]);
    return this.#present(k, id);
  }

  /** todoService.toggleTodo, but setting an explicit state (idempotent for an agent). */
  async setTodoDone({ id, kind, item, done }) {
    const { me, k } = await this.#requireTodoAccess(id, kind);
    await this.#mutate(k, id, (fresh) => {
      const todos = normalizeTodos(fresh.todos);
      const target = findTodo(todos, item);
      return {
        fields: {
          todos: todos.map((t) => (t.id !== target.id ? t : {
            ...t,
            done,
            completedAt: done ? new Date().toISOString() : null,
            completedBy: done ? me.uid : null,
            completedByName: done ? me.name : null,
          })),
        },
      };
    });
    return this.#present(k, id);
  }

  /** todoService.deleteTodo. */
  async deleteTodo({ id, kind, item }) {
    const { k } = await this.#requireTodoAccess(id, kind);
    await this.#mutate(k, id, (fresh) => {
      const todos = normalizeTodos(fresh.todos);
      const target = findTodo(todos, item);
      return { fields: { todos: todos.filter((t) => t.id !== target.id) } };
    });
    return this.#present(k, id);
  }

  // ─── Updates and comments ──────────────────────────────────────────────────

  /** collaborationService.postCommit — a "commit" on the collaboration timeline. */
  async postUpdate({ id, kind, message, link, linkLabel }) {
    const { k } = await this.#requireTodoAccess(id, kind);
    const text = message.trim();
    if (!text) throw new Error('The update message cannot be empty.');
    await this.#event(k, id, {
      type: 'commit',
      message: text,
      metadata: { driveLink: link || null, driveLinkLabel: linkLabel || null },
    });
    return { posted: true, on: id };
  }

  /** roadmapCommentService.postComment — open to every allowed user. */
  async commentOnMilestone({ id, text }) {
    const me = await this.me();
    const { doc } = await this.resolve(id, KIND_MILESTONE);
    const clean = text.trim();
    if (!clean || clean.length > COMMENT_MAX_LENGTH) throw new Error(`Comments must be 1–${COMMENT_MAX_LENGTH} characters.`);
    await this.db.commit([createWrite(
      this.db.docName(`roadmapNodes/${doc.id}/comments/${autoId()}`),
      { text: clean, authorUid: me.uid, authorName: me.name, authorAvatar: me.avatar },
      [serverTimestamp('createdAt')],
    )]);
    return { posted: true, on: doc.title };
  }

  // ─── Creating work ─────────────────────────────────────────────────────────

  /** taskService.createPersonalTask. */
  async createPersonalTask({ title, description = '', priority = 'medium', dueDate }) {
    const me = await this.me();
    const id = autoId();
    await this.db.commit([createWrite(this.db.docName(`tasks/${id}`), {
      title: title.trim(),
      description,
      priority,
      status: 'pending',
      progress: 0,
      assignedTo: [me.uid],
      assignedBy: me.uid,
      createdBy: me.uid,
      isAdminTask: false,
      startDate: new Date(),
      dueDate: dueDate ? parseDateInput(dueDate) : new Date(Date.now() + 86_400_000),
    }, [serverTimestamp('createdAt'), serverTimestamp('updatedAt')])]);
    return this.#present(KIND_TASK, id);
  }

  /**
   * roadmapService.createNode, with the parent's childCount increment in the
   * same atomic commit rather than a second write.
   */
  async createMilestone({ title, description = '', parentId, dueDate, startDate, priority = 'medium', assignees = [] }) {
    const me = await this.requireAdmin('create roadmap milestones');
    const parent = parentId ? (await this.resolve(parentId, KIND_MILESTONE)).doc : null;
    const assignedTo = await Promise.all(assignees.map(async (a) => (await this.person(a)).uid));
    const id = autoId();
    const h = computeHierarchy(id, parent);

    const writes = [createWrite(this.db.docName(`roadmapNodes/${id}`), {
      title: title.trim(),
      description,
      status: 'pending',
      priority,
      startDate: startDate ? parseDateInput(startDate) : null,
      dueDate: dueDate ? parseDateInput(dueDate) : null,
      assignedTo,
      order: 0,
      dependencies: [],
      tags: [],
      isArchived: false,
      progress: 0,
      childCount: 0,
      childCompletedCount: 0,
      createdBy: me.uid,
      updatedBy: me.uid,
      ...h,
    }, [serverTimestamp('createdAt'), serverTimestamp('updatedAt')])];
    if (parent) {
      writes.push(updateWrite(this.db.docName(`roadmapNodes/${parent.id}`), {}, {
        transforms: [increment('childCount', 1), serverTimestamp('updatedAt')],
      }));
    }
    await this.db.commit(writes);
    return this.#present(KIND_MILESTONE, id);
  }

  /**
   * roadmapService.updateNode (admin). Assignee changes use arrayUnion /
   * arrayRemove so they cannot clobber a concurrent edit; onRoadmapNodeCalendar
   * then notifies and calendars the newly added people server-side.
   */
  async updateMilestone({ id, title, description, priority, status, dueDate, startDate, addAssignees = [], removeAssignees = [] }) {
    const me = await this.requireAdmin('edit roadmap milestones');
    const { doc } = await this.resolve(id, KIND_MILESTONE);
    const fields = { updatedBy: me.uid };
    if (title !== undefined) fields.title = title.trim();
    if (description !== undefined) fields.description = description;
    if (priority !== undefined) fields.priority = priority;
    if (status !== undefined) fields.status = status;
    if (dueDate !== undefined) fields.dueDate = dueDate ? parseDateInput(dueDate) : null;
    if (startDate !== undefined) fields.startDate = startDate ? parseDateInput(startDate) : null;

    const add = await Promise.all(addAssignees.map(async (a) => (await this.person(a)).uid));
    const remove = await Promise.all(removeAssignees.map(async (a) => (await this.person(a)).uid));
    if (remove.some((u) => add.includes(u))) {
      throw new Error('The same person is in both add_assignees and remove_assignees.');
    }
    const transforms = [serverTimestamp('updatedAt')];
    if (add.length) transforms.push(arrayUnion('assignedTo', ...add));
    if (remove.length) transforms.push(arrayRemove('assignedTo', ...remove));

    await this.db.commit([updateWrite(this.db.docName(`roadmapNodes/${doc.id}`), fields, { transforms })]);
    return this.#present(KIND_MILESTONE, doc.id);
  }
}
