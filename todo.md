# TODO: Per-employee permissions (role-based access)

**Goal:** in the Admin Panel, an admin clicks an employee and chooses what that
person can see and do. The existing **"Viewing as Employee"** toggle stays and
keeps working.

**Status (2026-10-06):** Phases 0–5 and the automated part of Phase 7 are
done in code, **not deployed, not committed**. What is left is in
[**Your steps**](#your-steps-manual) at the bottom.

> **The one rule to remember:** hiding a link in the sidebar is not access
> control. Every permission is also enforced in `firestore.rules` with
> `can('<key>')`.

---

## Phase 0: Fix first ✅

- [x] **Salary moved out of `users/{uid}`** (which every employee can read)
  into `users/{uid}/private/compensation`, admin-only to read *and* write.
  `getEmployeeCompensation` / `setEmployeeCompensation` in
  [hrmsService.js](src/services/hrmsService.js); `salaryBase` removed from the
  users Zod schema; [EmployeeModal.jsx](src/components/HRMS/Directory/EmployeeModal.jsx)
  loads and saves it there.
- [x] One-off migration script: `scripts/migrateSalaryToPrivate.cjs`
  (gitignored, `--dry-run` supported, safe to run twice). **Not run yet.**
- [x] **Admin bounce on refresh fixed.** `AuthContext` keeps `loading` true
  until the first profile snapshot arrives.
- [x] **New fields locked in rules.** `permissions`, `permissionsUpdatedBy`,
  `permissionsUpdatedAt`, `viewScope` are in the self-update deny list; a new
  profile can't be created carrying them or `salaryBase`.

## Phase 1: Data model ✅

- [x] [src/utils/permissionCatalog.js](src/utils/permissionCatalog.js) is the
  single list of keys, with groups, labels, descriptions and presets.
- [x] Stored as `users/{uid}.permissions = { '<key>': true }`; missing = false;
  admins pass everything. No key grants the admin role.

**Keys:** `hrms.directory`, `hrms.attendance`, `hrms.leaves`,
`hrms.recruitment`, `hrms.performance`, `kpi.edit`, `roadmap.edit`,
`tasks.assign`, `tasks.viewAll`, `announcements.post`.

**Changes from the first plan:**
- `admin.panel` was dropped. The Admin Panel opens for anyone with
  `tasks.assign`, `tasks.viewAll` or `announcements.post` and shows only those
  tabs, so nobody can open an empty panel.
- `kpi.view` was not added, because every employee can see KPI today.
  Adding it would hide KPI from everyone until granted. **Your decision, see
  below.**
- `hrms.leaves` (approve leaves) was added as its own key.

## Phase 2: Client permission check ✅

- [x] `hasPermission(userProfile, key)` in [permissions.js](src/utils/permissions.js).
- [x] `can(key)` from `useAuth()`: admin → true, admin in "Viewing as
  Employee" → false, employee → granted keys.
- [x] `isAdmin`, `realIsAdmin`, `isEmployeeView`, `toggleEmployeeView` unchanged.
- [x] Tests: `src/utils/permissions.test.js`.

## Phase 3: Routes and sidebar ✅

- [x] `PermissionRoute` in [App.jsx](src/App.jsx) replaces `AdminRoute`; one per
  HRMS page, and `/admin` takes any of the Admin Panel permissions.
- [x] [Sidebar.jsx](src/components/shared/Sidebar.jsx) shows each link by `can()`.
- [x] Pages: Attendance, Leaves (approvals), Recruitment, Performance, the five KPI
  panels, Roadmap edit (`canEditRoadmapStructure`), Dashboard employee filter,
  Calendar (everyone's leaves/tasks) and `TaskContext` all use the matching key.
  Roadmap comment/attachment *moderation* stays admin-only.

## Phase 4: Admin Panel UI ✅

- [x] New **Permissions** tab ([PermissionsManager.jsx](src/components/Admin/PermissionsManager.jsx)),
  real admins only. Card/table view, search, "By employee" / "By permission"
  views.
- [x] Click an employee → modal (shared `Modal.jsx`): grouped checkboxes with
  descriptions, Select all per group, presets (HR / Sales / Manager / None),
  copy from another employee, "Last changed by … on …", error shown in the
  modal.
- [x] Other tabs gated by permission; Delete and **Sync now** in Task Monitor,
  Employee Management and Permissions stay admin-only.

## Phase 5: Service and rules ✅

- [x] [permissionService.js](src/services/permissionService.js): Zod, writes the
  complete map plus `permissionsUpdatedBy/At`. Tests included.
- [x] `can(key)` helper in [firestore.rules](firestore.rules), used for:
  tasks read (`tasks.viewAll`) and assigned-task create (`tasks.assign`);
  announcements create/delete; leaves read-all/approve; attendance read-all;
  candidates read/write (**no longer readable by every employee**);
  performances; all five `kpi_*` writes; `roadmapNodes` create/edit/delete.
- [x] Rules compile in the emulator.

## Phase 6 (optional, not started): "Who can see whose data"

For "employee A can see B's and C's tasks/attendance but nobody else's".
`viewScope` is already reserved and locked in the rules. Do this only after
0–5 are live and checked.

## Phase 7: Test, document, ship

- [x] `npm test`: 421 passed. `npm run lint`: 0 errors (same 51 warnings).
  `npm run build`: OK.
- [x] Rules tested **as employees** in the emulator:
  `src/services/permissions.rules.emulator.test.js` (14 tests) plus the
  existing MCP rules test (8); all 22 pass.
- [x] Docs: [src/docs/permissions.md](src/docs/permissions.md) (shown at
  `/docs/permissions`) and CLAUDE.md updated.
- [ ] Browser check, deploy, migration: see below.

---

## Your steps (manual)

Do these **in this order**:

1. **Decide on KPI.** Should KPI pages stay visible to every employee (current
   behaviour), or need a `kpi.view` permission?
2. **Browser check on `npm run dev`** (admin account):
   1. Hard-refresh `/admin` → you stay on the Admin Panel.
   2. Admin Panel → **Permissions** → click an employee → tick
      "Employee Directory" → Save. Ask them to look (or use a test account): the
      Directory link appears without a reload, and no salary is shown.
   3. Untick it → the link disappears; typing `/hrms/directory` sends them to
      the Dashboard.
   4. Sidebar → **Preview as Employee** on → plain employee view, no
      Permissions tab; off → everything is back.
   5. HRMS → Directory → edit an employee → Salary field still loads and saves.

   > `npm run dev` talks to the live database, which still has the old rules.
   > So 2.1 and 2.4 can be checked right away; 2.2, 2.3 and 2.5 only work after
   > steps 3 and 4 (until then the salary field shows "Could not load salary").
3. **Deploy the rules first:**
   `npx firebase-tools deploy --only firestore:rules`
4. **Move the salaries:**
   `node scripts/migrateSalaryToPrivate.cjs --dry-run`, check the list, then
   run it again without `--dry-run`.
5. **Then the website:** commit, push, and `npx vercel --prod`. If the website
   goes first, existing salaries look empty and saving permissions fails.

## Found along the way (not fixed, separate issues)

- **"Add Employee" in the Directory has never worked.** `EmployeeModal` calls
  `addEmployee(payload)`, but the function is `addEmployee(uid, data)`.
- `storage.rules`: roadmap attachments are open to any signed-in Google
  account (from the earlier codebase review).
