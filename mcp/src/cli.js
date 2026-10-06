#!/usr/bin/env node
/**
 * cli.js — entry point.
 *
 *   airbuddy-mcp            start the MCP server on stdio (what Claude runs)
 *   airbuddy-mcp login      connect this computer to your WorkSpace account
 *   airbuddy-mcp status     show who this computer is signed in as
 *   airbuddy-mcp logout     forget the stored session
 *
 * stdout belongs to the MCP protocol while serving, so everything human-facing
 * goes to stderr.
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FirestoreClient } from './firestore.js';
import { DEFAULT_APP_URL, login } from './login.js';
import { CREDENTIALS_PATH, Session, deleteCredentials, loadCredentials } from './session.js';
import { registerTools } from './tools.js';
import { WorkspaceApi } from './workspace.js';

const { version } = createRequire(import.meta.url)('../package.json');

const INSTRUCTIONS = `Tools for AirBuddy Aerospace WorkSpace — the team's tasks, company roadmap milestones, work partners and checklists.
You act as the signed-in employee and can do what their role and admin-granted permissions allow in the web app; the database's security rules enforce it.
Call whoami first to see the role and permissions: roadmap.edit unlocks create_milestone/update_milestone, tasks.assign unlocks assign_task, tasks.viewAll lets list_my_work show somebody else's work. Admins hold all of them.
This connector is read and write only: nothing can be deleted, archived or removed (tasks, milestones, checklist items, partners, assignees). If the user asks for that, tell them to do it in the web app.
Start with list_my_work (or search_roadmap / browse_roadmap) to find ids, and get_work_item before changing something.
Progress drives status: 0 pending, 1-99 in-progress, 100 completed (needs a completion_note).
Dates are YYYY-MM-DD in India time. Confirm with the user before completing work, assigning tasks to other people or creating milestones.`;

function buildApi() {
  const session = new Session(loadCredentials());
  const db = new FirestoreClient({
    projectId: session.projectId ?? 'workspace-airbuddy',
    getIdToken: () => session.getIdToken(),
  });
  return new WorkspaceApi(db, session);
}

async function serve() {
  const server = new McpServer(
    { name: 'airbuddy-workspace', version },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, buildApi());
  await server.connect(new StdioServerTransport());
  if (!loadCredentials()) {
    console.error(`[airbuddy-mcp] Not signed in — tools will ask you to run \`airbuddy-mcp login\`.`);
  }
}

async function main() {
  const [cmd = 'serve', ...rest] = process.argv.slice(2);
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  switch (cmd) {
    case 'serve':
      return serve();

    case 'login': {
      const appUrl = flag('app-url') ?? process.env.AIRBUDDY_APP_URL ?? DEFAULT_APP_URL;
      const { email } = await login({ appUrl });
      const me = await buildApi().me();
      console.error(`\nConnected as ${me.name} <${email}> (${me.role}).\nSaved to ${CREDENTIALS_PATH}. Restart Claude to pick it up.`);
      return;
    }

    case 'status':
    case 'whoami': {
      if (!loadCredentials()) {
        console.error('Not signed in. Run `airbuddy-mcp login`.');
        process.exitCode = 1;
        return;
      }
      const me = await buildApi().me();
      console.error(`Signed in as ${me.name} <${me.email}> (${me.role}).`);
      return;
    }

    case 'logout':
      console.error(deleteCredentials() ? 'Signed out on this computer.' : 'Was not signed in.');
      return;

    case '--version':
    case '-v':
      console.error(version);
      return;

    default:
      console.error('Usage: airbuddy-mcp [serve | login [--app-url URL] | status | logout]');
      process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`[airbuddy-mcp] ${err.message}`);
  process.exit(1);
});
