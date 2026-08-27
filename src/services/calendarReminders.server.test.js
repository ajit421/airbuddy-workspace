/**
 * calendarReminders.server.test.js — reminder timing
 *
 * These tests exist because of one easy-to-miss Calendar API detail: an all-day
 * event starts at **midnight**, and `reminders.overrides[].minutes` counts back
 * from the event start. So the intuitive `{ minutes: 60 }` on a task due
 * tomorrow fires at 23:00 tonight and `{ minutes: 1440 }` fires at 00:00 — both
 * while everyone is asleep, which made the reminders effectively silent.
 *
 * The offsets are therefore chosen to land at 09:00 IST: 15 hours before
 * midnight, plus a whole day per extra day of notice. If someone "simplifies"
 * them back to round day multiples, these tests fail.
 */
import { describe, it, expect } from 'vitest';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  TASK_REMINDERS,
  NODE_REMINDERS,
  IMMEDIATE_REMINDERS,
  NINE_AM_DAY_BEFORE,
  buildEvent,
  buildNodeEvent,
  buildLeaveEvent,
  buildAnnouncementEvent,
} = require('../../functions/calendarEvent.js');

const APP_URL = 'https://airbuddy-workspace.vercel.app';
const ts = (iso) => ({ toDate: () => new Date(iso) });

/**
 * Convert a reminder offset on an all-day event back to a wall-clock time, so
 * the assertion reads as the thing we actually care about.
 * @returns {string} e.g. "1 day before at 09:00"
 */
function wallClock(minutes) {
  const days = Math.floor(minutes / 1440);
  const rem = minutes % 1440;
  // Midnight minus `rem` minutes lands on the previous day.
  const hh = String(Math.floor((24 * 60 - rem) / 60) % 24).padStart(2, '0');
  const mm = String((24 * 60 - rem) % 60).padStart(2, '0');
  return `${days + 1} day(s) before at ${hh}:${mm}`;
}

describe('all-day reminder offsets land at 09:00 IST', () => {
  it('the day-before offset is 09:00, not midnight and not 23:00', () => {
    expect(NINE_AM_DAY_BEFORE).toBe(900);
    expect(wallClock(NINE_AM_DAY_BEFORE)).toBe('1 day(s) before at 09:00');
  });

  it('every task reminder lands at 09:00 on some earlier morning', () => {
    for (const { minutes } of TASK_REMINDERS.overrides) {
      expect(minutes % 1440).toBe(900);
    }
  });

  it('every milestone reminder lands at 09:00 on some earlier morning', () => {
    for (const { minutes } of NODE_REMINDERS.overrides) {
      expect(minutes % 1440).toBe(900);
    }
  });

  it('does not use the round day multiples that fire at midnight', () => {
    const all = [...TASK_REMINDERS.overrides, ...NODE_REMINDERS.overrides];
    expect(all.some((o) => o.minutes % 1440 === 0)).toBe(false);
    // 60 minutes before an all-day event is 23:00 the night before.
    expect(all.some((o) => o.minutes === 60)).toBe(false);
  });
});

describe('reminders are not silent', () => {
  it('a task carries an email reminder as well as popups', () => {
    const methods = TASK_REMINDERS.overrides.map((o) => o.method);
    // Email is the one channel that still arrives when browser notifications
    // are denied and the app is closed.
    expect(methods).toContain('email');
    expect(methods).toContain('popup');
  });

  it('a milestone carries an email reminder too', () => {
    expect(NODE_REMINDERS.overrides.map((o) => o.method)).toContain('email');
  });

  it('never falls back to the calendar default, which the user may have off', () => {
    expect(TASK_REMINDERS.useDefault).toBe(false);
    expect(NODE_REMINDERS.useDefault).toBe(false);
    expect(IMMEDIATE_REMINDERS.useDefault).toBe(false);
  });

  it('stays within the API cap of 5 overrides per event', () => {
    expect(TASK_REMINDERS.overrides.length).toBeLessThanOrEqual(5);
    expect(NODE_REMINDERS.overrides.length).toBeLessThanOrEqual(5);
    expect(IMMEDIATE_REMINDERS.overrides.length).toBeLessThanOrEqual(5);
  });

  it('gives milestones more notice than tasks', () => {
    const furthestTask = Math.max(...TASK_REMINDERS.overrides.map((o) => o.minutes));
    const furthestNode = Math.max(...NODE_REMINDERS.overrides.map((o) => o.minutes));
    expect(furthestNode).toBeGreaterThan(furthestTask);
  });
});

describe('event bodies carry the right reminder set', () => {
  const task = { title: 'T', dueDate: ts('2026-09-10T00:00:00.000Z') };
  const node = { title: 'M', dueDate: ts('2026-09-30T00:00:00.000Z'), assignedTo: ['u'] };

  it('a task uses the task set', () => {
    expect(buildEvent(task, 't', APP_URL).reminders).toEqual(TASK_REMINDERS);
  });

  it('a milestone uses the milestone set', () => {
    expect(buildNodeEvent(node, 'n', APP_URL).reminders).toEqual(NODE_REMINDERS);
  });

  it('a leave has no reminder — a day off is not a to-do', () => {
    const leave = { type: 'sick', startDate: '2026-09-10', endDate: '2026-09-11', status: 'approved' };
    expect(buildLeaveEvent(leave, 'l', APP_URL).reminders.overrides).toEqual([]);
  });
});

describe('announcements alert immediately', () => {
  const announcement = {
    title: 'Office closed',
    message: 'Maintenance.',
    createdAt: ts('2026-09-02T10:00:00.000Z'),
  };

  it('is a timed event, not all-day, so a 0-minute reminder means "now"', () => {
    // On an all-day event, 0 minutes would mean midnight — hours late, or a day
    // early for anything posted after 00:00. A timed slot fixes that.
    const event = buildAnnouncementEvent(announcement, 'a', APP_URL);
    expect(event.start.dateTime).toBe('2026-09-02T10:00:00.000Z');
    expect(event.start.date).toBeUndefined();
    expect(event.start.timeZone).toBe('Asia/Kolkata');
  });

  it('ends 15 minutes after it starts', () => {
    const event = buildAnnouncementEvent(announcement, 'a', APP_URL);
    const ms = new Date(event.end.dateTime) - new Date(event.start.dateTime);
    expect(ms).toBe(15 * 60 * 1000);
  });

  it('fires a popup and an email at zero minutes', () => {
    const event = buildAnnouncementEvent(announcement, 'a', APP_URL);
    expect(event.reminders.overrides).toEqual([
      { method: 'popup', minutes: 0 },
      { method: 'email', minutes: 0 },
    ]);
  });

  it('still does not mark anyone busy', () => {
    expect(buildAnnouncementEvent(announcement, 'a', APP_URL).transparency).toBe('transparent');
  });
});
