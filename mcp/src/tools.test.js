import { describe, it, expect } from 'vitest';
import { registerTools } from './tools.js';

/** Collect what registerTools would expose to Claude. */
function exposedTools() {
  const tools = new Map();
  registerTools({ registerTool: (name, def) => tools.set(name, def) }, {});
  return tools;
}

describe('tool surface', () => {
  it('is read and write only: no tool deletes, removes or archives', () => {
    const tools = exposedTools();
    expect([...tools.keys()].filter((n) => /delete|remove|archive/i.test(n))).toEqual([]);
    for (const [name, def] of tools) {
      expect(def.annotations?.destructiveHint, name).not.toBe(true);
      expect(Object.keys(def.inputSchema ?? {}).filter((k) => /remove|delete/i.test(k)), name).toEqual([]);
    }
  });

  it('names the permission on every permission-gated tool', () => {
    const tools = exposedTools();
    expect(tools.get('create_milestone').description).toMatch(/roadmap\.edit/);
    expect(tools.get('update_milestone').description).toMatch(/roadmap\.edit/);
    expect(tools.get('assign_task').description).toMatch(/tasks\.assign/);
    expect(tools.get('list_my_work').description).toMatch(/tasks\.viewAll/);
  });
});
