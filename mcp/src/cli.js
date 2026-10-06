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
import { SERVER_INSTRUCTIONS, registerTools } from './tools.js';
import { WorkspaceApi } from './workspace.js';

const { version } = createRequire(import.meta.url)('../package.json');

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
    { instructions: SERVER_INSTRUCTIONS },
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
