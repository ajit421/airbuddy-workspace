/**
 * time.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Date helpers shared by the scheduled functions.
 *
 * Why this exists: Cloud Functions containers run with a UTC clock, but the
 * company is on IST (@airbuddy.in). `new Date().getDate()` inside a function is
 * therefore the UTC calendar day, which is the day *before* the Indian one for
 * roughly 5.5 hours every night.
 *
 * Task/roadmap `dueDate` values are written client-side as
 * `new Date('YYYY-MM-DD')`, which JavaScript parses as UTC midnight of that
 * calendar day. So the correct query boundary is "UTC midnight of the *Indian*
 * calendar day", which is what these helpers return.
 */

'use strict';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * UTC midnight of the current Indian calendar day.
 *
 * @param {Date} [now]
 * @returns {Date}
 */
function istTodayUtcMidnight(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ));
}

/**
 * `days` offset from istTodayUtcMidnight(). +1 = tomorrow, -1 = yesterday.
 *
 * @param {number} days
 * @param {Date} [now]
 * @returns {Date}
 */
function istDayOffsetUtcMidnight(days, now = new Date()) {
  return new Date(istTodayUtcMidnight(now).getTime() + days * DAY_MS);
}

/**
 * The Indian calendar date of an instant, as `YYYY-MM-DD`.
 *
 * Google Calendar all-day events take a bare date, and that date must be the
 * one the employee would name. A UTC `toISOString().slice(0, 10)` is the wrong
 * answer for the same reason it is wrong on the client (see
 * src/utils/dateHelpers.js): a task created at 23:40 IST is still the previous
 * day in UTC, so the event would land on the wrong day of the calendar.
 *
 * @param {Date} date
 * @returns {string} `YYYY-MM-DD` in IST
 */
function istDateString(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = {
  IST_OFFSET_MS,
  DAY_MS,
  istTodayUtcMidnight,
  istDayOffsetUtcMidnight,
  istDateString,
};
