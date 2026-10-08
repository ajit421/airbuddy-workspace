/**
 * ganttHelpers.js
 * Pure functions behind the roadmap Gantt view and its CSV / Excel export.
 *
 * Everything here works on day keys ('YYYY-MM-DD') rather than Date objects.
 * A roadmap date is a calendar day, not an instant, and node dates arrive in
 * two shapes: createNode stores a Date (UTC midnight of the picked day) while
 * updateNode has stored the raw form string. toDayKey folds both into one key,
 * and the arithmetic below parses keys as UTC so no time zone or daylight
 * saving shift can move a bar by a day.
 *
 * No Firestore and no React in this file, so it is unit-tested directly
 * (ganttHelpers.test.js) like computeHierarchy.
 */
import { toDate, toLocalDateString } from './dateHelpers';

const DAY_MS     = 24 * 60 * 60 * 1000;
// Built from its code point so no editor can turn it into an invisible literal.
const UTF8_BOM   = String.fromCharCode(0xfeff);
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GANTT_ZOOMS = ['week', 'month', 'quarter'];

/** Pixel width of one day for each zoom level. */
export const DAY_WIDTH = { week: 28, month: 8, quarter: 3 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Day keys ────────────────────────────────────────────────────────────────

/**
 * 'YYYY-MM-DD' for a node date, or null.
 * Accepts a Firestore Timestamp, a Date, a 'YYYY-MM-DD' string or any string
 * Date can parse. A day-key string is returned untouched: parsing it would
 * make it UTC midnight, which is the previous day west of Greenwich.
 */
export function toDayKey(value) {
  if (!value) return null;
  const key = typeof value === 'string' && DAY_KEY_RE.test(value)
    ? value
    : (() => {
        const d = toDate(value);
        return d && !isNaN(d) ? toLocalDateString(d) : null;
      })();
  return key && isPlausibleDayKey(key) ? key : null;
}

/**
 * A date picker accepts year 0006 when someone types "6" for the year, and
 * one live milestone was saved that way. A single such date stretched the
 * whole timeline back to 1906 and blanked the header, so implausible dates
 * are treated as missing rather than drawn.
 */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const isPlausibleDayKey = (key) => {
  if (!DAY_KEY_RE.test(key)) return false;
  const year = Number(key.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
};

const keyToUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// The Date here is built from UTC parts, so its UTC fields are the day itself.
const utcToKey = (ms) => {
  const d = new Date(ms);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

/** Whole days from one key to another (negative when `to` is earlier). */
export const dayDiff = (fromKey, toKey) =>
  Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / DAY_MS);

export const addDays = (key, n) => utcToKey(keyToUtc(key) + n * DAY_MS);

/** 0 = Monday ... 6 = Sunday */
const weekdayIndex = (key) => (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;

export const startOfWeek = (key) => addDays(key, -weekdayIndex(key));

const startOfMonth = (key) => `${key.slice(0, 7)}-01`;

const endOfMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return utcToKey(Date.UTC(y, m, 0)); // day 0 of next month = last day of this one
};

/** True on Saturday and Sunday. */
export const isWeekend = (key) => weekdayIndex(key) >= 5;

/** '07-Sep' style label, used by the header and the Excel week columns. */
export const shortDayLabel = (key) =>
  `${key.slice(8, 10)}-${MONTHS[Number(key.slice(5, 7)) - 1]}`;

export const monthLabel = (key) =>
  `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

// ── Rows ────────────────────────────────────────────────────────────────────

const byEndThenTitle = (a, b) => {
  if (a.ownEnd && b.ownEnd && a.ownEnd !== b.ownEnd) return a.ownEnd < b.ownEnd ? -1 : 1;
  if (a.ownEnd && !b.ownEnd) return -1;
  if (!a.ownEnd && b.ownEnd) return 1;
  return (a.node.order ?? 0) - (b.node.order ?? 0) ||
    (a.node.title ?? '').localeCompare(b.node.title ?? '') ||
    a.node.id.localeCompare(b.node.id);
};

/**
 * Flat, tree-ordered Gantt rows from a flat array of roadmap nodes.
 *
 * Siblings sort the way the List view sorts them (own due date, undated last,
 * then title), so the two views agree. Each row:
 *   id, node, parentId, ancestors[], depth, wbs ('1', '1.2'), title,
 *   start, end       day keys, or null when the row has no dates at all
 *   derived          true when start/end come from the children, which is the
 *                    case for every root milestone today (they carry no dates)
 *   isMilestone      a single-day marker: the node has only one of the dates
 *   hasChildren, status, priority, progress, assignedTo,
 *   overdue          end before today and not completed
 *   daysOverdue
 *
 * A node whose parent is not in the set (archived parent, or filtered out
 * upstream) is treated as a root rather than dropped.
 *
 * @param {Array<object>} nodes
 * @param {{ today?: string }} [opts] today's day key, injectable for tests
 */
export function buildGanttRows(nodes = [], { today = toLocalDateString() } = {}) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map();
  const roots = [];

  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId) && n.parentId !== n.id) {
      if (!kids.has(n.parentId)) kids.set(n.parentId, []);
      kids.get(n.parentId).push(n);
    } else {
      roots.push(n);
    }
  }

  const visited = new Set();

  // Post-order: children are resolved first so a parent can derive its span.
  const resolve = (node) => {
    visited.add(node.id);
    const children = (kids.get(node.id) ?? [])
      .filter((c) => !visited.has(c.id))   // guards a corrupt parent cycle
      .map(resolve);

    const ownStart = toDayKey(node.startDate);
    const ownEnd   = toDayKey(node.dueDate);

    let start = ownStart ?? ownEnd;
    let end   = ownEnd ?? ownStart;
    let derived = false;

    if (start && end && end < start) [start, end] = [end, start];

    if (!start && !end) {
      for (const c of children) {
        if (c.start && (!start || c.start < start)) start = c.start;
        if (c.end   && (!end   || c.end   > end))   end   = c.end;
      }
      derived = Boolean(start || end);
    }

    return {
      node,
      ownEnd,
      start,
      end,
      derived,
      isMilestone: !derived && Boolean(start) && Boolean(ownStart) !== Boolean(ownEnd),
      children: children.sort(byEndThenTitle),
    };
  };

  const tree = roots.map(resolve).sort(byEndThenTitle);
  const rows = [];

  const flatten = (item, depth, wbs, ancestors) => {
    const n = item.node;
    const status = n.status ?? 'pending';
    const overdue = Boolean(item.end) && item.end < today && status !== 'completed';
    rows.push({
      id:          n.id,
      node:        n,
      parentId:    ancestors.at(-1) ?? null,
      ancestors,
      depth,
      wbs,
      title:       n.title ?? '(untitled)',
      start:       item.start,
      end:         item.end,
      derived:     item.derived,
      isMilestone: item.isMilestone,
      hasChildren: item.children.length > 0,
      status,
      priority:    n.priority ?? 'medium',
      progress:    Math.max(0, Math.min(100, Math.round(Number(n.progress) || 0))),
      assignedTo:  Array.isArray(n.assignedTo) ? n.assignedTo : [],
      overdue,
      daysOverdue: overdue ? dayDiff(item.end, today) : 0,
    });
    item.children.forEach((c, i) =>
      flatten(c, depth + 1, `${wbs}.${i + 1}`, [...ancestors, n.id]));
  };

  tree.forEach((item, i) => flatten(item, 0, String(i + 1), []));
  return rows;
}

/**
 * Rows matching the toolbar filters, plus every ancestor of a match so a hit
 * deep in the tree keeps its context. Searching "PCB" matches no root title,
 * so without this the whole chart would go blank.
 */
export function filterGanttRows(rows, { search = '', status = 'all', priority = 'all' } = {}) {
  const q = search.trim().toLowerCase();
  if (!q && status === 'all' && priority === 'all') return rows;

  const keep = new Set();
  for (const r of rows) {
    const match =
      (!q || r.title.toLowerCase().includes(q)) &&
      (status === 'all' || r.status === status) &&
      (priority === 'all' || r.priority === priority);
    if (match) {
      keep.add(r.id);
      r.ancestors.forEach((a) => keep.add(a));
    }
  }
  return rows.filter((r) => keep.has(r.id));
}

/** Drops the descendants of collapsed rows. */
export function hideCollapsed(rows, collapsedIds) {
  if (!collapsedIds || collapsedIds.size === 0) return rows;
  return rows.filter((r) => !r.ancestors.some((a) => collapsedIds.has(a)));
}

// ── Timeline ────────────────────────────────────────────────────────────────

/**
 * Visible date range: every dated row plus today, padded to whole weeks
 * (week zoom) or whole months (month and quarter zoom) with a little air
 * on both sides. Falls back to the four weeks around today when nothing
 * is dated.
 *
 * @returns {{ start: string, end: string, days: number }}
 */
export function computeRange(rows, zoom = 'week', today = toLocalDateString()) {
  let min = today;
  let max = today;
  for (const r of rows) {
    if (r.start && r.start < min) min = r.start;
    if (r.end   && r.end   > max) max = r.end;
  }
  if (min === max) {
    min = addDays(today, -14);
    max = addDays(today, 14);
  }

  let start;
  let end;
  if (zoom === 'week') {
    start = startOfWeek(addDays(min, -7));
    end   = addDays(startOfWeek(addDays(max, 7)), 6);
  } else {
    start = startOfMonth(min);
    end   = endOfMonth(max);
  }
  return { start, end, days: dayDiff(start, end) + 1 };
}

/**
 * Header bands for the timeline.
 *   months: [{ key, label, offset, days }]  top band
 *   ticks:  [{ key, label, offset, days }]  bottom band, days in week zoom,
 *                                           weeks (from Monday) otherwise
 * Offsets and lengths are in days from range.start.
 */
export function buildTimelineHeader(range, zoom = 'week') {
  const months = [];
  let cursor = range.start;
  while (cursor <= range.end) {
    const monthEnd = endOfMonth(cursor) < range.end ? endOfMonth(cursor) : range.end;
    months.push({
      key:    cursor,
      label:  monthLabel(cursor),
      offset: dayDiff(range.start, cursor),
      days:   dayDiff(cursor, monthEnd) + 1,
    });
    cursor = addDays(monthEnd, 1);
  }

  const ticks = [];
  if (zoom === 'week') {
    for (let i = 0; i < range.days; i++) {
      const key = addDays(range.start, i);
      ticks.push({ key, label: String(Number(key.slice(8, 10))), offset: i, days: 1, weekend: isWeekend(key) });
    }
  } else {
    let week = startOfWeek(range.start);
    while (week <= range.end) {
      const from = week < range.start ? range.start : week;
      const to   = addDays(week, 6) > range.end ? range.end : addDays(week, 6);
      ticks.push({
        key:    week,
        label:  String(Number(week.slice(8, 10))),
        offset: dayDiff(range.start, from),
        days:   dayDiff(from, to) + 1,
      });
      week = addDays(week, 7);
    }
  }
  return { months, ticks };
}

/** Mondays of every week the range touches, for the Excel Gantt sheet. */
export function weekStarts(range) {
  const out = [];
  for (let w = startOfWeek(range.start); w <= range.end; w = addDays(w, 7)) out.push(w);
  return out;
}

/**
 * Where a row's bar sits on a day grid starting at rangeStart, in day indexes,
 * and how many of its days the progress fill covers. Used by the Excel Gantt
 * sheet, which draws one cell per day, so the export matches the view.
 *
 * @returns {{ from: number, to: number, filled: number } | null}
 */
export function barCells(row, rangeStart) {
  if (!row.start || !row.end) return null;
  const from = dayDiff(rangeStart, row.start);
  const to   = dayDiff(rangeStart, row.end);
  const span = to - from + 1;
  return { from, to, filled: Math.round((row.progress / 100) * span) };
}

/** 'Archit Jain' -> 'AJ', the same initials the view's owner column shows. */
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

/**
 * A translucent colour flattened onto a background, as 'FFRRGGBB' ARGB.
 * Excel has no alpha, so the view's `bg-yellow-500/15` on the dark surface
 * is reproduced by mixing the two colours.
 *
 * @param {string} fg     'RRGGBB'
 * @param {string} bg     'RRGGBB'
 * @param {number} alpha  0..1, weight of fg
 */
export function blendArgb(fg, bg, alpha) {
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  const mix = [0, 2, 4].map((i) =>
    Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)).toString(16).padStart(2, '0'));
  return `FF${mix.join('').toUpperCase()}`;
}

// ── Export ──────────────────────────────────────────────────────────────────

export const EXPORT_COLUMNS = [
  { key: 'wbs',         header: 'WBS' },
  { key: 'level',       header: 'Level' },
  { key: 'parent',      header: 'Parent' },
  { key: 'title',       header: 'Milestone' },
  { key: 'status',      header: 'Status' },
  { key: 'priority',    header: 'Priority' },
  { key: 'progress',    header: 'Progress %' },
  { key: 'start',       header: 'Start' },
  { key: 'end',         header: 'Due' },
  { key: 'duration',    header: 'Duration (days)' },
  { key: 'assignees',   header: 'Assigned to' },
  { key: 'overdue',     header: 'Overdue' },
  { key: 'daysOverdue', header: 'Days overdue' },
  { key: 'derived',     header: 'Dates derived from children' },
  { key: 'link',        header: 'Link' },
];

/**
 * One plain record per row, shared by the CSV and the Excel writer so the
 * two files always carry the same columns and values.
 *
 * @param {Array<object>} rows       Gantt rows (already filtered)
 * @param {Map<string,string>|object} userNames uid -> display name
 * @param {{ baseUrl?: string }} [opts] origin for the Link column
 */
export function toExportRecords(rows, userNames = new Map(), { baseUrl = '' } = {}) {
  const nameOf = (uid) =>
    (userNames instanceof Map ? userNames.get(uid) : userNames[uid]) || uid;
  const titleById = new Map(rows.map((r) => [r.id, r.title]));

  return rows.map((r) => ({
    wbs:         r.wbs,
    level:       r.depth,
    parent:      r.parentId ? (titleById.get(r.parentId) ?? '') : '',
    title:       r.title,
    status:      r.status,
    priority:    r.priority,
    progress:    r.progress,
    start:       r.start ?? '',
    end:         r.end ?? '',
    duration:    r.start && r.end ? dayDiff(r.start, r.end) + 1 : '',
    assignees:   r.assignedTo.map(nameOf).join('; '),
    overdue:     r.overdue ? 'Yes' : 'No',
    daysOverdue: r.daysOverdue || '',
    derived:     r.derived ? 'Yes' : 'No',
    link:        baseUrl ? `${baseUrl}/roadmap/${r.id}` : '',
  }));
}

/**
 * One CSV cell. Quotes everything, doubles inner quotes, and defuses
 * spreadsheet formulas: titles are typed by people, and a cell starting with
 * = + - @ (or a tab / carriage return) is executed as a formula by Excel and
 * Google Sheets when the file is opened. A leading apostrophe makes it text.
 */
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * The CSV file body. Starts with a UTF-8 byte order mark and uses CRLF line
 * endings: without the BOM, Excel on Windows reads the file as ANSI and
 * mangles any non-ASCII name.
 */
export function toCsv(records) {
  const lines = [
    EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(','),
    ...records.map((rec) => EXPORT_COLUMNS.map((c) => csvCell(rec[c.key])).join(',')),
  ];
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

/** 'airbuddy-roadmap-2026-10-07.xlsx' */
export const exportFileName = (ext, today = toLocalDateString()) =>
  `airbuddy-roadmap-${today}.${ext}`;
