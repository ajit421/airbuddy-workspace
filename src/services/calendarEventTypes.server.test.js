/**
 * calendarEventTypes.server.test.js — Calendar sync for everything that is not
 * a plain task.
 *
 * The web app's Calendar page draws three sources (tasks, leaves, roadmap
 * milestones) and the bell adds announcements. Tasks are covered by
 * calendarEvent.server.test.js; this file covers the other three plus the
 * recipient rule that puts a partnered task on the work partner's calendar too.
 *
 * functions/calendarEvent.js is CommonJS and dependency-free (only ./time), so
 * it loads through createRequire without the Admin SDK — the same arrangement
 * roadmapService.server.test.js uses.
 */
import { describe, it, expect } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  NODE_SYNCED_FIELDS,
  LEAVE_SYNCED_FIELDS,
  taskRecipients,
  buildNodeEvent,
  buildLeaveEvent,
  buildAnnouncementEvent,
  fieldsChanged,
  isNodeCalendarEligible,
  isLeaveCalendarEligible,
} = require('../../functions/calendarEvent.js');

const APP_URL = 'https://airbuddy-workspace.vercel.app';

/** A Firestore Timestamp is duck-typed by its toDate() method. */
const ts = (iso) => ({ toDate: () => new Date(iso) });

// ─── taskRecipients ──────────────────────────────────────────────────────────

describe('taskRecipients', () => {
  it('includes work partners alongside assignees', () => {
    // A partnered task shows on the partner's Dashboard and in the Work Partner
    // drawer, so leaving it off their calendar would be the one place the work
    // is invisible to them.
    const task = { assignedTo: ['uid-a'], workPartnerUids: ['uid-b', 'uid-c'] };
    expect(taskRecipients(task)).toEqual(['uid-a', 'uid-b', 'uid-c']);
  });

  it('de-duplicates somebody who is both assignee and partner', () => {
    expect(taskRecipients({ assignedTo: ['uid-a'], workPartnerUids: ['uid-a'] }))
      .toEqual(['uid-a']);
  });

  it('ignores the rich workPartners array of maps', () => {
    // collaborationService stores partners twice; only the flat uid array is
    // authoritative, and it is the only one the security rules can test.
    const task = { assignedTo: ['uid-a'], workPartners: [{ uid: 'uid-z', name: 'Z' }] };
    expect(taskRecipients(task)).toEqual(['uid-a']);
  });

  it('copes with an empty or missing task', () => {
    expect(taskRecipients({})).toEqual([]);
    expect(taskRecipients(undefined)).toEqual([]);
  });
});

// ─── buildNodeEvent ──────────────────────────────────────────────────────────

describe('buildNodeEvent', () => {
  const node = {
    title: 'Prototype airframe complete',
    description: 'All structural parts assembled',
    priority: 'high',
    status: 'in-progress',
    depth: 0,
    progress: 40,
    startDate: ts('2026-09-01T00:00:00.000Z'),
    dueDate: ts('2026-09-30T00:00:00.000Z'),
  };

  it('labels the event as a roadmap milestone', () => {
    const event = buildNodeEvent(node, 'node-1', APP_URL);
    expect(event.summary).toBe('[AirBuddy Roadmap] Prototype airframe complete');
    expect(event.description).toContain('Root milestone');
  });

  it('calls a nested node a milestone rather than a root one', () => {
    const event = buildNodeEvent({ ...node, depth: 2 }, 'node-1', APP_URL);
    expect(event.description).toContain('Milestone');
    expect(event.description).not.toContain('Root milestone');
  });

  it('marks a completed milestone with a tick', () => {
    const event = buildNodeEvent({ ...node, status: 'completed' }, 'node-1', APP_URL);
    expect(event.summary.startsWith('✅ ')).toBe(true);
  });

  it('deep-links to the node so the entry is actionable', () => {
    const event = buildNodeEvent(node, 'node-1', APP_URL);
    expect(event.source.url).toBe(`${APP_URL}/roadmap/node-1`);
    expect(event.extendedProperties.private.airbuddyNodeId).toBe('node-1');
  });

  it('covers the whole milestone window, end exclusive', () => {
    const event = buildNodeEvent(node, 'node-1', APP_URL);
    expect(event.start.date).toBe('2026-09-01');
    expect(event.end.date).toBe('2026-10-01');
  });

  it('falls back to the due date when the node has no start date', () => {
    const event = buildNodeEvent({ ...node, startDate: null }, 'node-1', APP_URL);
    expect(event.start.date).toBe('2026-09-30');
    expect(event.end.date).toBe('2026-10-01');
  });

  // Reminder timing is asserted in calendarReminders.server.test.js, which owns
  // the all-day-midnight subtlety for every event type at once.

  it('omits progress, because the rollup rewrites it constantly', () => {
    // Including progress would mean a Calendar API call on every task tick
    // anywhere below the node.
    expect(buildNodeEvent(node, 'n', APP_URL).description).not.toContain('40');
    expect(NODE_SYNCED_FIELDS).not.toContain('progress');
  });
});

// ─── buildLeaveEvent ─────────────────────────────────────────────────────────

describe('buildLeaveEvent', () => {
  const leave = {
    uid: 'uid-a',
    type: 'sick',
    startDate: '2026-09-10',
    endDate: '2026-09-12',
    reason: 'Fever',
    status: 'approved',
  };

  it('names the leave and marks it approved', () => {
    expect(buildLeaveEvent(leave, 'leave-1', APP_URL).summary)
      .toBe('🌴 [AirBuddy] Sick leave (approved)');
  });

  it('covers the last day of the leave — end.date is exclusive', () => {
    const event = buildLeaveEvent(leave, 'leave-1', APP_URL);
    expect(event.start.date).toBe('2026-09-10');
    expect(event.end.date).toBe('2026-09-13');
  });

  it('handles a single-day leave', () => {
    const event = buildLeaveEvent({ ...leave, endDate: '2026-09-10' }, 'l', APP_URL);
    expect(event.start.date).toBe('2026-09-10');
    expect(event.end.date).toBe('2026-09-11');
  });

  it('never ends before it starts, even with inverted dates', () => {
    const event = buildLeaveEvent({ ...leave, endDate: '2026-09-01' }, 'l', APP_URL);
    expect(event.start.date).toBe('2026-09-10');
    expect(event.end.date).toBe('2026-09-11');
  });

  it('blocks the days as busy and sets no reminders', () => {
    const event = buildLeaveEvent(leave, 'l', APP_URL);
    expect(event.transparency).toBe('opaque');
    expect(event.reminders.overrides).toEqual([]);
  });

  it('links to the leaves page and carries the leave id', () => {
    const event = buildLeaveEvent(leave, 'leave-1', APP_URL);
    expect(event.source.url).toBe(`${APP_URL}/hrms/leaves`);
    expect(event.extendedProperties.private.airbuddyLeaveId).toBe('leave-1');
  });
});

// ─── buildAnnouncementEvent ──────────────────────────────────────────────────

describe('buildAnnouncementEvent', () => {
  const announcement = {
    title: 'Office closed on Friday',
    message: 'Maintenance work in the building.',
    createdAt: ts('2026-09-02T04:00:00.000Z'),
  };

  it('lands at the moment it was posted, as a timed slot', () => {
    // Deliberately not an all-day entry: a timed event is what lets its
    // 0-minute reminder fire immediately rather than at midnight.
    const event = buildAnnouncementEvent(announcement, 'a-1', APP_URL);
    expect(event.start.dateTime).toBe('2026-09-02T04:00:00.000Z');
    expect(event.start.timeZone).toBe('Asia/Kolkata');
  });

  it('does not mark anyone busy — it is informational', () => {
    expect(buildAnnouncementEvent(announcement, 'a-1', APP_URL).transparency)
      .toBe('transparent');
  });

  it('carries the message text so the entry stands alone', () => {
    const event = buildAnnouncementEvent(announcement, 'a-1', APP_URL);
    expect(event.summary).toBe('📢 [AirBuddy] Office closed on Friday');
    expect(event.description).toContain('Maintenance work in the building.');
  });

  it('falls back to now when createdAt has not resolved yet', () => {
    // serverTimestamp() is null on the local echo of a just-created document.
    const before = Date.now();
    const event = buildAnnouncementEvent({ title: 'X', createdAt: null }, 'a-1', APP_URL);
    const at = new Date(event.start.dateTime).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

// ─── Eligibility guards ──────────────────────────────────────────────────────

describe('isNodeCalendarEligible', () => {
  const node = { dueDate: ts('2026-09-30T00:00:00.000Z'), assignedTo: ['uid-a'] };

  it('accepts a dated, assigned, live node', () => {
    expect(isNodeCalendarEligible(node)).toBe(true);
  });

  it('rejects an archived node — it is not upcoming work', () => {
    expect(isNodeCalendarEligible({ ...node, isArchived: true })).toBe(false);
  });

  it('rejects an undated node, matching what the app Calendar page shows', () => {
    expect(isNodeCalendarEligible({ ...node, dueDate: null })).toBe(false);
  });

  it('rejects an unassigned node — nobody to show it to', () => {
    expect(isNodeCalendarEligible({ ...node, assignedTo: [] })).toBe(false);
  });

  it('rejects null, which is what a just-created node has as `before`', () => {
    expect(isNodeCalendarEligible(null)).toBe(false);
  });
});

describe('isLeaveCalendarEligible', () => {
  const leave = {
    uid: 'uid-a', startDate: '2026-09-10', endDate: '2026-09-12', status: 'approved',
  };

  it('accepts an approved leave', () => {
    expect(isLeaveCalendarEligible(leave)).toBe(true);
  });

  it('rejects a pending request — not a commitment yet', () => {
    expect(isLeaveCalendarEligible({ ...leave, status: 'pending' })).toBe(false);
  });

  it('rejects a rejected request — it must not block days', () => {
    expect(isLeaveCalendarEligible({ ...leave, status: 'rejected' })).toBe(false);
  });

  it('rejects a leave with no start date', () => {
    expect(isLeaveCalendarEligible({ ...leave, startDate: null })).toBe(false);
  });
});

// ─── fieldsChanged, the shared anti-spam guard ───────────────────────────────

describe('fieldsChanged', () => {
  it('compares arrays element-wise, not by reference', () => {
    // assignedTo arrives as a fresh array on every snapshot, so a reference
    // comparison would report a change on every single write.
    const before = { assignedTo: ['a', 'b'] };
    expect(fieldsChanged(before, { assignedTo: ['a', 'b'] }, ['assignedTo'])).toBe(false);
    expect(fieldsChanged(before, { assignedTo: ['a', 'c'] }, ['assignedTo'])).toBe(true);
    expect(fieldsChanged(before, { assignedTo: ['a'] }, ['assignedTo'])).toBe(true);
  });

  it('ignores a rollup-only node write, which happens on every task tick', () => {
    const before = { title: 'M', status: 'in-progress', progress: 10 };
    const after = { title: 'M', status: 'in-progress', progress: 60 };
    expect(fieldsChanged(before, after, NODE_SYNCED_FIELDS)).toBe(false);
  });

  it('ignores the calendarEventIds write-back for nodes and leaves alike', () => {
    // This is the guard that stops the id write-back from re-triggering the
    // handler, calling Google again, writing again, and looping.
    const node = { title: 'M', status: 'pending' };
    expect(fieldsChanged(node, { ...node, calendarEventIds: { a: 'e1' } }, NODE_SYNCED_FIELDS))
      .toBe(false);
    const leave = { type: 'sick', status: 'approved', startDate: '2026-09-10' };
    expect(fieldsChanged(leave, { ...leave, calendarEventIds: { a: 'e1' } }, LEAVE_SYNCED_FIELDS))
      .toBe(false);
    expect(NODE_SYNCED_FIELDS).not.toContain('calendarEventIds');
    expect(LEAVE_SYNCED_FIELDS).not.toContain('calendarEventIds');
  });

  it('detects a node being archived', () => {
    expect(fieldsChanged({ isArchived: false }, { isArchived: true }, NODE_SYNCED_FIELDS))
      .toBe(true);
  });

  it('detects a milestone being rescheduled', () => {
    const before = { dueDate: ts('2026-09-30T00:00:00.000Z') };
    const after = { dueDate: ts('2026-10-15T00:00:00.000Z') };
    expect(fieldsChanged(before, after, NODE_SYNCED_FIELDS)).toBe(true);
  });

  it('detects a leave being re-dated', () => {
    const before = { startDate: '2026-09-10', endDate: '2026-09-12', status: 'approved' };
    const after = { startDate: '2026-09-11', endDate: '2026-09-12', status: 'approved' };
    expect(fieldsChanged(before, after, LEAVE_SYNCED_FIELDS)).toBe(true);
  });

  it('treats a null before (document just created) as a change', () => {
    expect(fieldsChanged(null, { title: 'New' }, ['title'])).toBe(true);
  });
});
