import { useRoadmapNode } from '../../hooks/useRoadmapNode';
import { nodeToWorkItem } from '../../services/roadmapService';
import TaskDetailModal   from '../Calendar/TaskDetailModal';

/**
 * RoadmapNodeTaskModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE:
 *   Opens a roadmap child node in the ordinary Task Details modal — the exact
 *   component the Dashboard, the Calendar and the Work Partner drawer use — so
 *   a sub-milestone is worked on the same way a task is, with the same todo
 *   list, work partners, progress slider, Extend control and timeline.
 *
 *   Root milestones keep the roadmap side panel (RoadmapNodeDetail): a root is
 *   a container with a breadcrumb, comments, attachments, history and an
 *   "Add Child" action, none of which a task has. Children below it are the
 *   actual units of work, which is why they get the work-item panel instead.
 *
 * WHY A WRAPPER AND NOT A DIRECT RENDER:
 *   TaskDetailModal takes a task-shaped object, so the node has to go through
 *   nodeToWorkItem() first — that is what tags it `_source: 'roadmapNode'` and
 *   makes every shared service (todos, work partners, the timeline) resolve
 *   `roadmapNodes/{id}` instead of `tasks/{id}` via src/utils/workItemRef.js.
 *   The subscription also lives here rather than in CompanyRoadmap so a node
 *   snapshot re-renders one modal instead of the whole tree.
 *
 * PROPS:
 *   node    {object}   The node snapshot the tree already had at click time.
 *                      It seeds the first render so the modal never flashes
 *                      empty while the single-document listener attaches; the
 *                      live document takes over as soon as it arrives, which is
 *                      what makes a progress save visible without reopening.
 *   onClose {function}
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function RoadmapNodeTaskModal({ node, onClose }) {
  const { node: liveNode } = useRoadmapNode(node?.id);

  if (!node) return null;

  return <TaskDetailModal task={nodeToWorkItem(liveNode ?? node)} onClose={onClose} />;
}
