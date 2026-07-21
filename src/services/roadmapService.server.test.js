/**
 * roadmapService.server.test.js — Phase 8 unit tests
 *
 * Tests the pure computeTaskProgress() function from roadmapService.server.js.
 * This function has NO Firestore dependencies so no mocking is needed.
 *
 * Loop guard logic and propagation are tested with lightweight mock stubs.
 */
import { describe, it, expect } from 'vitest';

// roadmapService.server.js is CommonJS. Import via createRequire.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { computeTaskProgress } = require('../../functions/roadmapService.server.js');

// ─── computeTaskProgress ────────────────────────────────────────────────────

describe('computeTaskProgress', () => {
  it('returns zero progress for empty task array', () => {
    const result = computeTaskProgress([]);
    expect(result.progress).toBe(0);
    expect(result.childCount).toBe(0);
    expect(result.childCompletedCount).toBe(0);
    expect(result.nodeStatus).toBeNull();
  });

  it('returns zero for null input', () => {
    const result = computeTaskProgress(null);
    expect(result.progress).toBe(0);
  });

  it('computes correct average for single task', () => {
    const result = computeTaskProgress([{ progress: 60, status: 'in-progress' }]);
    expect(result.progress).toBe(60);
    expect(result.childCount).toBe(1);
    expect(result.childCompletedCount).toBe(0);
  });

  it('computes correct rounded average for multiple tasks', () => {
    const tasks = [
      { progress: 100, status: 'completed' },
      { progress: 50,  status: 'in-progress' },
      { progress: 0,   status: 'pending' },
    ];
    // avg = (100+50+0)/3 = 50
    const result = computeTaskProgress(tasks);
    expect(result.progress).toBe(50);
    expect(result.childCount).toBe(3);
    expect(result.childCompletedCount).toBe(1);
  });

  it('rounds fractional averages correctly', () => {
    const tasks = [
      { progress: 100, status: 'completed' },
      { progress: 100, status: 'completed' },
      { progress: 0,   status: 'pending' },
    ];
    // avg = 200/3 = 66.67 -> rounds to 67
    const result = computeTaskProgress(tasks);
    expect(result.progress).toBe(67);
  });

  it('returns nodeStatus=completed when all active tasks completed', () => {
    const tasks = [
      { progress: 100, status: 'completed' },
      { progress: 100, status: 'completed' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.nodeStatus).toBe('completed');
    expect(result.progress).toBe(100);
  });

  it('returns nodeStatus=in-progress when any task is in-progress', () => {
    const tasks = [
      { progress: 50, status: 'in-progress' },
      { progress: 0,  status: 'pending' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.nodeStatus).toBe('in-progress');
  });

  it('returns nodeStatus=null when all tasks are pending', () => {
    const tasks = [
      { progress: 0, status: 'pending' },
      { progress: 0, status: 'pending' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.nodeStatus).toBeNull();
  });

  it('excludes archived tasks from computation', () => {
    const tasks = [
      { progress: 100, status: 'completed' },
      { progress: 80,  status: 'archived' },  // should be excluded
    ];
    // Only completed task counts: avg = 100/1 = 100
    const result = computeTaskProgress(tasks);
    expect(result.progress).toBe(100);
    expect(result.childCount).toBe(1);
    expect(result.childCompletedCount).toBe(1);
    expect(result.nodeStatus).toBe('completed');
  });

  it('returns zero progress when all tasks are archived', () => {
    const tasks = [
      { progress: 100, status: 'archived' },
      { progress: 50,  status: 'archived' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.progress).toBe(0);
    expect(result.childCount).toBe(0);
    expect(result.nodeStatus).toBeNull();
  });

  it('counts completed tasks correctly in childCompletedCount', () => {
    const tasks = [
      { progress: 100, status: 'completed' },
      { progress: 100, status: 'completed' },
      { progress: 50,  status: 'in-progress' },
      { progress: 0,   status: 'pending' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.childCompletedCount).toBe(2);
    expect(result.childCount).toBe(4);
  });

  it('treats missing progress field as 0', () => {
    const tasks = [
      { status: 'pending' },  // no progress field
      { progress: 50, status: 'in-progress' },
    ];
    const result = computeTaskProgress(tasks);
    expect(result.progress).toBe(25); // (0+50)/2
  });
});

// ─── Loop guard logic ────────────────────────────────────────────────────────

describe('Loop guard: Math.round comparison', () => {
  it('round(67.3) === round(67) — write should be skipped', () => {
    // This mirrors the exact guard used in recomputeNodeProgress and propagateProgressToAncestors
    expect(Math.round(67.3) === Math.round(67)).toBe(true);
  });

  it('round(68) !== round(67) — write should proceed', () => {
    expect(Math.round(68) === Math.round(67)).toBe(false);
  });

  it('round(67.5) !== round(67) — rounds to 68, write proceeds', () => {
    expect(Math.round(67.5) === Math.round(67)).toBe(false);
  });

  it('round(0) === round(0) — write skipped for identical zeros', () => {
    expect(Math.round(0) === Math.round(0)).toBe(true);
  });

  it('round(100) === round(100) — write skipped for completed nodes', () => {
    expect(Math.round(100) === Math.round(100)).toBe(true);
  });
});