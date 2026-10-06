# TODO 2: MCP connector with permissions, read and write only

**Goal:** each employee's own Claude can work with WorkSpace only as far as
their access allows (**employee**, **admin**, or **custom permissions** an admin
grants). Through Claude, **nobody can delete or remove anything**, admins
included.

**Status (2026-10-06, evening):** Parts A–C and Part F are done. The MCP code,
docs and sidebar change are committed (`030fd78`, `2c699ff`, `533ebd3`). The
Part F fixes are **not committed yet**. Of **Part D: Your steps**, steps 2 and 3
were already done; what's left is marked ⬜ below.

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

## Part C: Docs ✅ (committed)

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

### Step 1 ⬜: Commit and push everything that's uncommitted
You do all git. `git status` lists it: the Part F fixes and this file. Pushing `main` is what deploys the website on Vercel, so
after this push the photo fix, Add Employee and the task-delete fix go live for
the team.

### Step 2 ✅: Permissions rollout (already done, checked 2026-10-06)
1. Rules deployed: an admin can read `users/{uid}/private/compensation`,
   which the old rules blocked.
2. Salary migration: nothing to move. No `users` doc has `salaryBase`, and no
   salary was ever saved, so you can skip the script.
3. Website deployed: production already shows Admin Panel → Permissions.

### Step 2b ⬜: Deploy the new storage rules (Part F, fix 3)
```powershell
npx firebase-tools deploy --only storage
```
The first time, the CLI asks to let Cloud Storage read Firestore
(the cross-service rules need it). Answer **Yes**. If you answer no, every
attachment upload and download is refused, so check one in the Roadmap →
Attachments tab afterwards.

### Step 3 ✅: Connector on your computer is 0.2.0
`airbuddy-mcp --version` → `0.2.0`. Restart Claude Code/Desktop once if it was
open from before, so it loads the new tools.

### Step 4 ⬜: Check it as yourself (admin)
Ask your Claude:
1. *"What can you do for me in WorkSpace?"* → role `admin`, all permissions,
   "never allowed: deleting or removing anything".
2. *"Delete checklist item 1 on <some task>"* → Claude says it can't; do it in
   the app.
3. *"Remove <name> as work partner from <task>"* → same.

### Step 5 ⬜: Check it as an employee (the important test)
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

### Step 6 ⬜: Roll out to the team
1. Share `mcp/airbuddy-workspace-mcp-0.2.0.tgz` (Drive/Slack). Delete the old
   `airbuddy-workspace-mcp-0.1.0.tgz` so nobody installs it by mistake.
2. Each person follows `/docs/claude-connector` in the app:
   `npm install -g airbuddy-workspace-mcp-0.2.0.tgz` → `airbuddy-mcp login` →
   add to Claude → restart Claude.
3. Anyone who installed 0.1.0 **must** upgrade: it still has the delete tools.
4. Set each person's permissions in Admin Panel → Permissions **before** they
   start using it.

### Step 7 ⬜: Decide on the open questions
1. **KPI view:** should KPI pages stay visible to every employee, or need a new
   `kpi.view` permission? (Carried over from the old todo.)
2. **More tools for Claude?** Today the connector covers tasks and roadmap
   only. The other permissions (HRMS, KPI, announcements) have no tool yet, so
   they grant nothing in Claude. See Part E.

### Step 8 ⬜: Try "Add Employee" once for real
HRMS → Directory → **Add Employee** → enter a new person's name and email →
Add. It now **approves their email** (needed for a gmail address) and keeps
the department/designation. They show up in the Directory after their first
Google sign-in, with those details already filled in. (Only checked with an
email that's already on the team, which is correctly refused; a real invite
writes to production, so that one is yours to try.)

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

## Part F: Problems found in the browser and fixed (not committed) ✅

Found by opening the app on `localhost:5173` as admin and going through the
pages.

1. **Profile photos broken** in Admin Panel, Directory, Attendance and others
   (alt text spilling over names). Cause: Google refuses `lh3.googleusercontent.com`
   avatar images when the request carries a `Referer` header, and loads them
   without one. Fix: `referrerPolicy="no-referrer"` on the 19 avatar `<img>`
   tags only. Not set site-wide, because a referrer-restricted Firebase API key
   needs that header. Checked: 0 broken photos on `/`, `/admin`, `/team`,
   `/work-partner`, `/hrms/attendance`, `/hrms/directory`, `/kpi`.
2. **"Add Employee" never worked.** A profile is keyed by the Google sign-in
   uid, which doesn't exist before the first sign-in. Fix: `inviteEmployee()`
   in `hrmsService.js` approves the email in `allowed_emails` and keeps the HR
   details there; `AuthContext` copies them into the new profile on first
   sign-in. Refuses an email already on the team. Salary field hidden while
   adding (set it with Edit after they join). No rules change needed. Checked in
   the emulator (`permissions.rules.emulator.test.js`): only an admin can invite,
   the first profile may carry the details, the employee can't change department
   later, nobody else can read the invite.
3. **Roadmap attachments open to any Google account** (`storage.rules` only
   checked "signed in"). Fix: the same `isEmailAllowed()` as `firestore.rules`,
   reading `allowed_emails` across services. Emulator: `@airbuddy.in` ✅, approved
   outsider ✅, unlisted outsider ❌, suspended outsider ❌. **Needs Step 2b.**
4. **Deleting a roadmap task from the task dialog silently did nothing.**
   Fix: `TaskDetailModal` routes roadmap tasks to `deleteRoadmapTask()` (source +
   mirror + progress rollup). Milestones still can't be deleted there. Checked
   the dialog still opens from the Dashboard and the Calendar with no console
   errors (Delete itself not pressed, since it would remove real data).
5. **Sidebar** (committed in `533ebd3`): the duplicate "Connect Claude" link is removed; the guide is only
   under Documentation.

Checks after all fixes: `npm test` 434 passed; emulator rules tests 24 passed;
`npm run lint` 0 errors (same 51 accepted warnings); `npm run build` OK.

## Still open (decisions, not bugs to fix in code)

- A non-admin with `tasks.assign` can create an assigned task but can't edit its
  progress afterwards unless they are on it (the `tasks` full-update rule is
  `isAdmin()` only). Decide if that's intended.
- 4 of the team are on gmail: no Google Calendar sync for them until they get
  `@airbuddy.in` accounts.
- No screen to suspend an outside email yet: set
  `allowed_emails/{email}.status = 'suspended'` in the Firebase console.

---

## Part G: One-click connector for the whole team (web, desktop, phone)

**Goal:** every employee connects once, from claude.ai, with nothing to install
and no code shared. It works in the claude.ai website, Claude Desktop and the
Claude phone app, because all three use the same Team account.

**How:** run the connector on our existing Vercel project instead of on each
computer. Employees only ever see a URL; the code stays private in this repo.

```
claude.ai (any device) ──HTTPS──▶ airbuddy-workspace.vercel.app/api/mcp
                                   ├─ OAuth sign-in → /connect/claude page (Google, no extra scopes)
                                   └─ Firestore REST with THAT employee's own token → firestore.rules
```

Rules that do not change: each person acts as themselves, their role and
permissions apply, nothing can be deleted, never `firebase-admin`.

### G1. Build it ✅ (done 2026-10-06, not committed)
- [x] `api/mcp.js` → `api/_lib/mcpHandler.js`: the same 17 tools over
  Streamable HTTP, stateless. Imports `registerTools`/`WorkspaceApi` from
  `mcp/src`; nothing copied. Rate limit 120 calls/min per person.
- [x] `api/oauth.js` → `api/_lib/oauth.js`: discovery
  (`/.well-known/oauth-*`, rewritten in `vercel.json`), registration, authorize,
  token, plus `describe`/`approve`/`deny` for the sign-in page.
- [x] `/connect/claude?authreq=…` (`ConnectClaudePage.jsx`): sign in with Google →
  **Connect Claude** / **Cancel**; shows where the code goes and warns when
  that's a local program. The old `airbuddy-mcp login` mode still works.
- [x] No token database: `api/_lib/seal.js` (AES-256-GCM, key from
  `MCP_TOKEN_SECRET`). Claude never sees the Firebase session inside its token.
- [x] Redirects: only `https://claude.ai/api/mcp/auth_callback` and Claude Code's
  `http://localhost|127.0.0.1:<any port>/callback` (from Anthropic's connector
  auth docs).
- [x] Tests: `api/_lib/connector.test.js` (15: helpers, sealing, the full flow
  over HTTP); `api/_lib/connector.rules.emulator.test.js` (4, as employees,
  real rules). All 3 emulator suites: 28 passed. `npm test`: 449 passed.
- [x] **End-to-end in the browser** with real Google sign-in and the live
  database (an official MCP SDK client acting like Claude Code, read-only):
  401 → discovery → sign-in page → Connect → token → 17 tools → `whoami` →
  `list_my_work` → refresh. **PASS.** (Used the SDK client instead of the MCP
  Inspector UI; same protocol.)
- Run it locally: `npm run dev` + `npm run dev:connector`, MCP URL
  `http://localhost:5173/api/mcp`.

**Known trade-offs (by design):**
- An old refresh token stays valid until its own 90-day expiry even after it
  is rotated (nothing is stored). To cut a person off: `revokeRefreshTokens(uid)`
  in Firebase. Emergency for everyone: change `MCP_TOKEN_SECRET` (all reconnect).
- Everyone reconnects at least every 90 days.
- Vercel runs functions in the US by default and Firestore is in Delhi, so each
  tool call takes roughly 0.3–1 s. Optional: Vercel → Settings → Functions →
  region **Mumbai (bom1)**.

### G2. Deploy (you)
1. Make a secret (run once, copy the output, keep it private):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Vercel → Project → Settings → Environment Variables → `MCP_TOKEN_SECRET` =
   that value, for **Production** (and Preview if you test there).
   `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_PROJECT_ID` are already there and
   are reused.
3. Commit and push. Vercel deploys it.
4. Check: open `https://airbuddy-workspace.vercel.app/.well-known/oauth-authorization-server`
   → JSON with `"issuer": "https://airbuddy-workspace.vercel.app"`. If it shows
   the website instead, the `vercel.json` rewrites didn't deploy.

### G3. Add it for the team (organization owner, once) ⬜
1. claude.ai → Organization settings → **Connectors** → **Add** → **Custom** →
   **Web**.
2. Name: `AirBuddy WorkSpace`
3. MCP server URL: `https://airbuddy-workspace.vercel.app/api/mcp`
4. **Continue** → save. It now appears in every member's connector list.

### G4. Each employee, once (about 30 seconds) ⬜
1. claude.ai → Settings → **Connectors** → **AirBuddy WorkSpace** → **Connect**.
2. A WorkSpace page opens → sign in with their usual Google account → click
   **Connect Claude**.
3. Done. It now works on the website, in Claude Desktop and in the phone app.
   Test: ask *"what can you do for me in WorkSpace?"*

### G5. After it works
- [ ] Tell people who installed the local `airbuddy-mcp` to remove it
  (`npm uninstall -g @airbuddy/workspace-mcp`, and remove `airbuddy` from the Claude
  config), so they don't see every tool twice.
- [ ] Update `/docs/claude-connector` to the one-click steps above.
- [ ] Someone leaves: remove their Team seat **and** revoke their Firebase
  sessions (`revokeRefreshTokens(uid)`). That cuts the connector off at once.

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
