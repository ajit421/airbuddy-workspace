# airbuddy-mcp: WorkSpace for your own Claude

A local [MCP](https://modelcontextprotocol.io) server that lets an employee's
own Claude (Claude Desktop or Claude Code) read and update their AirBuddy
WorkSpace work: tasks, roadmap milestones, work partners, checklists, progress
notes and comments.

It runs on the employee's computer and acts **as them**. Every call goes to
Firestore with their own Firebase ID token, so `firestore.rules` decides what
is allowed, exactly as in the web app. There is no service account and no
`firebase-admin` here, and there must never be one.

## Install (each employee, once)

Requires Node 20+.

```powershell
# from a checkout of this repo
cd mcp; npm install; npm install -g .

# or from a tarball someone shared (built with `npm pack` in mcp/)
npm install -g airbuddy-workspace-mcp-0.2.0.tgz
```

Then sign in:

```powershell
airbuddy-mcp login
```

Your browser opens `/connect/claude` on WorkSpace. Sign in with your usual
Google account if asked, then click **Connect Claude**. The session is saved to
`~/.airbuddy-mcp/credentials.json`.

| Command | |
|---|---|
| `airbuddy-mcp login [--app-url URL]` | Connect this computer (use `--app-url http://localhost:5173` against `npm run dev`) |
| `airbuddy-mcp status` | Who this computer is signed in as |
| `airbuddy-mcp logout` | Delete the stored session |
| `airbuddy-mcp` | Start the MCP server on stdio. This is what Claude runs; you don't run it yourself. |

## Add it to Claude

**Claude Code**

```powershell
claude mcp add airbuddy -s user -- airbuddy-mcp
```

**Claude Desktop**: Settings > Developer > Edit Config, then add:

```json
{
  "mcpServers": {
    "airbuddy": { "command": "airbuddy-mcp" }
  }
}
```

On Windows, if Desktop can't find the command, use
`"command": "cmd", "args": ["/c", "airbuddy-mcp"]`. Restart Claude afterwards.

## Tools

The connector is **read and write only, for everybody, admins included**. No
tool deletes, archives or removes anything, and `FirestoreClient.commit()`
refuses any write that would (`assertNoRemoval`: a document delete, a field
delete, or `removeAllFromArray`). `tools.test.js` fails the build if a tool
with `delete`/`remove`/`archive` in its name, a `destructiveHint`, or a
`remove_*` input comes back.

Access follows the web app's three tiers: **employee** (their own work),
**admin** (everything) and **admin-granted permissions** from the Admin Panel's
Permissions tab. `hasPermission()` in `workItems.js` is a parity-tested copy of
the one in `src/utils/permissions.js`; `can(key)` in `firestore.rules` is the
real boundary. A permission change reaches a running server within a minute
(the profile is cached for 60 s).

| Tool | Who | What |
|---|---|---|
| `whoami` | everyone | Identity, role, granted permissions and what they unlock |
| `list_team` | everyone | The team directory |
| `list_my_work` | everyone (`tasks.viewAll`: anyone's) | Same list as the Dashboard: tasks and milestones assigned or partnered |
| `get_work_item` | participants; milestones are readable by all | Detail, checklist, partners, recent activity; for milestones also breadcrumb, children and comments |
| `browse_roadmap`, `search_roadmap` | everyone | Roadmap tree and search |
| `update_progress` | assignees, creator, admin; any milestone with `roadmap.edit` | Progress drives status the way the web app does; 100% needs a completion note |
| `extend_due_date` | assignees, creator, admin; any milestone with `roadmap.edit` | Sets `isExtended`; Calendar sync moves the event |
| `add_work_partner` | participants; any milestone with `roadmap.edit` | Both partner arrays in one write |
| `add_checklist_item`, `set_checklist_item` | participants | Read-modify-write under an `updateTime` precondition, with retries |
| `post_update` | participants | A "commit" on the collaboration timeline |
| `comment_on_milestone` | everyone | Comments tab on a milestone |
| `create_personal_task` | everyone | Same as "New Personal Task" |
| `assign_task` | `tasks.assign` | Same as Admin Panel > Assign Task (`createAdminTask`); `onTaskCreate` notifies |
| `create_milestone`, `update_milestone` | `roadmap.edit` | Create child/root milestones, edit fields, add assignees |

Deliberately left out, for everyone: deleting tasks, milestones, checklist
items or comments, archiving milestones, removing work partners or assignees,
and clearing a date. Those are done in the web app.

`roadmap.edit` does not extend to tasks: the `tasks` full-update rule is
`isAdmin()` only, so a non-admin with `tasks.assign` can create an assigned
task but cannot then edit its progress unless they are on it.

## How it fits together

```
Claude ── stdio ──▶ airbuddy-mcp ── HTTPS, Bearer <user's ID token> ──▶ Firestore REST
                                                                        └─ firestore.rules
                                                                        └─ Cloud Functions fire as usual
```

- **Login** (`src/login.js`, `src/pages/ConnectClaudePage.jsx`): the CLI
  listens on `127.0.0.1:<random port>` with a random `state`. The web page
  POSTs the browser's Firebase refresh token there, but only after the user
  clicks Connect. The page never adds an OAuth scope, so login shows no
  Google warning.
- **Session** (`src/session.js`): exchanges the refresh token for ID tokens at
  `securetoken.googleapis.com`, and resolves `user_email_map` to the
  effective uid just as `AuthContext` does.
- **Writes** (`src/workspace.js`): each one names the web-app function it
  mirrors. For example, `updatedBy` is written on milestones but never on
  tasks, because `onTaskUpdate` skips notifying `updatedBy` and the web app
  never sets it on tasks.
- **Parity tests** (`src/workItems.test.js`) import the web app's own
  `NODE_ASSIGNEE_WRITABLE_FIELDS`, `normalizeTodos`, `computeHierarchy`,
  `sortNodesByDueDate` and permission helpers and compare them with the copies
  here. A change to `src/` that isn't mirrored here fails `npm test` at the
  repo root.

## Testing

```powershell
npm test   # at the repo root: codec, write payloads, parity with src/
# every write as a non-admin, against the real firestore.rules:
npx firebase-tools emulators:exec --only firestore --project demo-airbuddy "npx vitest run mcp/src/rules.emulator.test.js"
```

The emulator test is the only one that covers the employee rule paths (the
assignee and participant carve-outs). An admin account passes everything, so
trying the tools as yourself doesn't prove they work for the team. Run it
after changing any write or any rules `hasOnly()` list.

## Revoking access

- On the machine: `airbuddy-mcp logout`.
- For a person everywhere: an admin runs
  `getAuth().revokeRefreshTokens(uid)` with the Admin SDK. That also signs
  them out of the web app.
