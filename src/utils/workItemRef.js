/**
 * workItemRef.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Resolves which Firestore collection a "work item" lives in.
 *
 *   The Dashboard shows two kinds of work side by side and treats them
 *   identically: ordinary tasks (`tasks/{id}`) and roadmap milestones
 *   (`roadmapNodes/{id}`, projected into task shape by `nodeToWorkItem` in
 *   roadmapService and tagged `_source: 'roadmapNode'`). Every shared service
 *   that used to hardcode the `tasks` collection — todos, work partners, the
 *   collaboration timeline — goes through this instead, so one detail modal can
 *   drive both without a branch at every call site.
 *
 * USAGE:
 *   Pass the whole work item, not just its id:
 *     doc(db, workItemCollection(task), workItemId(task))
 *   A bare id string is still accepted and resolves to `tasks`, which keeps
 *   every pre-existing caller working unchanged.
 *
 * NOTE:
 *   The collection names here have matching rules blocks in firestore.rules —
 *   `roadmapNodes` gained a participant carve-out for `todos`/`workPartners`
 *   and an `events` subcollection precisely so these services work on a node.
 *   Adding a third work-item kind means adding its rules too, not just a case
 *   in this file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `_source` marker set by nodeToWorkItem() on a projected roadmap milestone. */
export const ROADMAP_NODE_SOURCE = 'roadmapNode';

const TASKS_COL          = 'tasks';
const ROADMAP_NODES_COL  = 'roadmapNodes';

/**
 * Collection a work item's document lives in.
 *
 * @param {object|string|null} ref - Work item object, or a bare task id
 * @returns {'tasks'|'roadmapNodes'}
 */
export function workItemCollection(ref) {
  return ref && typeof ref === 'object' && ref._source === ROADMAP_NODE_SOURCE
    ? ROADMAP_NODES_COL
    : TASKS_COL;
}

/**
 * Document id of a work item.
 *
 * @param {object|string|null} ref - Work item object, or a bare task id
 * @returns {string|undefined}
 */
export function workItemId(ref) {
  return ref && typeof ref === 'object' ? ref.id : ref;
}

/**
 * True when the work item is a roadmap milestone rather than an ordinary task.
 *
 * @param {object|string|null} ref
 * @returns {boolean}
 */
export function isRoadmapNodeItem(ref) {
  return workItemCollection(ref) === ROADMAP_NODES_COL;
}
