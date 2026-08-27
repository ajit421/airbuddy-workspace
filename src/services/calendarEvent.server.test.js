/**
 * calendarEvent.server.test.js — Google Calendar sync unit tests
 *
 * Covers the pure half of the server-side calendar sync: event shape, IST date
 * handling, who is eligible for impersonation, and the change detection that
 * keeps the sync from calling Google on every unrelated task write.
 *
 * functions/calendarEvent.js is CommonJS and deliberately dependency-free
 * (only ./time), so it loads through createRequire without the Admin SDK — the
 * same arrangement roadmapService.server.test.js uses.
 */
import { describe, it, expect } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  WORKSPACE_DOMAIN,
  SYNCED_FIELDS,
  isSyncableEmail,
  normalizeAssignees,
  buildEvent,
  syncedFieldsChanged,
} = require('../../functions/calendarEvent.js');
const { istDateString } = require('../../functions/time.js');

const APP_URL = 'https://airbuddy-workspace.vercel.app';

/** A Firestore Timestamp is duck-typed by its toDate() method. */
const ts = (iso) => ({ toDate: () => new Date(iso) });

// ─── isSyncableEmail ─────────────────────────────────────────────────────────

describe('isSyncableEmail', () => {
  it('accepts a Workspace address', () => {
    expect(isSyncableEmail(`ajit@${WORKSPACE_DOMAIN}`)).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isSyncableEmail('  Ajit@AirBuddy.IN ')).toBe(true);
  });

  it('rejects an external collaborator — delegation cannot impersonate them', () => {
    expect(isSyncableEmail('someone@gmail.com')).toBe(false);
  });

  it('rejects a lookalike domain', () => {
    expect(isSyncableEmail('attacker@notairbuddy.in')).toBe(false);
  });

  it('rejects missing or non-string values', () => {
    expect(isSyncableEmail(undefined)).toBe(false);
    expect(isSyncableEmail(null)).toBe(false);
    expect(isSyncableEmail(123)).toBe(false);
  });
});

// ─── normalizeAssignees ──────────────────────────────────────────────────────

describe('normalizeAssignees', () => {
  it('de-duplicates and drops empty entries', () => {
    expect(normalizeAssignees(['a', 'b', 'a', '', null])).toEqual(['a', 'b']);
  });

  it('wraps a legacy bare-string assignedTo', () => {
    expect(normalizeAssignees('uid-1')).toEqual(['uid-1']);
  });

  it('returns an empty array for missing values', () => {
    expect(normalizeAssignees(undefined)).toEqual([]);
    expect(normalizeAssignees([])).toEqual([]);
  });
});

// ─── buildEvent ──────────────────────────────────────────────────────────────

describe('buildEvent', () => {
  const task = {
    title: 'Fix the wing jig',
    description: 'Bring the fixture back to tolerance',
    module: 'DOCUMENTATION',
    priority: 'high',
    status: 'in-progress',
    startDate: ts('2026-09-01T00:00:00.000Z'),
    dueDate: ts('2026-09-03T00:00:00.000Z'),
  };

  it('titles the event so it is identifiable in a busy calendar', () => {
    expect(buildEvent(task, 'task-1', APP_URL).summary).toBe('[AirBuddy] Fix the wing jig');
  });

  it('marks a completed task with a tick', () => {
    const event = buildEvent({ ...task, status: 'completed' }, 'task-1', APP_URL);
    expect(event.summary).toBe('✅ [AirBuddy] Fix the wing jig');
  });

  it('makes the all-day end date exclusive so the due day is covered', () => {
    const event = buildEvent(task, 'task-1', APP_URL);
    expect(event.start.date).toBe('2026-09-01');
    // Due on the 3rd -> end.date is the 4th, otherwise Google renders the 3rd
    // as empty and the event stops on the 2nd.
    expect(event.end.date).toBe('2026-09-04');
  });

  it('uses the IST calendar day, not the UTC one', () => {
    // 19:30 UTC on Aug 27 is already 01:00 IST on Aug 28. A UTC
    // toISOString().slice(0, 10) would put this event on the wrong day.
    const late = { ...task, startDate: new Date('2026-08-27T19:30:00.000Z'), dueDate: null };
    expect(buildEvent(late, 'task-1', APP_URL).start.date).toBe('2026-08-28');
  });

  it('falls back to the due date when there is no start date', () => {
    const event = buildEvent({ ...task, startDate: null }, 'task-1', APP_URL);
    expect(event.start.date).toBe('2026-09-03');
    expect(event.end.date).toBe('2026-09-04');
  });

  it('never produces an end before the start when the dates are inverted', () => {
    const inverted = {
      ...task,
      startDate: ts('2026-09-10T00:00:00.000Z'),
      dueDate: ts('2026-09-01T00:00:00.000Z'),
    };
    const event = buildEvent(inverted, 'task-1', APP_URL);
    expect(event.start.date).toBe('2026-09-10');
    expect(event.end.date).toBe('2026-09-11');
  });

  it('colours the event by priority', () => {
    expect(buildEvent({ ...task, priority: 'high' }, 't', APP_URL).colorId).toBe('11');
    expect(buildEvent({ ...task, priority: 'low' }, 't', APP_URL).colorId).toBe('7');
    // Unknown priority falls back to the medium colour rather than breaking
    expect(buildEvent({ ...task, priority: 'ultra' }, 't', APP_URL).colorId).toBe('5');
  });

  it('carries the task id so an event can be traced back', () => {
    const event = buildEvent(task, 'task-abc', APP_URL);
    expect(event.extendedProperties.private.airbuddyTaskId).toBe('task-abc');
  });

  it('links back to the app', () => {
    const event = buildEvent(task, 'task-1', APP_URL);
    expect(event.source.url).toBe(APP_URL);
    expect(event.description).toContain(APP_URL);
  });

  it('survives a task with almost nothing filled in', () => {
    const event = buildEvent({}, 'task-1', APP_URL);
    expect(event.summary).toBe('[AirBuddy] Untitled task');
    expect(event.start.date).toBe(istDateString(new Date()));
    expect(event.description).toContain('Module: General');
  });
});

// ─── syncedFieldsChanged ─────────────────────────────────────────────────────

describe('syncedFieldsChanged', () => {
  const base = {
    title: 'A',
    description: 'B',
    priority: 'medium',
    status: 'pending',
    module: 'General',
    dueDate: ts('2026-09-03T00:00:00.000Z'),
  };

  it('reports no change when nothing visible moved', () => {
    expect(syncedFieldsChanged(base, { ...base })).toBe(false);
  });

  it('ignores fields the calendar does not show', () => {
    // progress ticks and the checklist must not cause Calendar API traffic
    expect(syncedFieldsChanged(base, { ...base, progress: 40, todos: [{ done: true }] })).toBe(false);
  });

  it('ignores the calendarEventIds write-back — this is the anti-loop guard', () => {
    // syncTaskCreated stores event ids on the task, which re-fires onTaskUpdate.
    // If this returned true the trigger would call Google again, write again,
    // and loop.
    const after = { ...base, calendarEventIds: { 'uid-1': 'evt-1' } };
    expect(syncedFieldsChanged(base, after)).toBe(false);
    expect(SYNCED_FIELDS).not.toContain('calendarEventIds');
  });

  it('detects a retitle', () => {
    expect(syncedFieldsChanged(base, { ...base, title: 'A2' })).toBe(true);
  });

  it('detects a reschedule even though Timestamps are never ===', () => {
    const after = { ...base, dueDate: ts('2026-09-05T00:00:00.000Z') };
    expect(syncedFieldsChanged(base, after)).toBe(true);
  });

  it('treats two Timestamp objects for the same instant as unchanged', () => {
    const after = { ...base, dueDate: ts('2026-09-03T00:00:00.000Z') };
    expect(syncedFieldsChanged(base, after)).toBe(false);
  });

  it('detects a date being cleared or added', () => {
    expect(syncedFieldsChanged(base, { ...base, dueDate: null })).toBe(true);
    expect(syncedFieldsChanged({ ...base, dueDate: null }, base)).toBe(true);
  });

  it('detects a status change, which retitles the event with a tick', () => {
    expect(syncedFieldsChanged(base, { ...base, status: 'completed' })).toBe(true);
  });
});

// ─── istDateString ───────────────────────────────────────────────────────────

describe('istDateString', () => {
  it('returns the Indian calendar day for a late-evening UTC instant', () => {
    expect(istDateString(new Date('2026-08-27T18:45:00.000Z'))).toBe('2026-08-28');
  });

  it('returns the same day for UTC midnight, which is 05:30 IST', () => {
    expect(istDateString(new Date('2026-08-27T00:00:00.000Z'))).toBe('2026-08-27');
  });

  it('pads single-digit months and days', () => {
    expect(istDateString(new Date('2026-01-05T06:00:00.000Z'))).toBe('2026-01-05');
  });
});
