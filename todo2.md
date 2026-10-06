# TODO 2: MCP connector with permissions, read and write only

**Goal:** each employee's own Claude can work with WorkSpace only as far as
their access allows (**employee**, **admin**, or **custom permissions** an admin
grants). Through Claude, **nobody can delete or remove anything**, admins
included.

**Status (2026-10-06):** Parts A–C are done. The code is committed
(`030fd78 Permission-gated MCP tools`). The doc changes (Part C) are **not
committed yet**. What's left is **Part D: Your steps**, in order.

> **Two rules to remember**
> 1. Hiding a tool is not access control. `firestore.rules` (`can('<key>')`) is
>    the real boundary, for the web app and for Claude alike.
> 2. The connector only reads and writes. Deleting or removing things is done
>    in the web app.

---

## Part A: Already done before this (permissions system, `f371a95`) ✅

- [x] Salary moved to `users/{uid}/private/compensation` (admin-only).
- [x] `src/utils/permissionCatalog.js`: the 10 permission keys
  (`hrms.*`, `kpi.edit`, `roadmap.edit`, `tasks.assign`, `tasks.viewAll`,
  `announcements.post`) and presets.
- [x] `can(key)` in `AuthContext` and in `firestore.rules`.
- [x] Routes, sidebar and pages gated with `can()`.
- [x] Admin Panel → **Permissions** tab.
- [x] Tests: unit tests plus `permissions.rules.emulator.test.js`.
- [x] `airbuddy-mcp` 0.1.0 (local Claude connector) built earlier (`ca78300`).

## Part B: MCP problems found and fixed (this change) ✅

What was wrong in 0.1.0:

| # | Problem | Fix |
|---|---|---|
| 1 | The MCP only knew `admin` or `employee`. It ignored the new custom permissions, so an employee with **Edit roadmap** was still told "Only admins can create milestones". | Tools now check `hasPermission(me, key)`, the same logic as the web app. |
| 2 | An employee with **See all tasks** couldn't list a teammate's work. | `list_my_work` with `assignee` now needs `tasks.viewAll` instead of the admin role. |
| 3 | There was no way to assign a task, even with **Assign tasks**. | New tool `assign_task` (`tasks.assign`). It writes exactly what Admin Panel → Assign Task writes, and the server sends the notification, push and Calendar event. |
| 4 | Removal tools existed: `delete_checklist_item`, `remove_work_partner`, `update_milestone` with `remove_assignees` and clearing a date with `null`. | All removed, **for everyone including admins**. |
| 5 | Nothing stopped a future tool from deleting things. | `assertNoRemoval()` in `mcp/src/firestore.js` runs on **every** write and refuses: deleting a document, deleting a field, removing from an array. |
| 6 | A permission change took up to 5 minutes to reach Claude. | Your profile is now cached for 60 seconds. |
| 7 | `whoami` didn't say what you are allowed to do. | It now returns role, granted permissions, what they unlock and what is never allowed. |

Done:

- [x] `mcp/src/workItems.js`: `hasPermission`, `PERMISSION_KEYS`,
  `TOOL_PERMISSIONS`, `MODULE_OPTIONS`; `canRemovePartner` deleted.
- [x] `mcp/src/workspace.js`: `requirePermission(key)`; `roadmap.edit` covers
  any milestone; `assignTask()`, `capabilities()`; `removeWorkPartner()` and
  `deleteTodo()` deleted; `updateMilestone()` only adds.
- [x] `mcp/src/tools.js`: 17 tools, none destructive; the descriptions name the
  permission each one needs.
- [x] `mcp/src/cli.js`: Claude's instructions explain the permissions and the
  no-delete rule.
- [x] Version **0.2.0**; tarball built: `mcp/airbuddy-workspace-mcp-0.2.0.tgz`.

### Who can do what through Claude now

| Action | Employee | With permission | Admin |
|---|---|---|---|
| Read own work, roadmap, team | ✅ | ✅ | ✅ |
| Progress / due date / checklist / partners / updates on **own** work | ✅ | ✅ | ✅ |
| Comment on a milestone, create a personal task | ✅ | ✅ | ✅ |
| Progress / dates / partners on **any** milestone | ❌ | `roadmap.edit` | ✅ |
| Create or edit milestones, add assignees | ❌ | `roadmap.edit` | ✅ |
| Assign a task to someone | ❌ | `tasks.assign` | ✅ |
| See somebody else's work | ❌ | `tasks.viewAll` | ✅ |
| **Delete / remove / archive anything** | ❌ | ❌ | ❌ |

### Verified

- [x] `npm test`: **434 passed** (19 files). New: `mcp/src/tools.test.js` fails
  if a delete/remove tool ever comes back.
- [x] Emulator, against the real `firestore.rules`, **as employees**:
  `mcp/src/rules.emulator.test.js` + `permissions.rules.emulator.test.js` →
  **23 passed**. Includes a new "lead" employee holding `roadmap.edit`,
  `tasks.assign` and `tasks.viewAll`.
- [x] `npm run lint`: 0 errors (same 51 accepted warnings). `npm run build`: OK.
- [x] Started the 0.2.0 server and called it like Claude does: 17 tools listed,
  none destructive; `whoami` works against the live database.

## Part C: Docs ✅ (not committed yet)

- [x] `mcp/README.md`: tools table with who-can-use-it, the no-removal rule.
- [x] `src/docs/claude-connector.md` (the `/docs` page for the team):
  permissions table, "nobody can delete through Claude", install 0.2.0.
- [x] `CLAUDE.md`: Claude connector section, test count.
- [x] Sidebar: the separate **Connect Claude** link is removed. The setup guide
  now lives in one place only: **Documentation → Connect your Claude**
  (`/docs/claude-connector`). The `/connect/claude` page stays, because
  `airbuddy-mcp login` opens it during sign-in.

---

## Part D: Your steps (manual)

Do these **in this order**. Skip any step you have already done.

### Step 1: Commit the docs
`CLAUDE.md`, `mcp/README.md`, `src/docs/claude-connector.md`, and this file.

### Step 2: Finish the permissions rollout (from the old todo, if not done yet)
The MCP permission checks depend on these being live.

1. Deploy the rules: `npx firebase-tools deploy --only firestore:rules`
2. Move the salaries: `node scripts/migrateSalaryToPrivate.cjs --dry-run`, check
   the list, then run it again without `--dry-run`.
3. Deploy the website: `npx vercel --prod`

### Step 3: Update the connector on **your own** computer first
Your Claude is still running **0.1.0, which still has the delete tools**.

```powershell
cd D:\Code\Work_flow\mcp
npm install -g .
airbuddy-mcp status        # should say: Signed in as ... (admin)
```

Then **restart Claude** (Claude Code: close and reopen; Desktop: quit fully).

### Step 4: Check it as yourself (admin)
Ask your Claude:
1. *"What can you do for me in WorkSpace?"* → role `admin`, all permissions,
   "never allowed: deleting or removing anything".
2. *"Delete checklist item 1 on <some task>"* → Claude says it can't; do it in
   the app.
3. *"Remove <name> as work partner from <task>"* → same.

### Step 5: Check it as an employee (the important test)
An admin account passes everything, so this is what proves the restrictions.

1. Use a test employee account (or a teammate's computer, with their OK).
2. Admin Panel → Permissions → that employee → **no** permissions.
3. On their computer: install 0.2.0, `airbuddy-mcp login`, restart Claude.
4. Ask Claude: *"create a milestone called Test under <root>"* → refused, says
   it needs `roadmap.edit`.
5. Ask: *"show Archit's work"* → refused, needs `tasks.viewAll`.
6. Ask: *"set my task <X> to 50%"* → works.
7. Now grant **Edit roadmap** in the Admin Panel. Wait 1 minute. Ask step 4
   again → works. Archive the test milestone afterwards **in the web app**.
8. Revoke it again → within a minute Claude is refused again.

### Step 6: Roll out to the team
1. Share `mcp/airbuddy-workspace-mcp-0.2.0.tgz` (Drive/Slack). Delete the old
   `airbuddy-workspace-mcp-0.1.0.tgz` so nobody installs it by mistake.
2. Each person follows `/docs/claude-connector` in the app:
   `npm install -g airbuddy-workspace-mcp-0.2.0.tgz` → `airbuddy-mcp login` →
   add to Claude → restart Claude.
3. Anyone who installed 0.1.0 **must** upgrade: it still has the delete tools.
4. Set each person's permissions in Admin Panel → Permissions **before** they
   start using it.

### Step 7: Decide on the open questions
1. **KPI view:** should KPI pages stay visible to every employee, or need a new
   `kpi.view` permission? (Carried over from the old todo.)
2. **More tools for Claude?** Today the connector covers tasks and roadmap
   only. The other permissions (HRMS, KPI, announcements) have no tool yet, so
   they grant nothing in Claude. See Part E.

---

## Part E: Next steps (optional, later)

Each one must follow the same rules: a permission check in the MCP, the same
`can()` in `firestore.rules`, **read or write only, never delete**, and an
emulator test as an employee.

- [ ] **Read-only tools first** (safest, most useful):
  `list_announcements` (everyone), `my_leaves` (own), `team_leaves`
  (`hrms.leaves`), `my_attendance` (own), `kpi_summary` (everyone).
- [ ] **Write tools after that:** `apply_leave` (everyone, own),
  `approve_leave` (`hrms.leaves`), `post_announcement` (`announcements.post`),
  KPI add/edit (`kpi.edit`). Each one copies its web-app service function.
- [ ] **Firebase App Check / server-side enforcement:** the no-delete rule is
  enforced in the connector. The same login token could still delete through
  the raw REST API wherever the web app also allows it. If you want "no delete"
  at the database level too, that means changing `allow delete` in
  `firestore.rules`, which also removes delete from the **web app**. That is a
  separate decision.
- [ ] **A remote (hosted) connector** so the team can use WorkSpace from
  claude.ai in the browser and on the phone, not only Claude Desktop/Code. See
  the Claude subscription notes below. Big job: it needs hosting and a proper
  OAuth sign-in. Keep the same rule: user's own token, never `firebase-admin`.

## Known bugs (not MCP, still open)

- Deleting a roadmap task from `TaskDetailModal` silently does nothing (see
  CLAUDE.md).
- "Add Employee" in the Directory has never worked (`addEmployee(payload)` vs
  `addEmployee(uid, data)`).
- `storage.rules`: roadmap attachments are open to any signed-in Google account.
- A non-admin with `tasks.assign` can create an assigned task but can't edit its
  progress afterwards unless they are on it (the `tasks` full-update rule is
  `isAdmin()` only). Claude reports the rules refusal clearly. Decide if that's
  intended.

---

## Notes: using Claude across the team

1. **One seat per person, never a shared login.** The connector acts as
   whoever is signed in. A shared account means everyone acts as one person,
   with that person's permissions, and the timeline shows the wrong name. A
   shared login also breaks Anthropic's terms.
2. **Use a Team plan (or Enterprise) on claude.ai** instead of separate
   personal subscriptions: one bill, an admin console to add or remove people,
   and the work stays in the company workspace. Check current plans and prices
   at claude.ai → Settings → Billing; they change.
3. **Use `@airbuddy.in` emails for the seats.** 4 of 9 people are on gmail
   today. Those 4 also get no Google Calendar sync (domain-wide delegation only
   reaches Workspace accounts). Moving them to company emails fixes both.
4. **Who uses which app:**
   - Most people: **Claude Desktop** + the `airbuddy` connector (it can't run
     in the browser, see 6).
   - Developers: **Claude Code** in VS Code, with `CLAUDE.md` in this repo.
5. **Make a shared Project on claude.ai** ("AirBuddy WorkSpace"): put in the
   `/docs` pages and a few standard instructions (e.g. "always post an update
   after changing progress"). Everyone gets the same context.
6. **claude.ai in the browser and on phones can't use this connector**, because
   it's a local program on each computer. To get there, build the remote
   connector from Part E, then an org admin adds it once as a custom connector
   for the whole team.
7. **Revoking access when someone leaves:** remove their Claude seat in the
   Team admin console **and** revoke their Firebase sessions
   (`getAuth().revokeRefreshTokens(uid)`). Revoking the sessions also stops
   their connector immediately.
