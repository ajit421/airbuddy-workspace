# Company Roadmap

The Company Roadmap is a hierarchical project-planning module that lets admins structure work into a tree of **Roadmap Nodes** (nested phases, milestones and deliverables), each with its own tasks, comments, file attachments, and an immutable audit history. Employees can view the tree and update the progress of tasks assigned to them; all structural changes are admin-only.

---

## Feature Overview

| Capability | Admin | Employee |
|---|---|---|
| View the full roadmap tree | Yes | Yes |
| Create / edit / archive / delete nodes | Yes | No |
| Assign tasks to employees | Yes | No |
| Update task status & progress | Yes | Yes (own tasks only) |
| Post & delete own comments | Yes | Yes |
| Delete any comment | Yes | No |
| Upload file attachments | Yes | Yes |
| Delete attachments | Yes | Yes (own uploads only) |
| View audit history | Yes | Yes (read-only) |
| View the Gantt chart | Yes | Yes |
| Export the roadmap (Excel, CSV, Google Sheets) | Yes | Yes |
| Write to audit history | No (Cloud Function only) | No |

---

## Component Tree

```
CompanyRoadmap (src/components/Roadmap/CompanyRoadmap.jsx)
├── RoadmapKpiStrip           — real-time KPI metrics row
├── RoadmapTree               — recursive node tree with virtualization shim
│   └── RoadmapNodeCard       — individual node card (React.memo)
│       └── [expand] RoadmapTree (children, recursive)
├── RoadmapNodeDetail         — slide-in detail panel / bottom-sheet modal
│   ├── Overview tab          — node metadata, assigned users, dates
│   ├── Comments tab          — RoadmapCommentsTab
│   ├── Attachments tab       — RoadmapAttachmentsTab
│   └── History tab           — RoadmapHistoryLog (paginated)
├── RoadmapNodeTaskModal      — child node → the ordinary Task Details modal
└── RoadmapGanttView          (Gantt view, lazy-loaded)
    └── GanttExportMenu       (Excel, CSV, Google Sheets)
```

### Which panel a click opens

Clicking a node's **title** does two things at once: it opens that node's detail
*and* expands its children, so you never have to click the chevron separately
just to see what is underneath. It only ever expands; to collapse a branch, use
the chevron, which stays a pure expand/collapse toggle.

Clicking a **root milestone** opens the slide-in detail panel on the right. A
root is a container: the panel is where its breadcrumb, comments, attachments,
audit history and **Add Child** live.

Clicking a **child node** opens **Task Details** instead: the very same modal
the Dashboard, Calendar and Work Partner drawer use for a task, with the same
progress slider, checklist, work partners, Extend control and activity feed. A
child node is the unit of work, so it is worked on exactly the way a task is.

The panel is still available for a child: the **Company Roadmap** link at the
top of the modal opens it, which is how a child's comments, attachments, history
and Add Child stay reachable. Deep links (`/roadmap/:nodeId`) always open the
panel, whatever the node's depth.

### Gantt view

The view switch at the top right has three options: **List**, **Journey** and
**Gantt**. The Gantt shows the whole roadmap on one timeline, every milestone
and every child, so you can see what is happening in which week and what
overlaps. The choice is remembered in your browser.

- **Rows.** Each row is one milestone, in the same order as the List view, with
  an outline number (1, 1.1, 1.2, 2 ...), the people assigned, and its progress.
  Click the arrow next to a parent row to fold its children away.
- **Bars.** A bar runs from the start date to the due date. The coloured part is
  the progress. The colours match the List view: yellow for pending, blue for in
  progress, green for completed, red for blocked. A red outline means the
  milestone is overdue.
- **Diamonds.** A milestone with only a due date (or only a start date) is drawn
  as a diamond on that day.
- **Dashed bars.** A parent milestone with no dates of its own (the three root
  milestones today) gets a thin dashed bar from the earliest start to the latest
  due date of the milestones under it. It is a summary, not a planned date. Give
  the parent its own dates and it becomes a normal bar.
- **Today.** The orange line marks today, and the chart opens scrolled to it.
- **Zoom.** Week shows single days, Month and Quarter show whole weeks.
- **Clicking** a bar or a title works exactly like the List view: a root
  milestone opens the side panel, a child opens Task Details.
- **Filters.** Search, status and priority apply to every row. A parent stays
  visible when one of its children matches, so searching for "PCB" still shows
  which product each PCB step belongs to.
- Hover a bar (or focus it with Tab) to see its dates, status, progress, the
  people assigned, and how many days it is overdue.

### Exporting the roadmap

In the Gantt view, **Export** downloads exactly the rows the chart is showing.
Clear the filters and unfold every branch first if you want everything. There
are three options:

| Option | What you get |
|---|---|
| Excel (.xlsx) | Opens on the **Gantt** sheet: the same chart as the app, on a white background. It has the same columns (WBS, Milestone, Owner, %), one column per day under month and date headers, shaded weekends, the same legend and bar colours, the progress part filled in with its %, red outlines for overdue work, diamonds, dashed bars for root milestones, and the orange today line. Hover the first cell of a bar to see its details. The **Roadmap** sheet is the same rows as a table (outline number, parent, milestone, status, priority, progress, start, due, duration, assigned to, overdue, days overdue, and a link back to the app), with real dates you can sort and filter. **About** records who exported it, when, and which filters were on. |
| CSV | The same table as plain text. Opens in Excel, Numbers, LibreOffice or Google Sheets. |
| Google Sheets (.xlsx) | The same Excel file. Upload it to Google Drive and open it with Google Sheets; the colours and frozen headers carry over. |

The export runs entirely in your browser; nothing is sent to a server. There is
no direct "open in Google Sheets" button on purpose: it would need extra Google
permissions at sign-in, which would bring back Google's "unverified app" warning
for everyone.

Supporting components:
- **`RoadmapBreadcrumb`**: ancestry path navigation (Phase 11)
- **`RoadmapNodeModal`**: create/edit node form modal (Phase 5)
- **`RoadmapTaskModal`**: create/edit task form modal (Phase 13)

---

## Routing

| Route | Component | Access |
|---|---|---|
| `/roadmap` | `CompanyRoadmap` | All authenticated users |

Route is lazy-loaded via `React.lazy()`, so it is excluded from the initial JS bundle. The async chunk is approximately **18.6 kB gzip**.

---

## Firestore Schema

### `roadmapNodes/{nodeId}` (top-level collection)

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Node name. Min 1 char. |
| `description` | `string` | Optional long-form description. |
| `status` | `enum` | `pending` \| `in-progress` \| `completed` \| `blocked` \| `archived` |
| `priority` | `enum` | `low` \| `medium` \| `high` \| `critical` |
| `startDate` | `Timestamp \| null` | Optional start date. |
| `dueDate` | `Timestamp \| null` | Optional due date. |
| `assignedTo` | `string[]` | Array of user UIDs assigned to this node. |
| `parentId` | `string \| null` | Parent node ID. `null` for root nodes. |
| `path` | `string` | Slash-delimited ancestry path: `"gp/parent/nodeId"`. Used for subtree queries. |
| `ancestorIds` | `string[]` | All ancestor IDs ordered root-first. `length === depth`. |
| `depth` | `number` | 0 = root, 1 = child, etc. |
| `order` | `number` | Client-side sort order (integer, 0-based). |
| `progress` | `number` | 0–100. Cloud Function–owned rollup of child task progress. |
| `childCount` | `number` | Number of direct non-archived child nodes. |
| `childCompletedCount` | `number` | Number of completed direct children. |
| `dependencies` | `string[]` | IDs of nodes that must complete before this one. |
| `tags` | `string[]` | Freeform label tags. |
| `isArchived` | `boolean` | Soft-delete flag. Archived nodes are hidden from default queries. |
| `createdBy` | `string` | UID of creating admin. Immutable after create. |
| `updatedBy` | `string` | UID of last editor. |
| `createdAt` | `Timestamp` | Server timestamp. Immutable after create. |
| `updatedAt` | `Timestamp` | Server timestamp. Updated on every write. |

### `roadmapNodes/{nodeId}/tasks/{taskId}` (tasks subcollection)

| Field | Type | Description |
|---|---|---|
| `title` | `string` | Task name. Min 1 char. |
| `description` | `string` | Optional description. |
| `status` | `enum` | `pending` \| `in-progress` \| `completed` |
| `priority` | `enum` | `low` \| `medium` \| `high` |
| `progress` | `number` | 0–100. Drives parent node rollup via Cloud Function. |
| `assignedTo` | `string[]` | UIDs of assigned employees. |
| `dueDate` | `Timestamp \| null` | Optional due date. |
| `completionNote` | `string` | Optional note when marking complete. |
| `nodeId` | `string` | **Denormalized** parent node ID, required for `collectionGroup('tasks')` queries (analytics). |
| `assignedBy` | `string` | UID of assigning admin. Immutable after create. |
| `createdBy` | `string` | UID of creator. Immutable after create. |
| `updatedBy` | `string` | UID of last editor. |
| `createdAt` | `Timestamp` | Server timestamp. Immutable. |
| `updatedAt` | `Timestamp` | Server timestamp. Updated on every write. |

### `roadmapNodes/{nodeId}/comments/{commentId}` (comments subcollection)

| Field | Type | Description |
|---|---|---|
| `text` | `string` | Comment body. Max 2000 chars (enforced by Firestore Rules). |
| `authorUid` | `string` | UID of comment author. Anti-spoofing: must equal `effectiveUid` at create time (Rules check). |
| `authorName` | `string` | Denormalized display name (at time of posting). |
| `authorAvatar` | `string` | Denormalized avatar URL (may be empty string). |
| `createdAt` | `Timestamp` | Server timestamp. |

### `roadmapNodes/{nodeId}/history/{historyId}` (audit history subcollection)

> **Write-locked for all clients.** Only Cloud Functions via Admin SDK can write here.

| Field | Type | Description |
|---|---|---|
| `action` | `string` | `created` \| `updated` \| `archived` \| `deleted` \| `task_created` \| `task_updated` \| `task_deleted` |
| `entityType` | `string` | `node` \| `task` |
| `changedBy` | `string` | UID of the user who triggered the change, or `"system"` for Cloud Function–only changes. |
| `changedFields` | `Array<{field, previousValue, newValue}>` | Fields changed by a user (structural/status fields). |
| `systemChangedFields` | `Array<{field, newValue}>` | Rollup fields changed by the Cloud Function (e.g. `progress`, `childCount`). |
| `taskId` | `string?` | Present when `entityType === "task"`. |
| `taskTitle` | `string?` | Denormalized task title at time of event. |
| `nodeTitle` | `string?` | Denormalized node title at time of event. |
| `timestamp` | `Timestamp` | Server timestamp. Used for ordering (newest-first). |

### `roadmapNodes/{nodeId}/attachments/{attachmentId}` (attachments subcollection)

| Field | Type | Description |
|---|---|---|
| `fileName` | `string` | Original file name. |
| `fileSize` | `number` | File size in bytes. Max 10,485,760 (10 MB), enforced by Firestore Rules. |
| `fileType` | `string` | MIME type. |
| `storagePath` | `string` | Full Firebase Storage path for deletion. |
| `downloadUrl` | `string` | Public download URL from Firebase Storage. |
| `uploadedBy` | `string` | UID of uploader. Anti-spoofing: must equal `effectiveUid` at create time (Rules check). |
| `uploadedAt` | `Timestamp` | Server timestamp. |

**Firebase Storage path:** `roadmapAttachments/{nodeId}/{timestamp}_{sanitizedFilename}`

**Allowed MIME types:** `image/*`, `application/pdf`, `application/msword`, `application/vnd.*`, `text/plain`, `text/csv`

---

## Firestore Indexes

These composite indexes must be deployed before the module is usable:

| Collection | Fields | Direction |
|---|---|---|
| `roadmapNodes` | `parentId`, `isArchived`, `order` | ASC, ASC, ASC |
| `roadmapNodes` | `ancestorIds` (array-contains), `isArchived` | n/a, ASC |
| `roadmapNodes/{id}/history` | `timestamp` | DESC |
| `roadmapNodes/{id}/attachments` | `uploadedAt` | DESC |

---

## Permission Model

### `roadmapNodes/{nodeId}`

| Operation | Admin | Auth Employee | Unauthenticated |
|---|---|---|---|
| Read | Yes | Yes | No |
| Create | Yes | No | No |
| Update | Yes | No | No |
| Delete | Yes | No | No |

### `roadmapNodes/{nodeId}/tasks/{taskId}`

| Operation | Admin | Assigned Employee | Other Employee |
|---|---|---|---|
| Read | Yes | Yes | No |
| Create | Yes | No | No |
| Update (all fields) | Yes | No | No |
| Update (`status`, `progress`, `completionNote`) | Yes | Yes | No |
| Delete | Yes | No | No |

### `roadmapNodes/{nodeId}/comments/{commentId}`

| Operation | Admin | Own Comment Author | Other Employee |
|---|---|---|---|
| Read | Yes | Yes | Yes |
| Create (`authorUid == effectiveUid`, text ≤ 2000) | Yes | Yes | Yes |
| Update / Delete | Yes | Yes | No |

### `roadmapNodes/{nodeId}/history/{historyId}`

| Operation | Anyone (client) | Cloud Function (Admin SDK) |
|---|---|---|
| Read | Yes (all authenticated) | Yes |
| Write | **BLOCKED** (`allow write: if false`) | Yes (bypasses rules) |

### `roadmapNodes/{nodeId}/attachments/{attachmentId}`

| Operation | Admin | Uploader | Other Employee |
|---|---|---|---|
| Read | Yes | Yes | Yes |
| Create (`uploadedBy == effectiveUid`, size ≤ 10 MB) | Yes | Yes | Yes |
| Update / Delete | Yes | Yes | No |

---

## Service API Reference

### `roadmapService.js`

> Import: `import { ... } from '../services/roadmapService'`

#### `computeHierarchy(newNodeId, parentNode)`

Pure function. Computes `{ parentId, path, ancestorIds, depth }` for a new child node.

| Parameter | Type | Description |
|---|---|---|
| `newNodeId` | `string` | The newly generated Firestore doc ID |
| `parentNode` | `object \| null` | Full parent node data. `null` for root nodes. |

Returns `{ parentId, path, ancestorIds, depth }`.

---

#### `subscribeToChildren(parentId, onData, onError?)`

Real-time subscription to direct children of a node. Sorted by `order` (ascending). Pass `parentId = null` for root nodes.

Returns `unsubscribe` function.

---

#### `subscribeToSubtree(ancestorId, onData, onError?)`

Real-time subscription to **all descendants** of a node using `array-contains` on `ancestorIds`. Used for analytics and search. Results sorted by `order`.

Returns `unsubscribe` function.

---

#### `subscribeToAllNodes(onData, onError?)`

Every non-archived node, as one flat unsorted array. Used only by the Gantt view
(through `useRoadmapGantt`), which mounts it while the Gantt is on screen. One
equality filter on `isArchived`, so no composite index is needed.

Returns `() => void` (unsubscribe).

---

#### `subscribeToNode(nodeId, onData, onError?)`

Real-time subscription to a single node document. Calls `onData(null)` if the node does not exist.

Returns `unsubscribe` function.

---

#### `createNode(form, adminUid, parentNode?)`

Creates a new roadmap node. Uses a two-step write (`addDoc` → `updateDoc`) to set the hierarchy path after the Firestore ID is known. Increments parent `childCount` client-side.

| Parameter | Type | Description |
|---|---|---|
| `form` | `object` | Form data validated against `CreateNodeSchema` (Zod). Throws `ZodError` on invalid input. |
| `adminUid` | `string` | `effectiveUid` of creating admin |
| `parentNode` | `object \| null` | Full parent node (default: `null` = root) |

Returns `Promise<string>`: the new document ID.

**Stripped from write:** `progress`, `childCount`, `childCompletedCount`, `path`, `ancestorIds`, `depth`, `createdAt`, `createdBy` are all computed internally and never trusted from `form`.

---

#### `updateNode(nodeId, data, editorUid)`

Updates structural fields of a node (admin only). Strips rollup and hierarchy fields before writing, validates the edit-form fields with Zod, and stores `startDate`/`dueDate` as `Date` values (a form string becomes UTC midnight of that day, the same shape `createNode` writes). Earlier versions stored the raw `'YYYY-MM-DD'` string, so older edited nodes may still hold strings; readers go through `toDate()` / `toDayKey()`, which accept both.

Returns `Promise<void>`.

---

#### `archiveNode(nodeId, adminUid)`

Sets `isArchived = true`. This is a soft delete: the document and all subcollections are preserved. Archived nodes are excluded from default queries.

Returns `Promise<void>`. Throws if `nodeId` is falsy.

---

#### `deleteNode(nodeId)`

Hard-deletes a leaf node. **Blocked** if `childCount > 0` (throws). Reads the live document before deleting to enforce this guard and decrement the parent's `childCount`.

> Subcollection cleanup (tasks, comments, history, attachments) must be handled by a Cloud Function, because Firestore does not cascade-delete subcollections.

Returns `Promise<void>`.

---

#### `getRoadmapCalendarEvents(nodes, tasks)`

Pure function (no Firestore calls). Converts roadmap nodes + tasks into calendar event objects, applying deduplication rules to avoid double-counting when a leaf node's due date matches a task due date.

Returns `{ roadmapEvents: Array, dedupTaskIds: Set<string> }`.

---

### `roadmapTaskService.js`

> Import: `import { ... } from '../services/roadmapTaskService'`

#### `subscribeToRoadmapTasks(nodeId, onData, onError?)`

Real-time subscription to all tasks under a node. Results sorted by `createdAt` ascending. If `nodeId` is falsy, calls `onData([])` immediately and returns a no-op unsubscribe.

Returns `unsubscribe` function.

---

#### `createRoadmapTask(nodeId, form, adminUid)`

Creates a task under a node. `nodeId` is denormalized into the document for `collectionGroup('tasks')` queries (Phase 16 analytics).

| Parameter | Type | Description |
|---|---|---|
| `nodeId` | `string` | Parent node ID. Throws if falsy. |
| `form` | `object` | Validated against `CreateTaskSchema` (Zod). |
| `adminUid` | `string` | Sets `assignedBy`, `createdBy`, `updatedBy`. |

Returns `Promise<string>`: the new task ID.

---

#### `updateRoadmapTask(nodeId, taskId, data, uid)`

Updates a task. Strips `createdAt`, `createdBy`, `nodeId` (immutable). Field restrictions for employees (`status`, `progress`, `completionNote` only) are enforced by Firestore Rules; this function does not re-check.

Returns `Promise<void>`. Throws if either `nodeId` or `taskId` is falsy.

---

#### `deleteRoadmapTask(nodeId, taskId)`

Deletes a task document. Admin-only (Firestore Rules enforce). Triggers the `onRoadmapTaskWrite` Cloud Function to recompute the parent node's progress rollup.

Returns `Promise<void>`.

---

### `roadmapCommentService.js`

> Import: `import { ... } from '../services/roadmapCommentService'`

| Function | Description |
|---|---|
| `subscribeToComments(nodeId, onData, onError?)` | Real-time subscription. Ordered oldest-first. |
| `postComment(nodeId, text, author)` | Posts a new comment. `author = { uid, name, avatar? }`. Text is trimmed; throws if empty. |
| `deleteComment(nodeId, commentId)` | Deletes a comment. Caller must verify permission (own comment or admin). |

---

### `roadmapHistoryService.js`

> Import: `import { ... } from '../services/roadmapHistoryService'`

| Function | Description |
|---|---|
| `subscribeToNodeHistory(nodeId, onData, onError?, pageSize?)` | Real-time subscription. Ordered newest-first. Default `pageSize = 20`. |
| `getNodeHistoryPage(nodeId, lastDoc?, pageSize?)` | One-shot paginated fetch. Returns `{ entries, lastDoc, hasMore }`. Uses `pageSize + 1` trick to detect `hasMore` without an extra count query. |

---

### `roadmapAttachmentService.js`

> Import: `import { ... } from '../services/roadmapAttachmentService'`

| Function / Constant | Description |
|---|---|
| `MAX_FILE_SIZE_BYTES` | `10 * 1024 * 1024` (10 MB) |
| `ALLOWED_MIME_PREFIXES` | `['image/', 'application/pdf', 'application/msword', 'application/vnd.', 'text/plain', 'text/csv']` |
| `isMimeAllowed(mimeType)` | Returns `true` if the MIME type matches any allowed prefix. |
| `getMimeLabel(mimeType)` | Returns a human-readable label (`"Image"`, `"PDF"`, etc.) or `"File"`. |
| `formatFileSize(bytes)` | Returns a human-readable file size string (`"1.5 KB"`, `"10.0 MB"`). |
| `subscribeToAttachments(nodeId, onData, onError?)` | Real-time subscription. Ordered newest-first. |
| `uploadAttachment(nodeId, file, uid, onProgress?)` | Uploads to Firebase Storage, then writes metadata to Firestore. Returns `Promise<string>` (download URL). Validates size and MIME type client-side before upload. |
| `deleteAttachment(nodeId, attachmentId, storagePath)` | Deletes from Storage (best-effort) then deletes the Firestore metadata document. |

---

## Custom Hooks Reference

### `useRoadmapTree()` in `src/hooks/useRoadmapTree.js`

Manages the expand/collapse state of the roadmap tree and triggers recursive subscriptions for expanded nodes.

| Return value | Type | Description |
|---|---|---|
| `expandedIds` | `Set<string>` | Set of currently expanded node IDs |
| `toggleExpand` | `(nodeId: string) => void` | Toggles a node's expanded state. Stable reference (ref pattern). |
| `isExpanded` | `(nodeId: string) => boolean` | Returns `true` if the node is expanded. Stable reference. |

### `useRoadmapGantt()` in `src/hooks/useRoadmapGantt.js`

Subscribes to `subscribeToAllNodes` and `subscribeToAllUsers` and returns `{ rows, userNames, today, loading, error }`. `rows` comes from `buildGanttRows()` in `src/utils/ganttHelpers.js`, which also holds the filter, timeline and export helpers (all pure and unit-tested). Mounted only by `RoadmapGanttView`.

---

### `useRoadmapNode(nodeId)` in `src/hooks/useRoadmapNode.js`

Subscribes to a single node document and its tasks.

| Return value | Type | Description |
|---|---|---|
| `node` | `object \| null` | Live node document |
| `tasks` | `object[]` | Live task array (sorted by `createdAt`) |
| `loading` | `boolean` | True on initial load |

### `useRoadmapKpi()` in `src/hooks/useRoadmapKpi.js`

Computes summary KPIs over the entire roadmap (total nodes, by status, overall progress).

### `useRoadmapCalendarEvents()` in `src/hooks/useRoadmapCalendarEvents.js`

Returns roadmap calendar events ready for `react-big-calendar`, with deduplication of node / task due dates.

---

## Cloud Functions

> **File:** `functions/roadmapTriggers.js`
> **Deploy status:** Deferred; requires Firebase Blaze plan.

### `onRoadmapTaskWrite` (Firestore trigger)

- **Trigger:** `onDocumentWritten('roadmapNodes/{nodeId}/tasks/{taskId}')`
- **Purpose:** Recomputes the parent node's `progress`, `childCount`, `childCompletedCount`, and `status` after any task create/update/delete.
- **Loop guard:** Skips the write if the computed progress rounds to the same integer as the existing value (prevents infinite trigger chains from `updatedAt` changes).
- **History write:** Appends an audit entry to `roadmapNodes/{nodeId}/history/` via Admin SDK.

### `onRoadmapNodeWrite` (Firestore trigger)

- **Trigger:** `onDocumentWritten('roadmapNodes/{nodeId}')`
- **Purpose:** Propagates progress changes upward to all ancestor nodes.
- **Loop guard:** Same `Math.round` comparison as above. Skips write if only `updatedAt`/`updatedBy` changed (detects self-triggered writes).
- **History write:** Appends an audit entry to `roadmapNodes/{nodeId}/history/` for structural changes.

### Why batched ancestor writes (not recursive triggers)?

Propagating progress through a tree could be done recursively (each node write triggers its parent). This was rejected because:

1. **Infinite loop risk**: without a precise loop guard, a cascade of `updatedAt` changes would re-trigger indefinitely.
2. **Firestore cost**: each trigger invocation reads and writes at least one document; deep trees would amplify costs exponentially.
3. **Predictability**: a single Cloud Function that reads all ancestors in one batch and writes only changed values is deterministic and easier to test.

The current design reads the full ancestor path from `ancestorIds` (already stored on each node) and does a single batched propagation pass.

---

## Performance Notes

- **`React.memo`** on `RoadmapNodeCard` with a 13-field custom comparator (`areNodePropsEqual`), which prevents re-renders when unrelated nodes update.
- **Stable hook refs**: `toggleExpand` and `isExpanded` are wrapped in a ref pattern so they never change identity, allowing `React.memo` to work correctly.
- **Virtualization shim**: root level capped at 50 visible nodes; child levels capped at 30. "Show more" button loads 50 more per click. Full `react-window` virtualization deferred (incompatible with variable-height recursive tree without architectural restructuring).
- **Code splitting**: `CompanyRoadmap` is lazy-loaded (18.6 kB gzip, separate async chunk). Does not affect initial bundle.

---

## Known Deferred Items

| Item | Reason | Target Phase |
|---|---|---|
| Firebase Blaze plan (Cloud Function deploy) | Billing upgrade required | Phase 22 |
| Firestore emulator rules tests | Blaze plan required | Phase 22 |
| 200+ node stress test | Requires seeded Firestore on Blaze plan | Phase 22 |
| Drag-and-drop node reorder | No drag library in current codebase; requires architectural work | Future |
| Full `react-window` virtualization | Requires flat-list architecture (incompatible with recursive tree) | Future |
