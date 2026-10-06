# Connect your Claude

You can let your own Claude (Claude Desktop or Claude Code) work with WorkSpace
for you. Ask it things like *"what's due this week?"*, *"set the wing-test
milestone to 60% and add Archit as a work partner"* or *"tick off 'order parts'
on my CAD task"*.

Claude acts **as you**. It can do what your role and the permissions an admin
has given you allow in WorkSpace, nothing more, and every change it makes shows up in the app, on the timeline and in
people's notifications as if you had made it yourself.

## Set it up (once per computer)

1. Install Node.js 20 or newer.
2. Install the connector. Ask your admin for the `airbuddy-workspace-mcp`
   package, then run:
   ```
   npm install -g airbuddy-workspace-mcp-0.2.0.tgz
   ```
3. Sign in:
   ```
   airbuddy-mcp login
   ```
   Your browser opens a WorkSpace page. Sign in with your usual Google account
   if asked, then click **Connect Claude**.
4. Add it to Claude:
   - **Claude Code:** `claude mcp add airbuddy -s user -- airbuddy-mcp`
   - **Claude Desktop:** Settings → Developer → Edit Config, then add
     `"airbuddy": { "command": "airbuddy-mcp" }` under `"mcpServers"`, and restart Claude.

## What Claude can do

**Everyone:**

- List your work, read any task or milestone, browse and search the roadmap
- Update progress (marking something complete needs a short completion note)
- Extend a due date
- Add work partners
- Add checklist items, and tick or untick them
- Post progress updates to the collaboration timeline, and comment on milestones
- Create personal tasks

**Only with a permission** (an admin grants it in Admin Panel → Permissions;
admins have all of them):

| Permission | What it adds in Claude |
|---|---|
| Edit roadmap (`roadmap.edit`) | Create milestones, edit them (title, dates, status, priority) and add assignees |
| Assign tasks (`tasks.assign`) | Assign a task to other people |
| See all tasks (`tasks.viewAll`) | See anybody's work list, not only your own |

Ask Claude *"what can you do for me in WorkSpace?"* to see your own role and
permissions.

**Nobody, not even an admin, can delete or remove anything through Claude**:
no deleting tasks, milestones, checklist items or comments, no archiving, and no
taking work partners or assignees off. Do those in the app. If you used version
0.1.0, update to 0.2.0: it is the version with these limits.

## Disconnect

Run `airbuddy-mcp logout` on that computer. If a laptop is lost, ask an admin
to revoke your sessions. That signs you out everywhere, including the web app.


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
