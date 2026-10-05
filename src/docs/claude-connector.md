# Connect your Claude

You can let your own Claude (Claude Desktop or Claude Code) work with WorkSpace
for you. Ask it things like *"what's due this week?"*, *"set the wing-test
milestone to 60% and add Archit as a work partner"* or *"tick off 'order parts'
on my CAD task"*.

Claude acts **as you**. It can do exactly what you can do in WorkSpace, nothing
more, and every change it makes shows up in the app, on the timeline and in
people's notifications as if you had made it yourself.

## Set it up (once per computer)

1. Install Node.js 20 or newer.
2. Install the connector. Ask your admin for the `airbuddy-workspace-mcp`
   package, then run:
   ```
   npm install -g airbuddy-workspace-mcp-0.1.0.tgz
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

- List your work, read any task or milestone, browse and search the roadmap
- Update progress (marking something complete needs a short completion note)
- Extend a due date
- Add work partners (and remove them, if you created the item)
- Add, tick and delete checklist items
- Post progress updates to the collaboration timeline, and comment on milestones
- Create personal tasks
- **Admins only:** create milestones and edit them (dates, status, assignees)

Claude cannot delete tasks or archive milestones. Do those in the app.

## Disconnect

Run `airbuddy-mcp logout` on that computer. If a laptop is lost, ask an admin
to revoke your sessions. That signs you out everywhere, including the web app.
