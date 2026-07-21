# AirBuddy Workspace — Company Operating System
## Master Implementation Roadmap (TODO.md)

> Base repository: `ajit421/airbuddy-workspace` (React 19 + Vite + Firebase + Tailwind)
> This roadmap extends the existing project. No existing route, service, component, or Firestore collection is rebuilt or replaced.

---

## Phase 1 — Repository & Architecture Analysis

### Goal
Fully understand the existing codebase before any new work begins, so nothing is duplicated or broken.

### Tasks
- [x] Analyze existing folder structure (`src/components`, `src/services`, `src/hooks`, `src/context`, `src/pages`, `src/utils`)
- [x] Review existing routing in `App.jsx` (protected routes, admin routes, route groups)
- [x] Review existing authentication flow (`AuthContext.jsx`, Firebase Auth setup)
- [x] Review existing Firestore collections (`tasks`, notifications, KPI-related collections)
- [x] Review existing service layer conventions (`taskService.js`, `notificationService.js`, `kpiService.js`)
- [x] Review existing permission utilities (`utils/permissions.js`)
- [x] Review existing reusable UI components (`shared/Modal.jsx`, `TaskCard.jsx`, `Sidebar.jsx`, `Charts.jsx`)
- [x] Review existing dashboard, KPI, calendar, and notification systems end-to-end
- [x] Document naming conventions, code style, and Tailwind theme tokens in use
- [x] Produce a short internal architecture-fit report confirming reuse points

### Deliverables
- Architecture fit report (internal reference document, not shipped to users)

### Expected Output
Clear map of what exists and exactly where new roadmap code will attach.

### Dependencies
None (starting phase)

### Estimated Difficulty
Easy

### Estimated Time
2–3 Hours

### Risks
- Misreading existing conventions leads to inconsistent new code later

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 2 — Feature Architecture Planning

### Goal
Define the module structure, file layout, and component responsibilities for the Company Roadmap feature before writing schema or code.

### Tasks
- [x] Define new folder structure under `src/components/Roadmap/`
- [x] Define new context: `RoadmapContext.jsx` (scoped provider, mounted only on roadmap routes)
- [x] Define new hooks: `useRoadmapTree.js`, `useRoadmapNode.js`
- [x] Define new services: `roadmapService.js`, `roadmapTaskService.js`
- [x] Map which existing components will be reused vs. which are net-new
- [x] Define new route additions (`/roadmap`, `/roadmap/:nodeId`) as additive-only changes
- [x] Define Sidebar navigation entry placement
- [x] Confirm permission reuse strategy (reuse `canEditTask`/`canUpdateProgress`/`canViewTask`, add `canEditRoadmapStructure`)

### Deliverables
- Module architecture document (file tree + responsibilities)

### Expected Output
A complete, agreed file/component map ready for schema design.

### Dependencies
Depends on:
- Phase 1

### Estimated Difficulty
Medium

### Estimated Time
3–4 Hours

### Risks
- Over-engineering the module structure before schema is known

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 3 — Database (Firestore) Planning

### Goal
Design a Firestore schema that supports unlimited nested hierarchy, cheap subtree queries, and low-cost progress rollups.

### Tasks
- [x] Design `roadmapNodes` collection schema (title, status, priority, dates, progress, etc.)
- [x] Design hierarchy strategy: `parentId`, materialized `path`, denormalized `ancestorIds`, `depth`, `order`
- [x] Design `roadmapNodes/{id}/tasks` subcollection schema
- [x] Design `roadmapNodes/{id}/comments`, `/history`, `/attachments` subcollections
- [x] Define denormalized rollup fields (`childCount`, `childCompletedCount`)
- [x] Define required composite indexes (`path`, `parentId+order`, `assignedTo+status`)
- [x] Define calendar-event derivation data shape (used later in Phase 15)
- [x] Define notification collection reuse plan (no new notification collection)
- [x] Document delete-behavior policy: block delete if node has children

### Deliverables
- Firestore schema document
- Index requirements list

### Expected Output
Finalized schema ready for backend implementation, with no ambiguity on hierarchy strategy.

### Dependencies
Depends on:
- Phase 2

### Estimated Difficulty
Hard

### Estimated Time
1 Day

### Risks
- Wrong hierarchy strategy causes expensive recursive reads later
- Missing composite index causes runtime query failures

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 4 — Security & Permissions Planning

### Goal
Define exact role-based access rules before any Firestore Rules are written.

### Tasks
- [x] Define admin permissions matrix (full CRUD on roadmap structure)
- [x] Define employee permissions matrix (read all, update only assigned task progress/status)
- [x] Define comment-posting permission (open to all signed-in users)
- [x] Define history subcollection access (server-write-only, read-only for clients)
- [x] Define attachment access rules
- [x] Define `collectionGroup` query rule requirements for analytics (Phase 16)
- [x] Cross-check new rules against existing Firestore rules for conflicts

### Deliverables
- Permission matrix document
- Draft Firestore Rules (not yet deployed)

### Expected Output
A reviewed, unambiguous permission model ready to implement in Firestore Rules.

### Dependencies
Depends on:
- Phase 3

### Estimated Difficulty
Medium

### Estimated Time
3–4 Hours

### Risks
- Overly permissive rules exposing admin-only actions to employees
- Overly restrictive rules blocking legitimate employee updates

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 5 — Routing Setup

### Goal
Add roadmap routes into the existing router without disturbing current routes.

### Tasks
- [x] Add `/roadmap` route inside existing `ProtectedRoute` wrapper
- [x] Add `/roadmap/:nodeId` deep-link route
- [x] Wrap roadmap routes in new scoped `RoadmapProvider`
- [x] Add Sidebar navigation entry (top of nav list)
- [x] Verify no route path collisions with existing HRMS/KPI/admin routes
- [x] Verify admin-only sub-actions still route through existing `AdminRoute` guard pattern

### Deliverables
- Updated `App.jsx` (additive changes only)
- Updated `Sidebar.jsx` (additive changes only)

### Expected Output
Working navigation to an empty/placeholder Company Roadmap page.

### Dependencies
Depends on:
- Phase 2

### Estimated Difficulty
Easy

### Estimated Time
1–2 Hours

### Risks
- Route path collision with existing routes

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 6 — Firestore Collections Implementation

### Goal
Create the actual Firestore collections and seed structure defined in Phase 3.

### Tasks
- [x] Create `roadmapNodes` collection with schema fields from Phase 3
- [x] Implement subcollection structure (`tasks`, `comments`, `history`, `attachments`)
- [x] Deploy composite indexes defined in Phase 3
- [x] Seed a small test tree (3–4 levels) in a staging/emulator environment
- [x] Verify materialized `path` and `ancestorIds` compute correctly on nested inserts

### Deliverables
- Live Firestore collections (staging)
- Deployed indexes

### Expected Output
A queryable, correctly nested test dataset in Firestore.

### Dependencies
Depends on:
- Phase 3

### Estimated Difficulty
Medium

### Estimated Time
3–4 Hours

### Risks
- Incorrect path/ancestor computation corrupting hierarchy from the start

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 7 — Backend Services (Client-Side)

### Goal
Build the service-layer functions the UI will call, following existing `taskService.js` conventions.

### Tasks
- [x] Implement `roadmapService.js` (create/update/archive node, Zod validation)
- [x] Implement `roadmapTaskService.js` (create/update task, progress/status updates)
- [x] Implement `subscribeToChildren()` and `subscribeToSubtree()` realtime functions
- [x] Implement `getRoadmapCalendarEvents()` dedup logic (used in Phase 15)
- [x] Write unit tests for all new service functions (matching existing `taskService.test.js` style)

### Deliverables
- `roadmapService.js`, `roadmapTaskService.js`
- Unit test files

### Expected Output
Fully tested client service layer, no UI yet.

### Dependencies
Depends on:
- Phase 6

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Schema validation gaps allowing malformed nodes into Firestore

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 8 — Cloud Functions (Progress Rollup)

### Goal
Implement server-side automatic progress rollup from leaf tasks up through unlimited ancestor depth.

### Tasks
- [x] Implement `onRoadmapTaskWrite` trigger (recompute leaf node progress)
- [x] Implement `onRoadmapNodeProgressChange` trigger (batched ancestor propagation via `ancestorIds`)
- [x] Implement infinite-loop guard (skip write if progress value unchanged)
- [x] Implement transaction-based `recomputeNodeProgress()` for race-safety
- [x] Test cascade correctness at 6+ levels of nesting in emulator
- [x] Test concurrent task updates from multiple simulated users

### Deliverables
- `functions/roadmapTriggers.js`
- `functions/roadmapService.server.js`

### Expected Output
Automatic, race-safe, multi-level progress rollup with no manual client computation.

### Dependencies
Depends on:
- Phase 7

### Estimated Difficulty
Very Hard

### Estimated Time
1–2 Days

### Risks
- Infinite trigger loops if guard logic is wrong
- Race conditions under concurrent updates
- Firestore cost spike from unbounded cascade writes

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 9 — Firestore Security Rules Deployment

### Goal
Deploy and verify the permission model defined in Phase 4.

### Tasks
- [x] Write Firestore Rules for `roadmapNodes` (admin-only structural writes)
- [x] Write Firestore Rules for `tasks` subcollection (field-restricted employee updates)
- [x] Write Firestore Rules for `history` (server-write-only, `allow write: if false`)
- [x] Write `collectionGroup` rule for `tasks` (required for analytics queries)
- [x] Run existing rules test suite to confirm no regression on current rules
- [x] Run new rules tests against the permission matrix from Phase 4

### Deliverables
- Updated `firestore.rules` (additive block)
- Passing rules test suite

### Expected Output
Deployed, verified security rules matching the exact permission model.

### Dependencies
Depends on:
- Phase 4, Phase 8

### Estimated Difficulty
Hard

### Estimated Time
4–6 Hours

### Risks
- Breaking existing HRMS/KPI/task rules with a misplaced match block

### Validation Checklist
- [x] Feature completed
- [x] Existing code not broken
- [x] Tested
- [x] Responsive
- [x] Firestore rules verified
- [x] Ready for next phase

---

## Phase 10 — Company Roadmap Core UI

### Goal
Build the main expandable/collapsible nested tree UI.

### Tasks
- [ ] Build `CompanyRoadmap.jsx` top-level page
- [ ] Build `RoadmapTree.jsx` recursive expand/collapse renderer
- [ ] Build `RoadmapNodeCard.jsx` (reusing `TaskCard.jsx` visual language)
- [ ] Implement lazy-fetch-on-expand behavior (no eager subtree loading)
- [ ] Wire listener lifecycle to expand/collapse state (auto-unsubscribe on collapse)
- [ ] Test unlimited nesting depth visually in a dev environment

### Deliverables
- `CompanyRoadmap.jsx`, `RoadmapTree.jsx`, `RoadmapNodeCard.jsx`

### Expected Output
A working, realtime, nested expandable roadmap tree matching existing UI theme.

### Dependencies
Depends on:
- Phase 5, Phase 7

### Estimated Difficulty
Hard

### Estimated Time
1–2 Days

### Risks
- Performance degradation at deep nesting without proper listener cleanup

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 11 — Roadmap Node Detail & Editing UI

### Goal
Build create/edit/detail interfaces for individual roadmap nodes.

### Tasks
- [ ] Build `RoadmapNodeModal.jsx` (create/edit, reusing `shared/Modal.jsx`)
- [ ] Build `RoadmapNodeDetail.jsx` side panel (description, dependencies, related tasks)
- [ ] Build `RoadmapBreadcrumb.jsx` using materialized `path`
- [ ] Implement delete-blocked-if-children-exist UI state (disabled button + tooltip)
- [ ] Implement admin-only vs. employee-only control visibility (hide, not just disable)

### Deliverables
- `RoadmapNodeModal.jsx`, `RoadmapNodeDetail.jsx`, `RoadmapBreadcrumb.jsx`

### Expected Output
Full create/edit/detail workflow functional for admins; read-only equivalent for employees.

### Dependencies
Depends on:
- Phase 10

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Employees able to see admin-only controls due to incomplete UI guard

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 12 — Employee Task Assignment UI

### Goal
Enable admins to assign tasks under roadmap nodes, and employees to update their assigned task progress.

### Tasks
- [ ] Build task list tab inside `RoadmapNodeDetail.jsx`
- [ ] Build admin task-assignment form (select employee(s), reuse existing employee-picker component if present)
- [ ] Build employee progress/status update control (restricted fields only)
- [ ] Verify automatic parent progress rollup reflects in UI without manual refresh
- [ ] Verify field-level Firestore Rules block unauthorized employee edits at the UI form level too (defense in depth)

### Deliverables
- Task assignment + progress update UI within Roadmap module

### Expected Output
End-to-end flow: admin assigns task → employee updates progress → parent rolls up automatically.

### Dependencies
Depends on:
- Phase 8, Phase 11

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- UI allowing an edit that Firestore Rules then silently reject (poor error feedback)

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 13 — Comments & Attachments

### Goal
Add collaboration features to roadmap nodes.

### Tasks
- [ ] Build comments tab in `RoadmapNodeDetail.jsx` (reuse existing `collaborationService.js` pattern)
- [ ] Build attachments tab (file upload to Firebase Storage, metadata to `attachments` subcollection)
- [ ] Implement thumbnail generation for image attachments
- [ ] Verify comment-posting permission (open to all signed-in users, per confirmed default)

### Deliverables
- Comments UI, Attachments UI

### Expected Output
Functional commenting and file attachment on any roadmap node.

### Dependencies
Depends on:
- Phase 11

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Large file uploads without size limits causing storage cost issues

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 14 — Notifications Integration

### Goal
Extend the existing notification system with roadmap-specific events, correctly scoped to avoid notification spam.

### Tasks
- [ ] Add new notification `type` values to existing `notificationService.js`
- [ ] Implement scoped notification triggers (task assigned, milestone completed, deadline events, comments)
- [ ] Implement notification scoping rule: direct node + direct parent assignees only (not full ancestor chain)
- [ ] Implement scheduled Cloud Function for deadline-tomorrow / deadline-missed checks
- [ ] Extend navbar notification bell icon/label map for new types
- [ ] Test fanout scenario (deep node with many indirect assignees) to confirm no over-notification

### Deliverables
- Extended `notificationService.js`
- `functions/roadmapDeadlineCheck.js`

### Expected Output
Correctly scoped, realtime roadmap notifications integrated into the existing bell UI.

### Dependencies
Depends on:
- Phase 8, Phase 12

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Notification spam from incorrect ancestor-chain scoping

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 15 — Calendar Integration

### Goal
Sync roadmap and task deadlines into the existing calendar system without duplicate entries.

### Tasks
- [ ] Implement `getRoadmapCalendarEvents()` dedup logic in `roadmapService.js`
- [ ] Merge roadmap events into existing `CalendarView.jsx` event source (additive merge only)
- [ ] Apply dedup rule: leaf node + single matching task date = one entry, not two
- [ ] Apply parent-node rule: only own due date shown, never full descendant task list
- [ ] Extend Google Calendar sync for depth 0/1 (company-level) milestones only
- [ ] Test dedup logic against multiple seeded scenarios

### Deliverables
- Extended `CalendarView.jsx`, extended `googleCalendarService.js`

### Expected Output
Calendar shows accurate, non-duplicated roadmap deadlines alongside existing task events.

### Dependencies
Depends on:
- Phase 7

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Calendar flooding if dedup logic or depth-based sync limit fails

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 16 — KPI Dashboard & Analytics

### Goal
Surface roadmap data into the existing KPI dashboard with cost-efficient queries.

### Tasks
- [ ] Build `RoadmapKpiStrip.jsx` (Roadmap Completion %, Company Growth)
- [ ] Implement `collectionGroup` query for Delayed Tasks / Upcoming Deadlines (single indexed query each)
- [ ] Derive Completed/Pending/Critical/Today's Tasks counts client-side from the same fetched batch
- [ ] Build Department Performance and Employee Performance / Top Contributors widgets
- [ ] Build Recent Activity widget from `history` subcollection (`collectionGroup`, `orderBy(updatedAt desc)`)
- [ ] Reuse existing `KPI/Charts.jsx` for all new charts
- [ ] Load-test with 200+ seeded tasks to confirm query count stays minimal

### Deliverables
- `RoadmapKpiStrip.jsx`
- Extended `KpiDashboard.jsx`

### Expected Output
Fully populated, low-cost analytics dashboard reflecting live roadmap data.

### Dependencies
Depends on:
- Phase 9, Phase 10, Phase 12

### Estimated Difficulty
Hard

### Estimated Time
1–2 Days

### Risks
- Missing composite index causing runtime query failure
- Excessive read costs if fetch-once-derive-many discipline isn't followed

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 17 — Audit History System

### Goal
Guarantee a complete, tamper-proof audit trail for every roadmap change.

### Tasks
- [ ] Finalize `history` subcollection document shape (action, changedBy, field, previousValue, newValue, timestamp)
- [ ] Wire history writes into every mutation path (same batch/transaction as the actual change, never a separate best-effort write)
- [ ] Implement lighter history entries for ancestor rollups (system-attributed, value-only)
- [ ] Build `RoadmapHistoryLog.jsx` paginated viewer
- [ ] Test that client-side direct writes to `history` are rejected even for admin sessions

### Deliverables
- `RoadmapHistoryLog.jsx`
- History-writing logic embedded across all mutation services

### Expected Output
Every change to every roadmap node is fully and immutably logged.

### Dependencies
Depends on:
- Phase 8, Phase 9

### Estimated Difficulty
Hard

### Estimated Time
1 Day

### Risks
- History drifting from actual state if a write path is missed

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 18 — Responsive Design Pass

### Goal
Ensure the entire roadmap module works correctly across desktop, laptop, tablet, and mobile.

### Tasks
- [ ] Test deep nesting (5+ levels) on mobile viewport (~380px)
- [ ] Replace/adjust margin-based indentation with indent-guides or horizontal scroll fallback on small screens
- [ ] Test three-column (tree + detail panel + sidebar) layout collapse to drawer/two-column on tablet
- [ ] Test modal and detail panel usability on mobile touch targets
- [ ] Test calendar and KPI widgets on mobile

### Deliverables
- Responsive CSS/layout fixes across all new components

### Expected Output
Fully usable Company Roadmap module on all device sizes.

### Dependencies
Depends on:
- Phase 10, Phase 11, Phase 16

### Estimated Difficulty
Medium

### Estimated Time
1 Day

### Risks
- Deep nesting remains visually broken on very small screens if not explicitly redesigned

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 19 — Performance Optimization

### Goal
Ensure the module performs well at scale (many nodes, many tasks, deep nesting).

### Tasks
- [ ] Code-split `CompanyRoadmap.jsx` route via `React.lazy()`
- [ ] Apply `React.memo` to `RoadmapNodeCard.jsx` with targeted comparison keys
- [ ] Add virtualization (`react-window`) for parent nodes with 50+ direct children
- [ ] Debounce Firestore writes on drag-reorder (write on drop, not per drag event)
- [ ] Verify Firestore write amplification at deep-nesting cascade stays within acceptable bounds
- [ ] Run bundle analyzer to confirm roadmap route is separately chunked

### Deliverables
- Performance optimization patches across roadmap components

### Expected Output
Smooth performance at realistic and stress-tested data volumes.

### Dependencies
Depends on:
- Phase 10, Phase 16, Phase 17

### Estimated Difficulty
Hard

### Estimated Time
1 Day

### Risks
- Premature or unnecessary virtualization adding complexity without real benefit

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 20 — Testing (Full Suite)

### Goal
Comprehensive testing across unit, security rules, concurrency, permissions, responsive, and performance dimensions.

### Tasks
- [ ] Write/run unit tests for all new services (matching existing test file conventions)
- [ ] Run Firestore emulator rules tests (permission matrix, field-restricted updates, history lockdown)
- [ ] Run multi-user concurrency simulation (simultaneous task updates, simultaneous reorders, delete-while-editing)
- [ ] Run full role-matrix permission testing (admin / assigned employee / unassigned employee)
- [ ] Run responsive testing across breakpoints
- [ ] Run performance testing with 200+ seeded nodes/tasks
- [ ] Run full regression pass on existing modules (Work Partner, KPI, HRMS, Calendar, Notifications) to confirm zero breakage

### Deliverables
- Test reports across all categories above

### Expected Output
Confirmed production-readiness with no regressions to existing functionality.

### Dependencies
Depends on:
- Phase 9, Phase 14, Phase 15, Phase 16, Phase 17, Phase 18, Phase 19

### Estimated Difficulty
Very Hard

### Estimated Time
2–3 Days

### Risks
- Concurrency bugs not caught without genuine multi-session simulation
- Regression in existing modules if new rules/routes overlap incorrectly

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 21 — Documentation

### Goal
Document every new component, collection, route, hook, service, and permission rule.

### Tasks
- [ ] Write `company-roadmap.md` doc entry using existing `DocsPage.jsx`/`react-markdown` pipeline
- [ ] Add JSDoc to every exported function in `roadmapService.js` / `roadmapTaskService.js`
- [ ] Document Cloud Functions design decisions (why batched ancestor writes, not recursive)
- [ ] Document Firestore schema (collections, subcollections, indexes)
- [ ] Document permission model and confirmed defaults (e.g., comment access)
- [ ] Add short pointer section in root `README.md`

### Deliverables
- `src/docs/company-roadmap.md`
- Inline code documentation across all new files
- Updated `README.md`

### Expected Output
A fully documented module a new developer could onboard onto without asking questions.

### Dependencies
Depends on:
- Phase 20

### Estimated Difficulty
Easy

### Estimated Time
4–6 Hours

### Risks
- Documentation drifting out of date if not maintained alongside future changes

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase

---

## Phase 22 — Final Review & Production Rollout

### Goal
Final sign-off and safe production deployment.

### Tasks
- [ ] Run full acceptance checklist across all 21 prior phases
- [ ] Confirm zero breaking changes to existing routes, services, and Firestore collections
- [ ] Confirm all Firestore indexes are deployed and active in production
- [ ] Confirm Firestore Rules deployed and verified in production
- [ ] Perform staged rollout (internal admin-only access first, then full employee access)
- [ ] Monitor Firestore read/write costs for first week post-launch
- [ ] Collect initial user feedback from employees and admins

### Deliverables
- Production-deployed Company Roadmap module
- Post-launch monitoring report

### Expected Output
Fully live, stable, production-ready Company Roadmap feature integrated into AirBuddy Workspace.

### Dependencies
Depends on:
- Phase 21

### Estimated Difficulty
Medium

### Estimated Time
1 Day + 1 Week Monitoring

### Risks
- Unexpected production Firestore costs at real usage scale
- Unexpected edge cases only surfaced by real multi-department usage

### Validation Checklist
- [ ] Feature completed
- [ ] Existing code not broken
- [ ] Tested
- [ ] Responsive
- [ ] Firestore rules verified
- [ ] Ready for next phase
