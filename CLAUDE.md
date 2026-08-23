# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AirBuddy Aerospace WorkSpace — a role-based workforce platform (tasks, HRMS, KPI, company roadmap) for the `@airbuddy.in` team. React 19 + Vite SPA on Vercel, Firebase Auth/Firestore/Storage as the backend, Gemini for the AI assistant.

## Commands

```powershell
npm run dev            # Vite dev server -> http://localhost:5173
npm run build          # Production build -> dist/
npm run preview        # Serve the built bundle
npm run lint           # ESLint (dist/ and functions/ are globally ignored)
npm test               # vitest run — 10 files, 265 tests, ~6s

npx vitest                                       # watch mode
npx vitest run src/services/taskService.test.js  # single file
npx vitest run -t "computes correct average"     # single test by name
```

Cloud Functions have a separate dependency tree: `cd functions; npm install`.

```powershell
npx firebase-tools use work                      # alias -> workspace-airbuddy
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only firestore:indexes
npx firebase-tools deploy --only storage         # storage.rules
npx firebase-tools deploy --only functions       # requires the Blaze plan
npx vercel --prod                                # frontend + api/ serverless
```

The Gemini key used by the `askGemini` callable is a **secret**, not `functions.config()` (removed in firebase-functions v7):

```powershell
npx firebase-tools functions:secrets:set GEMINI_API_KEY
```

Rules and function discovery can be validated offline without deploying — the emulator refuses to start if either rules file fails to compile:

```powershell
npx firebase-tools emulators:exec --only firestore,storage "echo ok"
npx firebase-tools emulators:exec --only functions "echo ok"
```

Emulator ports ([firebase.json](firebase.json)): functions 5001, firestore 8080, storage 9199, auth 9099, pubsub 8085, UI 4000.

`.env` (gitignored) holds `VITE_FIREBASE_*` (including `VITE_FIREBASE_VAPID_KEY`, which web push needs), `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CALENDAR_API_KEY`, and `FIREBASE_SERVICE_ACCOUNT`. Every `VITE_*` value must also exist in the Vercel project settings — the browser bundle is built there, so a key that is only in the local `.env` works in `npm run dev` and silently disables the feature in production.

## The three tiers

| Tier | Runs where | Notes |
|---|---|---|
| [src/](src/) | Browser | Talks to Firestore directly. ESLint **blocks `firebase-admin` imports here** — it bypasses all security rules. |
| [api/](api/) | Vercel serverless | Only [api/gemini.js](api/gemini.js). |
| [functions/](functions/) | Firebase (CommonJS, Node 22) | Firestore triggers + two crons. Blaze-only — see "Cloud Functions". |
| [scripts/](scripts/) | Local Node, admin SDK | Gitignored. Needs `serviceAccountKey.json` at repo root. Run `--dry-run` first. |

There is no server of our own in the request path for data. **Firestore security rules in [firestore.rules](firestore.rules) are the only real authorization layer** — 500 lines of it, and the most important file in the repo to read before changing any data access.

Layering inside `src/`: components -> `hooks/` -> `services/` -> Firestore. Components should not import `firebase/firestore` directly; add a function to the relevant service. (A few pre-refactor exceptions remain, e.g. [src/context/ViewModeContext.jsx](src/context/ViewModeContext.jsx) and [src/hooks/useNotifications.js](src/hooks/useNotifications.js) — follow the convention in new code rather than these.)

## Auth and identity — three things that touch everything

[src/context/AuthContext.jsx](src/context/AuthContext.jsx) is the source of all three:

**1. Access gate.** `@airbuddy.in` emails are auto-trusted. Every other email must have an `allowed_emails/{email}` doc that is not `status: 'suspended'`; otherwise the user is signed straight back out with a toast. This logic is **duplicated** in `isEmailAllowed()` in [firestore.rules](firestore.rules) (where the external check is `status == 'approved'`, defaulting to approved when the field is absent). Change both together, or the client and rules will disagree.

**2. `effectiveUid`, never `user.uid`.** A secondary Google account can be mapped onto a primary user via `user_email_map/{email}.primaryUid`. All reads and writes must key off `effectiveUid` from `useAuth()`. Rules mirror this with `getEffectiveUid()`, which does the same lookup — so a query keyed on `user.uid` will silently return nothing for mapped users, and a write will be rejected. `useNotifications` accepts either UID as a fallback; new code should not rely on that.

**3. `isAdmin` vs `realIsAdmin`.** Admins can toggle "employee view" (`toggleEmployeeView`). `isAdmin` is the *effective* role — what UI, `AdminRoute`, and `TaskContext` query shape all use. `realIsAdmin` is the actual role, used only to decide whether to show the toggle. Rules know nothing about the toggle, so an admin in employee view still has admin write power at the database level.

The Google OAuth access token (Calendar scope) is deliberately kept **in React state only**, never `sessionStorage` (XSS hardening, `HI-11`). It is lost on refresh; on a Calendar `401`, call `refreshGoogleToken()`, which re-runs the popup. Note the Calendar scope is currently commented out in [src/services/firebase.js](src/services/firebase.js), so the token may not carry Calendar permission.

## Provider tree and route scoping

[src/App.jsx](src/App.jsx):

```
BrowserRouter > AuthProvider > ViewModeProvider > Routes
  /login, /docs, /docs/:docId          (outside the app shell)
  ProtectedRoute > TaskProvider > AppLayout (Navbar + Sidebar + Outlet + AIAssistantButton)
    /, /calendar, /work-partner, /team, /announcements, /about
    AdminRoute > /admin
    /hrms/leaves                        (open to employees — they see only their own)
    AdminRoute > /hrms/{directory,attendance,recruitment,performance}
    KpiProvider     > /kpi, /kpi/{industries,clients,products,sales,ip}
    RoadmapProvider > /roadmap, /roadmap/:nodeId   (React.lazy + Suspense)
```

`KpiProvider` and `RoadmapProvider` are mounted **only** on their route subtrees so their Firestore listeners (five of them for KPI) don't run app-wide. Keep new module providers scoped the same way.

[src/context/TaskContext.jsx](src/context/TaskContext.jsx): admins subscribe to all tasks with `orderBy('createdAt','desc')`; employees run three narrower queries (assigned, work-partner, roadmap-assigned) into **separate state slices** merged in a `useMemo`. Do not collapse those slices back into one shared mutable map — the separation exists specifically to avoid `clear()` races between snapshot callbacks (`ME-3`).

## Service layer conventions

Every file in [src/services/](src/services/) follows the same contract, and new code is expected to match it:

- **Zod validation at every write boundary** — `Schema.parse(form)` before the write, so bad shapes throw before hitting Firestore.
- `serverTimestamp()` for `createdAt`/`updatedAt` — never `new Date()` for those.
- **No `orderBy()` in queries; sort client-side in the subscribe callback.** Deliberate, to avoid a composite index per query. The exceptions are the paths that do have indexes (roadmap queries, `notifications`, admin `tasks`).
- `subscribeToX(onData, onError)` returns the unsubscribe function; providers/hooks return it from `useEffect`.
- Errors: `console.error('[serviceName] functionName:', err)` then re-throw.

## Firestore data model

| Path | Write access | Notes |
|---|---|---|
| `users/{uid}` | Self (safe fields only) / admin | Self-update **denies** `role, uid, email, salaryBase, department, designation` and the three FCM keys. Create must be `role: 'employee'` and is blocked for mapped secondary emails. |
| `users/{uid}.fcmToken(s)` | Self, own branch only | `fcmToken`, `fcmTokens`, `fcmTokenUpdatedAt` have a **separate** update branch guarded by `hasOnly` — a write touching anything else alongside them is rejected. |
| `allowed_emails/{email}` | Admin | Read restricted to your own email (anti-enumeration, `CR-5`). |
| `user_email_map/{email}` | Admin | Same read restriction. |
| `tasks/{taskId}` | See below | `isAdminTask` distinguishes assigned vs personal tasks. |
| `tasks/{taskId}/events/{id}` | Task participants | Timeline: `partner_added`, `status_changed`, `progress_updated`, `commit`. `authorUid` must equal `getEffectiveUid()`. |
| `announcements/{id}` | Admin; anyone may append to `isRead` | Read-receipt array. |
| `notifications/{uid}/items/{id}` | Anyone, heavily constrained | See "Notifications". |
| `leaves`, `attendance/{uid}/records`, `candidates`, `performances` | HRMS; owner-or-admin patterns | Attendance records are owner-write only; admin can read all and delete. |
| `kpi_industries`, `kpi_clients`, `kpi_products`, `kpi_sales`, `kpi_patents` | Admin write, all-read | `kpi_patents` doubles as general IP (`ipType`: Patent / Trademark / Software-Calculator). |
| `roadmapNodes/{id}` + `tasks`/`comments`/`history`/`attachments` subcollections | See "Roadmap" | |

**Task update rules are field-scoped.** An assignee may write anything *except* `title, description, assignedTo, startDate, priority, module, isAdminTask`; any participant may write *only* `workPartners, workPartnerUids, updatedAt`. When adding a field to a task, decide which bucket it belongs in or the write will be rejected in production but pass locally against an admin account.

**Work partners are stored twice** ([src/services/collaborationService.js](src/services/collaborationService.js)): `workPartners` (array of rich objects, what the UI renders) and `workPartnerUids` (flat string array, what rules can actually test — CEL cannot query into an array of maps). Both must be updated in the same `updateDoc` via `arrayUnion`/`arrayRemove`. Never render `workPartnerUids`.

Composite indexes live in [firestore.indexes.json](firestore.indexes.json) — 8 of them, mostly roadmap queries (`parentId+isArchived+order`, `ancestorIds` array-contains, collectionGroup `tasks` and `history`). A new roadmap query almost certainly needs an entry there.

**`fieldOverrides` in that file is destructive — read this before touching it.** `firebase deploy --only firestore:indexes` treats the array as the *complete* set of single-field overrides for the project: anything live but absent from the file is **deleted**. Adding one entry therefore silently drops every other field's exemption. That is exactly how it went wrong once — adding a `tasks.dueDate` override removed the `tasks.assignedTo` `COLLECTION_GROUP`/`CONTAINS` exemption, and the `collectionGroup('tasks').where('assignedTo','array-contains',uid)` listener in `TaskContext` started failing with `failed-precondition` in production. Before editing the array, list what is actually live (`npx firebase-tools firestore:indexes`, or the Firestore Admin API `collectionGroups/{cg}/fields?filter=indexConfig.usesAncestorConfig:false`) and restate all of it.

Two related traps in the same area:

- A **composite** index does not serve a single-field `array-contains` query. Index 5 (`assignedTo + status`) looks like it covers the `assignedTo`-only listener; it does not — that needs its own `CONTAINS` single-field index.
- Automatic single-field indexes are **`COLLECTION`-scoped only**. Any `collectionGroup()` query filtering on a single field needs an explicit `COLLECTION_GROUP` entry, and declaring one replaces the automatic `COLLECTION` ones, so restate those too.

Symptom to recognise: `The query requires a COLLECTION_GROUP_CONTAINS index` in the browser console. The `TaskContext` listener degrades gracefully (`setRoadmapAssignedTasks([])`, `setLoading(false)`), so the Dashboard renders and only roadmap tasks whose root-`tasks` mirror write failed go missing — quiet enough to survive a casual look.

`firestore.rules.roadmap.draft` at the repo root is a superseded draft — the live rules are in `firestore.rules`. Don't edit the draft.

## The Roadmap module

Hierarchy is **materialized** on each node: `parentId`, `path`, `ancestorIds[]`, `depth`, `order`. Use `computeHierarchy()` in [src/services/roadmapService.js](src/services/roadmapService.js) rather than deriving these ad hoc. Tree expansion subscribes per-node on expand and unsubscribes on collapse ([src/hooks/useRoadmapTree.js](src/hooks/useRoadmapTree.js), which keeps a ref alongside state so `toggleExpand` has a stable identity and `React.memo` on the node cards actually holds).

**Sibling ordering is by `dueDate`, and `order` is a dead field.** `subscribeToChildren` is the single funnel for every roadmap list — root milestones ([src/context/RoadmapContext.jsx](src/context/RoadmapContext.jsx)), List-view expansion ([src/hooks/useRoadmapTree.js](src/hooks/useRoadmapTree.js)) and Journey view ([src/components/Roadmap/RoadmapJourneyView.jsx](src/components/Roadmap/RoadmapJourneyView.jsx)) — so `sortNodesByDueDate` there fixes all three at once. It used to sort by the `order` field, which *looks* like an insertion counter but nothing ever writes: `createNode` defaults it to `0` and no caller (`RoadmapNodeModal` included) passes a value, so every node carries `order: 0` and the comparator was a no-op — siblings rendered in raw Firestore snapshot order, which reads as random. The tiebreak chain is now `dueDate → order → title → id`: undated nodes sink below every dated one (a node with no deadline has no place on a timeline), `order` stays honoured so a future manual-ordering feature needs no change here, and `title`/`id` are what actually decide undated siblings — without them they fall back to document-ID order, which can shift between loads. A parent milestone with no `dueDate` of its own therefore lists alphabetically; set a due date on it to place it on the timeline. `subscribeToRoadmapTasks` sorts the same way (`dueDate → createdAt → title`) — `createdAt` alone is not enough because `serverTimestamp()` is null on the local echo of a just-created doc.

**Journey view geometry: the SVG viewBox height must equal the container height.** The winding path is drawn with `preserveAspectRatio="none"` and x in 0–100 (percent), so the y axis must stay 1:1 or the curve stretches off the level circles. It previously used `viewBox="0 0 100 {count * ROW_HEIGHT}"` on an element sized to `containerHeight` *and* an inline `top: 48`, which put the path 51px low at the first node and ~96px out by the middle — the dotted line never touched a circle. `PATH_TOP`, `CIRCLE_R` and `FOOT_ROOM` are now shared by both the layout and `centerFor()`; keep them that way. Two related traps: the "You are here" badge is absolutely positioned because in the flex flow it pushed its own circle off the path, and `stats.currentIndex` falls back to the first non-completed level (plain `findIndex('in-progress')` marked nothing on a fresh milestone, which is the normal state).

**Progress rollup runs twice, on purpose.** `recomputeNodeRollup()` runs client-side after every roadmap task create/update/delete so the UI updates without waiting on a function cold start, and `onRoadmapTaskWrite` recomputes the same value authoritatively. Both are idempotent — whichever lands second sees the rounded value unchanged and skips its write, and both walk the ancestor chain capped at 10 levels. That is why the `roadmapNodes` update rule keeps its non-admin carve-out limited to `hasOnly(['progress','childCompletedCount','status','updatedAt'])`: remove it and the client half is silently rejected for an employee completing their own task, so progress visibly lags until the function catches up.

**The History tab needs the functions deployed.** `history` is `allow write: if false` for all clients; only `onRoadmapNodeHistory` / `onRoadmapTaskHistory` write it, via the Admin SDK. [src/services/roadmapHistoryService.js](src/services/roadmapHistoryService.js) is read-only by design — do not "fix" an empty log by writing history from the client; that would require weakening the audit-trail rule. Entries carry a denormalized `nodeId` so index 6 (collectionGroup `history`: `nodeId` + `timestamp`) can serve cross-node activity queries. History starts from the deploy forward — it is not backfilled.

**Phase 23 mirror-write.** Roadmap tasks are written twice: to `roadmapNodes/{nodeId}/tasks/{taskId}` **and** to root `tasks/{taskId}` with the same document ID, plus `roadmapNodeId`, `_mirrorOf: 'roadmap'`, and `workPartnerUids: []` ([src/services/roadmapTaskService.js](src/services/roadmapTaskService.js)). The mirror is what makes roadmap work show up on the Dashboard and Calendar. Mirror writes are best-effort — a failure logs a warning and does not fail the primary write, so the two can drift. Only `title, description, status, priority, progress, assignedTo, dueDate, completionNote` are synced on update. Anything that changes roadmap task shape must update `MIRROR_SYNC_FIELDS` too.

**What a missing mirror actually looks like, and the delete trap it exposes.** A roadmap task whose mirror write failed exists *only* at `roadmapNodes/{nodeId}/tasks/{taskId}`. It still shows on the Dashboard, because `TaskContext` queries the source via `collectionGroup('tasks')` rather than the mirror — but it is absent from root `tasks`, so a console query on `/tasks` finds nothing and the Admin Panel's Task Monitor never lists it. Such a task also has `nodeId` but no `_mirrorOf`/`roadmapNodeId`, which is how to tell source from mirror. The trap: `handleDelete` in [src/components/Calendar/TaskDetailModal.jsx](src/components/Calendar/TaskDetailModal.jsx) only does `deleteDoc(doc(db, 'tasks', task.id))`, and Firestore resolves a delete of a non-existent document as success — so the modal closes with no error and the task reappears on refresh. Deleting a roadmap task must go through `deleteRoadmapTask(nodeId, taskId)`, which removes source *and* mirror and recomputes the rollup; the Roadmap task card is currently the only UI that does. **This is a known open bug** — the modal has not been taught to route roadmap tasks yet.

To find a task when you only have its title, prefer the app's own data over the console: React DevTools → the `TaskDetailModal` component → `props.task` gives `id`, `nodeId`, `isAdminTask`, `_mirrorOf`, `createdBy` in one place. In the Firestore console, note that automatic single-field indexes are **`COLLECTION`-scoped only** (the Indexes → Automatic tab shows collection-group scope Disabled for Ascending/Descending/Arrays), so a `collectionGroup('tasks').where('title','==',…)` probe fails with *requires a COLLECTION_GROUP_ASC index*. Reuse the `tasks.assignedTo` COLLECTION_GROUP/CONTAINS exemption that already exists instead of adding a new one — see the `fieldOverrides` warning above for why adding entries is dangerous.

Calendar dedup interacts with the mirror: `getRoadmapCalendarEvents()` returns a `dedupTaskIds` set so a leaf node and its single task don't both render, but [src/components/Calendar/CalendarView.jsx](src/components/Calendar/CalendarView.jsx) explicitly exempts `_mirrorOf === 'roadmap'` tasks from that filter. Changing one side without the other produces either duplicate or missing calendar entries.

## Cloud Functions

Ten functions, all **v2** (`firebase-functions` 7, whose root export *is* the v2 namespace — `functions.firestore.document` and `functions.pubsub.schedule` do not exist there, which is why the original v1 code threw at module load and nothing could deploy). Runtime is Node 22, `maxInstances: 10`, set once via `setGlobalOptions` in [functions/index.js](functions/index.js).

**The region split is deliberate — do not "tidy" it into one region.**

| | Region | Why |
|---|---|---|
| 8 triggers + `askGemini` | `asia-south2` | The Firestore database lives in `asia-south2` (Delhi). Firestore triggers create their Eventarc trigger in the *database's* region no matter where the function runs, so anything else means a cross-region hop plus egress on every document the rollup and history triggers read. |
| `onDueDateApproach`, `roadmapDeadlineCheck` | `asia-south1` | **Cloud Scheduler has no `asia-south2` presence.** Deploying a scheduled function there fails with `Location 'asia-south2' is not a valid location`. `asia-south1` (Mumbai) is the nearest supported region; the cross-region reads are irrelevant for a once-a-day scan. |

Both crons carry an explicit `region: 'asia-south1'` in their own options, overriding the global default.

| Function | Trigger | Does |
|---|---|---|
| `onTaskCreate` | `tasks/{id}` created | Push to assignees (skips the creator) |
| `onTaskUpdate` | `tasks/{id}` updated | Push on **status change only**; skips `updatedBy` when present |
| `onAnnouncementCreate` | `announcements/{id}` created | Push to every registered device |
| `onDueDateApproach` | cron 09:00 IST | Bell entry + push for root tasks due tomorrow |
| `roadmapDeadlineCheck` | cron 09:15 IST | Bell entry + push for roadmap tasks due tomorrow / overdue |
| `onRoadmapTaskWrite` | `roadmapNodes/{n}/tasks/{t}` written | Node progress rollup (transaction) |
| `onRoadmapNodeProgressChange` | `roadmapNodes/{n}` written | Ancestor progress propagation |
| `onRoadmapNodeHistory` / `onRoadmapTaskHistory` | same paths | Audit-history writes |
| `askGemini` | callable | Unused by the SPA (it calls `/api/gemini` on Vercel); kept as a non-Vercel fallback |

Shared modules, all required rather than duplicated: [functions/adminApp.js](functions/adminApp.js) is the **single** `initializeApp()` call (previously `index.js` and `roadmapDeadlineCheck.js` each initialised independently, which breaks depending on load order); [functions/fcm.js](functions/fcm.js) owns token lookup, batched `sendEachForMulticast`, and **automatic pruning of dead tokens**; [functions/time.js](functions/time.js) owns IST day boundaries.

**No legacy `admin` namespace anywhere in `functions/`.** `firebase-admin` 14 removed it: `require('firebase-admin')` still resolves, but `admin.apps`, `admin.firestore` and `admin.messaging` are all `undefined`. A single `admin.apps.length` is enough to throw at module load, and the deploy then fails with the unhelpful *"User code failed to load. Cannot determine backend specification"* — the real TypeError only appears a few lines above it. Always import from `firebase-admin/app`, `firebase-admin/firestore`, `firebase-admin/messaging`; `adminApp.js` re-exports `db`, `FieldValue`, `Timestamp` and `getMessaging` so nothing else needs to. `roadmapService.server.js` takes `FieldValue` as its third parameter for the same reason (it used to take `admin`).

**Why time.js exists.** Function containers run on a UTC clock but the company is on IST, so `new Date().getDate()` inside a function is the *previous* calendar day for ~5.5 hours every night. `dueDate` is written client-side as `new Date('YYYY-MM-DD')` — UTC midnight of the picked day — so the correct query boundary is "UTC midnight of the **Indian** calendar day", which is what `istTodayUtcMidnight()` returns. Do not reach for `new Date()` arithmetic in a scheduled function.

The pure rollup math lives in `functions/roadmapService.server.js` (CommonJS) and is unit-tested from `src/` via `createRequire` — keep it dependency-free so that keeps working.

Two cost guards worth knowing before you change a query:

- `roadmapDeadlineCheck`'s overdue scan is bounded to `OVERDUE_LOOKBACK_DAYS` (30). Without a lower bound it re-reads and re-notifies about *every* task that has ever slipped, every single day.
- `onDueDateApproach` filters `status !== 'completed'` **in memory** rather than in the query. Combining that with a `dueDate` range means two inequality fields, which needs its own composite index and `orderBy` — not worth it for one day's worth of tasks.

## Notifications

Two independent channels. They are **not** redundant and neither replaces the other: the bell is what a user with the app open sees, push is what reaches a user whose tab is closed.

**In-app (client-written).** `notifications/{uid}/items`, written by [src/services/notificationService.js](src/services/notificationService.js), read by the Navbar bell, plus a foreground browser `Notification` for the acting user's own session. Rules constrain creation tightly (`CR-6`): `senderUid` **must** equal `getEffectiveUid()`, `read` must be `false`, `type` must be one of eleven enum values, `title` <= 200 and `message` <= 500 chars. Passing the wrong `senderUid` — or omitting it — is the usual cause of a silently rejected notification. Use `ROADMAP_NOTIF_TYPES` and the existing helpers rather than raw strings; adding a new type means editing the enum list in `firestore.rules` too. The two crons write here as well, with `senderUid: 'system'` — legal because the Admin SDK bypasses rules entirely.

**Background push (FCM).** Four pieces, and it only works when all four are present — this is what was missing while the project sat on Spark:

1. [public/firebase-messaging-sw.js](public/firebase-messaging-sw.js) — required at exactly that origin path. A service worker cannot read `import.meta.env`, and Vite copies `public/` verbatim, so the Firebase config is passed **through the registration URL's query string** and read back off `self.location`. Bump `SW_VERSION` in `pushService.js` to force a re-install.
2. [src/services/pushService.js](src/services/pushService.js) — `isSupported()` feature detection (not a bare `getMessaging()` in a try/catch, which does not reliably throw), permission prompt, SW registration, `getToken({ vapidKey, serviceWorkerRegistration })`, and the Firestore write. `AuthContext` calls `enablePushNotifications(targetUid)` on login and `disablePushNotifications` on sign-out so a shared machine stops receiving the previous user's push.
3. `users/{uid}.fcmTokens` (array, multi-device) plus `fcmToken` (latest, read as a fallback for older documents). The `users` update rule has a **dedicated branch** for these three keys with `hasOnly` — they stay in the general branch's deny list so they can never ride along with an unrelated profile edit.
4. `VITE_FIREBASE_VAPID_KEY` in `.env` **and in Vercel**. Missing it makes `enablePushNotifications` return `no-vapid-key` and fall back to foreground-only notifications.

`functions/fcm.js` prunes tokens that come back `registration-token-not-registered`, so `fcmTokens` does not accumulate dead devices.

## AI assistant

[src/components/AIAssistant/AIAssistantButton.jsx](src/components/AIAssistant/AIAssistantButton.jsx) -> [src/services/gemini.js](src/services/gemini.js) -> `POST /api/gemini`. The client injects the user's task summary into the system prompt and attaches a fresh Firebase ID token (`auth.currentUser.getIdToken()`). [api/gemini.js](api/gemini.js) verifies that token with the Admin SDK, applies a 30-req/min per-UID in-memory rate limit, restricts CORS to a single origin (`ALLOWED_ORIGIN`, default `https://airbuddy-workspace.vercel.app`), caps message/prompt lengths and the last 20 history turns, then calls `gemini-2.5-flash-lite`. If `FIREBASE_SERVICE_ACCOUNT` is missing it returns 503 rather than serving unauthenticated traffic (`CR-4`) — so a local `/api/gemini` will 503 until that env var is set. The assistant is intentionally read-only; it points users at the UI for mutations. `functions/index.js` also has an `askGemini` callable, unused by the client and undeployed.

## UI conventions

Tailwind with a fixed dark palette in [tailwind.config.js](tailwind.config.js) (`background`, `surface`, `surfaceHover`, `border`, `orange`, `text-primary/secondary/muted`, `status-*`) plus component classes in [src/index.css](src/index.css) (`.card`, `.card-hover`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.input-field`, `.select-field`, `.badge-*`, `.sidebar-link*`, `.progress-bar`). Use these rather than raw hex or ad-hoc utility stacks.

[src/components/shared/Modal.jsx](src/components/shared/Modal.jsx) is the shared dialog: a bottom sheet under 640px, a centred dialog above, with body-scroll locking. New modals should use it instead of hand-rolling a fixed overlay.

[src/context/ViewModeContext.jsx](src/context/ViewModeContext.jsx) provides a global card/table toggle persisted to `userProfile.viewMode`, with pending-write tracking to prevent flicker. Panels that list records (Dashboard, KPI panels, Work Partner) are expected to honour `useViewMode()`.

Sidebar navigation is a hardcoded `navItems` array plus role-gated sections in [src/components/shared/Sidebar.jsx](src/components/shared/Sidebar.jsx) — a new route needs an entry there **and** a guard in `App.jsx`; the sidebar hiding a link is not access control.

## Tests

Vitest, service- and util-level only — no jsdom and no component tests, so don't add a `.jsx` test expecting a DOM. The pattern: `vi.mock('firebase/firestore', ...)` with stubbed `addDoc`/`onSnapshot`/`serverTimestamp`, `vi.mock('../services/firebase', () => ({ db: {} }))`, then import the module under test **after** the mocks. Coverage is concentrated on Zod boundaries, roadmap pure functions (`computeHierarchy`, `computeTaskProgress`, `getRoadmapCalendarEvents`, `sortNodesByDueDate`), and timezone regressions.

Sort order inside a `subscribeToX` callback is testable without jsdom: pull the callback back out of the mocked `onSnapshot` (`onSnapshot.mock.calls.at(-1)[1]`) and invoke it with a fake snapshot (`{ docs: [{ id, data: () => ({...}) }] }`). `subscribeToRoadmapTasks` is covered that way. Where the sort is a standalone function, export it for testing instead — the `computeHierarchy` precedent.

## Gotchas worth knowing

**Dates.** Never derive a calendar date with `toISOString().slice(0,10)` — it yields the previous day for UTC+ users (an IST user at 00:15 is 18:45 UTC the day before), which broke attendance punch-in matching, and later the Dashboard's "last 30 days" custom-range pre-fill. Use `toLocalDateString()` from [src/utils/dateHelpers.js](src/utils/dateHelpers.js) — the single implementation; `getLocalDateString` in [src/services/hrmsService.js](src/services/hrmsService.js) is now just a local alias delegating to it. `toDate()` in the same file normalizes Firestore `Timestamp` | `Date` | string and is what every formatter goes through.

**Lint scope and the warnings that are deliberate.** `npm run lint` is `eslint .`, which covers `scripts/` — `npx eslint src/` does not, so a clean `src/` run can hide real errors. Every non-browser directory needs its own globals block in [eslint.config.js](eslint.config.js): `api/**` and `scripts/**` get `globals.node` (without it, `process.argv`/`process.exit` in the admin-SDK scripts are `no-undef` errors and `npm run lint` exits non-zero), `public/**` gets service-worker globals as classic scripts. `scripts/` is linted rather than globally ignored like `dist/` and `functions/` precisely because it runs against production Firestore with admin privileges. The ~49 remaining warnings are a settled decision, not a to-do: `react-hooks/set-state-in-effect` and `react-refresh/only-export-components` are downgraded to `warn` in the config with the reasoning inline — `setLoading(true)` before a Firestore subscription and context files exporting both a provider and its hook are the house patterns, spread across ~35 files. Do not "fix" them wholesale.

**Permissions are enforced twice.** [src/utils/permissions.js](src/utils/permissions.js) gates UI affordances; `firestore.rules` is the real boundary. Granting a capability means editing both, and the client helpers check `userProfile.role` directly rather than `isAdmin` from context — intentionally, for consistency across helpers.

**Derived-not-stored values.** KPI progress percentages come from `FILING_STAGE_PROGRESS` / `DEV_STAGE_PROGRESS` maps in [src/context/KpiContext.jsx](src/context/KpiContext.jsx) and are never persisted. Adding a stage means adding it to the map, not to Firestore.

**Docs live in the app.** [src/docs/](src/docs/) markdown is rendered at `/docs` via [src/docs/config.js](src/docs/config.js) (react-markdown + remark-gfm + rehype-slug; `rehype-raw` was removed as an XSS vector — don't add it back). User-facing feature changes belong there as well as in [README.md](README.md). Note the README still describes an older state in places (two roles only, token in `sessionStorage`, FCM push working) — prefer this file and the code.

**Bundle chunks** are hand-partitioned in [vite.config.js](vite.config.js) (`vendor-react`, `vendor-firebase`, `vendor-charts`, `vendor-calendar`, `vendor-utils`, `vendor-ai`). A new large dependency usually needs a rule there; the catch-all is deliberately absent to avoid circular-chunk warnings.

**Issue-tag comments.** `HI-11 fix`, `ME-3 fix`, `CR-6 fix`, `Phase 19` and similar tags mark deliberate, non-obvious choices from past audits. Read the comment before simplifying the code around it — most of them are load-bearing.

**This file is committed.** It used to claim it was gitignored, but `.gitignore` never listed it — only `scripts/`, `.env`/`**/.env`, `serviceAccountKey.json`, `dist/` and `node_modules/` are ignored. Treat edits here as shared with the team, and keep credentials out of it.
