/**
 * calendarEvent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * The pure half of the Google Calendar sync: turning each kind of AirBuddy
 * record into a Calendar API event resource, deciding who should receive it,
 * and deciding when a change is worth an API call.
 *
 * Everything the web app shows on its own Calendar page — tasks, leaves and
 * roadmap milestones — plus announcements has a builder here, so a team member
 * who never opens the app still sees their whole workload in Google Calendar.
 *
 * Kept free of firebase-admin, firebase-functions and network access — its only
 * dependency is ./time — so it can be unit-tested from src/ through
 * createRequire, the same arrangement roadmapService.server.js uses. All I/O
 * (impersonation, API calls, Firestore write-back) lives in calendar.js.
 */

'use strict';

const { istDateString, DAY_MS } = require('./time');

/**
 * Domain-wide delegation only covers accounts in this Workspace. External
 * collaborators invited through `allowed_emails` (gmail addresses and the like)
 * cannot be impersonated, and asking them for consent individually would bring
 * back the OAuth warning screen this whole design exists to avoid — so they are
 * skipped rather than prompted.
 */
const WORKSPACE_DOMAIN = 'airbuddy.in';

/** Google Calendar colour ids, chosen to echo the app's own palette. */
const PRIORITY_COLOR = { high: '11', medium: '5', low: '7' };
const ROADMAP_COLOR = '2';      // sage — matches the teal milestone styling
const LEAVE_COLOR = '3';        // grape — clearly not work
const ANNOUNCEMENT_COLOR = '8'; // graphite — informational

/**
 * Fields a *task* event actually shows. A task update only talks to Google if
 * one of these changed — otherwise every progress tick, every checklist edit and
 * (importantly) calendar.js's own `calendarEventIds` write-back would trigger a
 * round of API calls.
 */
const SYNCED_FIELDS = [
  'title',
  'description',
  'startDate',
  'dueDate',
  'priority',
  'status',
  'module',
];

/**
 * Fields a *roadmap node* event shows.
 *
 * `progress` is deliberately absent even though it is interesting, because the
 * Phase 8 rollup rewrites it on every task tick anywhere below the node. Putting
 * it in the event would mean a Calendar API call per rollup — the node event
 * carries `status` instead, which only moves when something real happens.
 */
const NODE_SYNCED_FIELDS = [
  'title',
  'description',
  'startDate',
  'dueDate',
  'priority',
  'status',
  'isArchived',
];

/** Fields a *leave* event shows. */
const LEAVE_SYNCED_FIELDS = ['type', 'startDate', 'endDate', 'status'];

/** @returns {boolean} whether this address can be impersonated. */
function isSyncableEmail(email) {
  return typeof email === 'string'
    && email.trim().toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`);
}

/** A uid list that may legitimately be a bare string in legacy documents. */
function normalizeAssignees(assignedTo) {
  if (Array.isArray(assignedTo)) return [...new Set(assignedTo.filter(Boolean))];
  if (typeof assignedTo === 'string' && assignedTo) return [assignedTo];
  return [];
}

/**
 * Everyone who should see a task on their calendar.
 *
 * Work partners are included: the app shows a partnered task on their Dashboard
 * and in the Work Partner drawer, and the collaboration notification tells them
 * about it, so leaving it off their calendar would be the one place the work is
 * invisible. `workPartnerUids` is the flat uid array (the rich `workPartners`
 * array of maps is for rendering only — see collaborationService.js).
 *
 * @param {object} task
 * @returns {string[]} uids, de-duplicated
 */
function taskRecipients(task) {
  const assignees = normalizeAssignees((task || {}).assignedTo);
  const partners = normalizeAssignees((task || {}).workPartnerUids);
  return [...new Set([...assignees, ...partners])];
}

/** Firestore Timestamp | Date | string | null -> Date | null */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * All-day event date pair from an inclusive [start, end] range.
 *
 * The Calendar API treats an all-day `end.date` as *exclusive*, so a task due on
 * the 20th needs `end.date` = the 21st for the event to appear on the 20th at
 * all. Dates are formatted in IST for the same reason the client uses
 * toLocalDateString(): a UTC `toISOString().slice(0, 10)` reports the previous
 * day for anything after 18:30 UTC.
 *
 * @param {Date} start
 * @param {Date} endInclusive
 * @returns {{ start: {date: string}, end: {date: string} }}
 */
function allDayRange(start, endInclusive) {
  let end = endInclusive;
  if (!end || end.getTime() < start.getTime()) end = start; // guard bad data
  return {
    start: { date: istDateString(start) },
    end: { date: istDateString(new Date(end.getTime() + DAY_MS)) },
  };
}

/**
 * Reminder offsets that actually land at a time somebody reads them.
 *
 * This is the subtlety that makes or breaks the whole reminder story: an all-day
 * event starts at **midnight**, and Calendar counts `minutes` back from the
 * event start. So the obvious-looking `{ minutes: 60 }` on a task due tomorrow
 * fires at 23:00 tonight, and `{ minutes: 1440 }` fires at 00:00 — both while
 * everyone is asleep, which is exactly why the earlier version felt silent.
 *
 * 15 hours before midnight is 09:00 the previous morning, and each extra day
 * adds 1440. So these offsets put every reminder at 09:00 IST, alongside the
 * 09:00 cron push.
 */
const MIN_PER_DAY = 24 * 60;
const NINE_AM_DAY_BEFORE = 15 * 60;                       // 900
const NINE_AM_2_DAYS_BEFORE = NINE_AM_DAY_BEFORE + MIN_PER_DAY;      // 2340
const NINE_AM_4_DAYS_BEFORE = NINE_AM_DAY_BEFORE + 3 * MIN_PER_DAY;  // 5220

/**
 * Task reminders: an email and a popup at 09:00 the morning before, then a
 * second popup two mornings before. Email is included deliberately — the team
 * asked for nothing to happen silently, and an email is the one channel that
 * still arrives when browser notifications are denied and the app is closed.
 */
const TASK_REMINDERS = {
  useDefault: false,
  overrides: [
    { method: 'email', minutes: NINE_AM_DAY_BEFORE },
    { method: 'popup', minutes: NINE_AM_DAY_BEFORE },
    { method: 'popup', minutes: NINE_AM_2_DAYS_BEFORE },
  ],
};

/**
 * Milestone reminders reach further back — four mornings, two mornings, one
 * morning — because a milestone is a date to plan around, not to act on the day
 * before.
 */
const NODE_REMINDERS = {
  useDefault: false,
  overrides: [
    { method: 'email', minutes: NINE_AM_DAY_BEFORE },
    { method: 'popup', minutes: NINE_AM_DAY_BEFORE },
    { method: 'popup', minutes: NINE_AM_2_DAYS_BEFORE },
    { method: 'popup', minutes: NINE_AM_4_DAYS_BEFORE },
  ],
};

/** Announcements fire immediately — see buildAnnouncementEvent. */
const IMMEDIATE_REMINDERS = {
  useDefault: false,
  overrides: [
    { method: 'popup', minutes: 0 },
    { method: 'email', minutes: 0 },
  ],
};

/** IANA zone for the timed (non all-day) events. */
const TIMEZONE = 'Asia/Kolkata';

/**
 * A short timed slot, for the one record that is an instant rather than a day.
 *
 * @param {Date} start
 * @param {number} minutes Slot length
 */
function timedSlot(start, minutes) {
  return {
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: new Date(start.getTime() + minutes * 60 * 1000).toISOString(), timeZone: TIMEZONE },
  };
}

/**
 * Build the Calendar event body for a task.
 *
 * @param {object} task    Task document data
 * @param {string} taskId  Firestore document id, echoed into the event so an
 *                         event can be traced back to its task
 * @param {string} appUrl  Origin the app is served from (fcm.js APP_URL)
 * @returns {object} Calendar API event resource
 */
function buildEvent(task, taskId, appUrl) {
  const start = toDate(task.startDate) || toDate(task.dueDate) || new Date();
  const due = toDate(task.dueDate) || start;
  const done = task.status === 'completed';

  return {
    summary: `${done ? '✅ ' : ''}[AirBuddy] ${task.title || 'Untitled task'}`,
    description: [
      task.description ? `📋 ${task.description}` : '',
      `📌 Module: ${task.module || 'General'}`,
      `🚩 Priority: ${task.priority || 'medium'}`,
      `📊 Status: ${task.status || 'pending'}`,
      '',
      `Open in AirBuddy WorkSpace: ${appUrl}`,
      '— Synced automatically by AirBuddy WorkSpace',
    ].filter(Boolean).join('\n'),
    ...allDayRange(start, due),
    colorId: PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.medium,
    reminders: TASK_REMINDERS,
    source: { title: 'AirBuddy WorkSpace', url: appUrl },
    extendedProperties: { private: { airbuddyTaskId: taskId } },
  };
}

/**
 * Build the Calendar event body for a roadmap milestone node.
 *
 * Milestones get a longer lead time than tasks — three days and one day ahead —
 * because they are the dates people need to plan around rather than act on the
 * same morning.
 *
 * @param {object} node
 * @param {string} nodeId
 * @param {string} appUrl
 * @returns {object} Calendar API event resource
 */
function buildNodeEvent(node, nodeId, appUrl) {
  const due = toDate(node.dueDate);
  const start = toDate(node.startDate) || due;
  const done = node.status === 'completed';
  const depthLabel = node.depth === 0 ? 'Root milestone' : 'Milestone';

  return {
    summary: `${done ? '✅ ' : ''}[AirBuddy Roadmap] ${node.title || 'Untitled milestone'}`,
    description: [
      node.description ? `📋 ${node.description}` : '',
      `🗺️ ${depthLabel}`,
      `🚩 Priority: ${node.priority || 'medium'}`,
      `📊 Status: ${node.status || 'pending'}`,
      '',
      `Open in AirBuddy WorkSpace: ${appUrl}/roadmap/${nodeId}`,
      '— Synced automatically by AirBuddy WorkSpace',
    ].filter(Boolean).join('\n'),
    ...allDayRange(start, due),
    colorId: ROADMAP_COLOR,
    reminders: NODE_REMINDERS,
    source: { title: 'AirBuddy WorkSpace Roadmap', url: `${appUrl}/roadmap/${nodeId}` },
    extendedProperties: { private: { airbuddyNodeId: nodeId } },
  };
}

/**
 * Build the Calendar event body for an approved leave.
 *
 * `startDate` / `endDate` are stored as inclusive `YYYY-MM-DD` strings
 * (hrmsService.applyForLeave), so the last day of the leave has to be covered by
 * allDayRange's exclusive end. No reminders — a day off is not a to-do, and
 * blocking the days is the whole point.
 *
 * @param {object} leave
 * @param {string} leaveId
 * @param {string} appUrl
 * @returns {object} Calendar API event resource
 */
function buildLeaveEvent(leave, leaveId, appUrl) {
  const start = toDate(leave.startDate) || new Date();
  const end = toDate(leave.endDate) || start;
  const type = leave.type ? `${leave.type} leave` : 'Leave';

  return {
    summary: `🌴 [AirBuddy] ${type.charAt(0).toUpperCase()}${type.slice(1)} (approved)`,
    description: [
      leave.reason ? `📋 ${leave.reason}` : '',
      `📊 Status: ${leave.status || 'approved'}`,
      '',
      `Open in AirBuddy WorkSpace: ${appUrl}/hrms/leaves`,
      '— Synced automatically by AirBuddy WorkSpace',
    ].filter(Boolean).join('\n'),
    ...allDayRange(start, end),
    colorId: LEAVE_COLOR,
    transparency: 'opaque', // shows the person as busy for those days
    reminders: { useDefault: false, overrides: [] },
    source: { title: 'AirBuddy WorkSpace', url: `${appUrl}/hrms/leaves` },
    extendedProperties: { private: { airbuddyLeaveId: leaveId } },
  };
}

/**
 * Build the Calendar event body for an announcement.
 *
 * An announcement has no date of its own, so it becomes an all-day entry on the
 * day it was posted — the point is that somebody who never opens the app still
 * finds it. `transparency: 'transparent'` keeps it from marking the person busy.
 *
 * @param {object} announcement
 * @param {string} announcementId
 * @param {string} appUrl
 * @returns {object} Calendar API event resource
 */
function buildAnnouncementEvent(announcement, announcementId, appUrl) {
  const posted = toDate(announcement.createdAt) || new Date();

  return {
    summary: `📢 [AirBuddy] ${announcement.title || 'Announcement'}`,
    description: [
      announcement.message ? `${announcement.message}` : '',
      '',
      `Open in AirBuddy WorkSpace: ${appUrl}/announcements`,
      '— Synced automatically by AirBuddy WorkSpace',
    ].filter(Boolean).join('\n'),
    // A timed 15-minute slot at the moment it was posted, not an all-day entry.
    // That is what lets the reminder below fire *now*: on an all-day event a
    // 0-minute reminder means midnight, which would be hours late or a day early.
    ...timedSlot(posted, 15),
    colorId: ANNOUNCEMENT_COLOR,
    transparency: 'transparent', // informational — does not block the day
    reminders: IMMEDIATE_REMINDERS,
    source: { title: 'AirBuddy WorkSpace', url: `${appUrl}/announcements` },
    extendedProperties: { private: { airbuddyAnnouncementId: announcementId } },
  };
}

/**
 * Did any of `fields` change between two versions of a document?
 *
 * Timestamps are compared by value — two Timestamp objects for the same instant
 * are never `===`, so a naive comparison would report a change on every write
 * and hammer the API. Arrays are compared element-wise for the same reason.
 *
 * @param {object} before
 * @param {object} after
 * @param {string[]} fields
 * @returns {boolean}
 */
function fieldsChanged(before, after, fields) {
  return fields.some((field) => {
    const a = (before || {})[field];
    const b = (after || {})[field];

    const aDate = toDate(a);
    const bDate = toDate(b);
    if (aDate && bDate) return aDate.getTime() !== bDate.getTime();
    if (aDate || bDate) return true;

    if (Array.isArray(a) || Array.isArray(b)) {
      const arrA = Array.isArray(a) ? a : [];
      const arrB = Array.isArray(b) ? b : [];
      return arrA.length !== arrB.length || arrA.some((v, i) => v !== arrB[i]);
    }

    return (a ?? null) !== (b ?? null);
  });
}

/** Task-specific wrapper kept for readability at the call sites. */
function syncedFieldsChanged(before, after) {
  return fieldsChanged(before, after, SYNCED_FIELDS);
}

/**
 * Should this roadmap node be on anybody's calendar?
 *
 * Mirrors what the web Calendar page shows (roadmapService.getRoadmapCalendarEvents
 * skips nodes with no dueDate) and adds the two obvious exclusions: an archived
 * node is not upcoming work, and a node with no assignee has nobody to show it
 * to. Unassigned milestones therefore appear on the app's Calendar page but not
 * in Google — deliberately, so nobody's personal calendar fills up with
 * milestones that are not theirs.
 *
 * @param {object} node
 * @returns {boolean}
 */
function isNodeCalendarEligible(node) {
  if (!node) return false;
  if (node.isArchived) return false;
  if (!toDate(node.dueDate)) return false;
  return normalizeAssignees(node.assignedTo).length > 0;
}

/**
 * Should this leave be on the applicant's calendar?
 * Only once approved — a pending request is not a commitment, and a rejected one
 * must not block days. A leave that flips away from `approved` has its event
 * removed by calendar.js.
 *
 * @param {object} leave
 * @returns {boolean}
 */
function isLeaveCalendarEligible(leave) {
  return Boolean(leave) && leave.status === 'approved' && Boolean(toDate(leave.startDate));
}

module.exports = {
  WORKSPACE_DOMAIN,
  PRIORITY_COLOR,
  TASK_REMINDERS,
  NODE_REMINDERS,
  IMMEDIATE_REMINDERS,
  NINE_AM_DAY_BEFORE,
  SYNCED_FIELDS,
  NODE_SYNCED_FIELDS,
  LEAVE_SYNCED_FIELDS,
  isSyncableEmail,
  normalizeAssignees,
  taskRecipients,
  toDate,
  allDayRange,
  buildEvent,
  buildNodeEvent,
  buildLeaveEvent,
  buildAnnouncementEvent,
  fieldsChanged,
  syncedFieldsChanged,
  isNodeCalendarEligible,
  isLeaveCalendarEligible,
};
