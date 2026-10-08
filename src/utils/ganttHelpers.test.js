import { describe, it, expect } from 'vitest';
import {
  toDayKey, dayDiff, addDays, startOfWeek,
  buildGanttRows, filterGanttRows, hideCollapsed,
  computeRange, buildTimelineHeader, weekStarts,
  toExportRecords, csvCell, toCsv, exportFileName, EXPORT_COLUMNS,
  barCells, initials, blendArgb,
} from './ganttHelpers';

const TODAY = '2026-10-07';

// Shaped like the live roadmap: undated roots, weekly Monday-Saturday children.
const node = (id, extra = {}) => ({
  id, title: id, status: 'pending', priority: 'medium', progress: 0,
  parentId: null, assignedTo: [], ...extra,
});

const NODES = [
  node('ceiling', { title: 'Ceiling Fan Motor', priority: 'high' }),
  node('pcb2', {
    title: 'PCB fabrication for Prototype 2', parentId: 'ceiling',
    startDate: '2026-08-31', dueDate: '2026-09-05', status: 'in-progress',
    progress: 59, assignedTo: ['u1', 'u2'],
  }),
  node('rca', {
    title: 'Root-cause failure analysis', parentId: 'ceiling',
    startDate: '2026-08-24', dueDate: '2026-08-29', status: 'completed', progress: 100,
  }),
  node('handover', {
    title: 'Handover', parentId: 'ceiling',
    startDate: '2026-11-30', dueDate: '2026-12-05',
  }),
  node('ac', { title: 'AC Outdoor Fan Motor' }),
  node('ac1', { title: 'Release P1 PCB', parentId: 'ac', dueDate: '2026-08-29' }),
];

describe('toDayKey', () => {
  it('passes a YYYY-MM-DD string through untouched', () => {
    expect(toDayKey('2026-09-05')).toBe('2026-09-05');
  });

  it('reads a Date on its local calendar day', () => {
    // 00:15 local is the previous day in UTC for any UTC+ zone (IST included);
    // toISOString().slice(0, 10) would get this wrong.
    expect(toDayKey(new Date(2026, 8, 5, 0, 15))).toBe('2026-09-05');
  });

  it('reads a Firestore Timestamp-like value', () => {
    expect(toDayKey({ toDate: () => new Date(2026, 9, 3, 12) })).toBe('2026-10-03');
  });

  it('treats an implausible year as missing (a date picker accepts year 0006)', () => {
    expect(toDayKey('0006-11-23')).toBeNull();
    expect(toDayKey({ toDate: () => new Date(6, 10, 23) })).toBeNull();
    expect(toDayKey('2101-01-01')).toBeNull();
    expect(toDayKey('2100-12-31')).toBe('2100-12-31');
  });

  it('keeps one bad date from wrecking the range: the node falls back to its other date', () => {
    const rows = buildGanttRows([
      node('root'),
      node('bad', { parentId: 'root', startDate: '0006-11-23', dueDate: '2026-11-28' }),
      node('ok', { parentId: 'root', startDate: '2026-09-01', dueDate: '2026-09-05' }),
    ], { today: TODAY });
    expect(rows.find((r) => r.id === 'bad')).toMatchObject({ start: '2026-11-28', end: '2026-11-28', isMilestone: true });
    expect(rows[0]).toMatchObject({ start: '2026-09-01', end: '2026-11-28' });
    expect(computeRange(rows, 'month', TODAY)).toMatchObject({ start: '2026-09-01', end: '2026-11-30' });
  });

  it('returns null for empty or unparseable input', () => {
    expect(toDayKey(null)).toBeNull();
    expect(toDayKey('')).toBeNull();
    expect(toDayKey('not a date')).toBeNull();
  });
});

describe('day arithmetic', () => {
  it('counts whole days across a month boundary', () => {
    expect(dayDiff('2026-08-31', '2026-09-05')).toBe(5);
    expect(dayDiff('2026-09-05', '2026-08-31')).toBe(-5);
    expect(addDays('2026-08-31', 7)).toBe('2026-09-07');
  });

  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-09-05')).toBe('2026-08-31'); // Saturday
    expect(startOfWeek('2026-08-31')).toBe('2026-08-31'); // Monday
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31'); // Sunday
  });
});

describe('buildGanttRows', () => {
  const rows = buildGanttRows(NODES, { today: TODAY });
  const row = (id) => rows.find((r) => r.id === id);

  it('orders rows as a tree, siblings by due date, and numbers them WBS-style', () => {
    expect(rows.map((r) => `${r.wbs} ${r.id}`)).toEqual([
      '1 ac', '1.1 ac1',
      '2 ceiling', '2.1 rca', '2.2 pcb2', '2.3 handover',
    ]);
  });

  it('derives an undated root span from its children', () => {
    expect(row('ceiling')).toMatchObject({
      start: '2026-08-24', end: '2026-12-05', derived: true, isMilestone: false, hasChildren: true,
    });
  });

  it('uses the own dates of a dated node', () => {
    expect(row('pcb2')).toMatchObject({
      start: '2026-08-31', end: '2026-09-05', derived: false, depth: 1, parentId: 'ceiling',
      ancestors: ['ceiling'], progress: 59,
    });
  });

  it('turns a node with only a due date into a single-day milestone', () => {
    expect(row('ac1')).toMatchObject({ start: '2026-08-29', end: '2026-08-29', isMilestone: true });
  });

  it('marks overdue only when the due date is past and the work is not completed', () => {
    expect(row('pcb2')).toMatchObject({ overdue: true, daysOverdue: 32 });
    expect(row('rca').overdue).toBe(false);       // completed
    expect(row('handover').overdue).toBe(false);  // future
  });

  it('accepts Date and Timestamp dates as well as strings', () => {
    const [r] = buildGanttRows([
      node('x', {
        startDate: new Date(2026, 8, 7, 9),
        dueDate:   { toDate: () => new Date(2026, 8, 12, 9) },
      }),
    ], { today: TODAY });
    expect(r).toMatchObject({ start: '2026-09-07', end: '2026-09-12' });
  });

  it('keeps a node with no dates and no dated children, without a bar', () => {
    const [r] = buildGanttRows([node('empty')], { today: TODAY });
    expect(r).toMatchObject({ start: null, end: null, derived: false, isMilestone: false });
  });

  it('treats an orphan as a root instead of dropping it', () => {
    const r = buildGanttRows([node('orphan', { parentId: 'gone', dueDate: '2026-09-01' })], { today: TODAY });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ depth: 0, wbs: '1' });
  });

  it('derives through more than one level', () => {
    const r = buildGanttRows([
      node('a'),
      node('b', { parentId: 'a' }),
      node('c', { parentId: 'b', startDate: '2026-09-01', dueDate: '2026-09-10' }),
    ], { today: TODAY });
    expect(r.map((x) => [x.wbs, x.start, x.end, x.derived])).toEqual([
      ['1', '2026-09-01', '2026-09-10', true],
      ['1.1', '2026-09-01', '2026-09-10', true],
      ['1.1.1', '2026-09-01', '2026-09-10', false],
    ]);
  });
});

describe('filterGanttRows / hideCollapsed', () => {
  const rows = buildGanttRows(NODES, { today: TODAY });

  it('returns every row when no filter is active', () => {
    expect(filterGanttRows(rows, {})).toBe(rows);
  });

  it('keeps the parent of a matching child', () => {
    const ids = filterGanttRows(rows, { search: 'pcb' }).map((r) => r.id);
    expect(ids).toEqual(['ac', 'ac1', 'ceiling', 'pcb2']);
  });

  it('filters by status and priority', () => {
    expect(filterGanttRows(rows, { status: 'completed' }).map((r) => r.id)).toEqual(['ceiling', 'rca']);
    expect(filterGanttRows(rows, { priority: 'high' }).map((r) => r.id)).toEqual(['ceiling']);
  });

  it('hides the descendants of a collapsed row', () => {
    expect(hideCollapsed(rows, new Set(['ceiling'])).map((r) => r.id)).toEqual(['ac', 'ac1', 'ceiling']);
  });
});

describe('timeline', () => {
  const rows = buildGanttRows(NODES, { today: TODAY });

  it('pads the week-zoom range to whole weeks, a week either side', () => {
    const range = computeRange(rows, 'week', TODAY);
    expect(range).toEqual({ start: '2026-08-17', end: '2026-12-13', days: 119 });
  });

  it('pads the month-zoom range to whole months', () => {
    expect(computeRange(rows, 'month', TODAY)).toMatchObject({ start: '2026-08-01', end: '2026-12-31' });
  });

  it('always includes today and falls back to a month around it', () => {
    expect(computeRange([], 'month', TODAY)).toMatchObject({ start: '2026-09-01', end: '2026-10-31' });
  });

  it('builds month bands that cover the whole range', () => {
    const range = computeRange(rows, 'week', TODAY);
    const { months, ticks } = buildTimelineHeader(range, 'week');
    expect(months.map((m) => m.label)).toEqual(['Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026']);
    expect(months.reduce((n, m) => n + m.days, 0)).toBe(range.days);
    expect(ticks).toHaveLength(range.days);
  });

  it('uses week ticks outside week zoom, clipped to the range', () => {
    const range = computeRange(rows, 'month', TODAY);
    const { ticks } = buildTimelineHeader(range, 'month');
    expect(ticks[0]).toMatchObject({ offset: 0, days: 2 }); // Aug 1-2 2026 is Sat-Sun
    expect(ticks.reduce((n, t) => n + t.days, 0)).toBe(range.days);
  });

  it('lists the Mondays a range touches', () => {
    expect(weekStarts({ start: '2026-09-02', end: '2026-09-14' }))
      .toEqual(['2026-08-31', '2026-09-07', '2026-09-14']);
  });
});

describe('Excel sheet helpers', () => {
  const rows = buildGanttRows(NODES, { today: TODAY });
  const row = (id) => rows.find((r) => r.id === id);

  it('places a bar on the day grid and sizes its progress fill', () => {
    // pcb2: 31 Aug to 5 Sep, 59% of 6 days rounds to 4 filled days
    expect(barCells(row('pcb2'), '2026-08-17')).toEqual({ from: 14, to: 19, filled: 4 });
    expect(barCells(row('rca'), '2026-08-17')).toEqual({ from: 7, to: 12, filled: 6 });
    expect(barCells(row('ac1'), '2026-08-17')).toEqual({ from: 12, to: 12, filled: 0 });
    expect(barCells({ start: null, end: null, progress: 0 }, '2026-08-17')).toBeNull();
  });

  it('builds initials like the owner column', () => {
    expect(initials('Archit Jain')).toBe('AJ');
    expect(initials('Susanta Kumar Sethy')).toBe('SK');
    expect(initials('')).toBe('?');
  });

  it('flattens a translucent colour onto the background', () => {
    expect(blendArgb('FFFFFF', '000000', 1)).toBe('FFFFFFFF');
    expect(blendArgb('FFFFFF', '000000', 0)).toBe('FF000000');
    expect(blendArgb('EAB308', '161B22', 0.15)).toBe('FF36321E');
  });
});

describe('export', () => {
  const rows = buildGanttRows(NODES, { today: TODAY });
  const names = new Map([['u1', 'Archit Jain'], ['u2', 'Bibhuti Rajput']]);
  const records = toExportRecords(rows, names, { baseUrl: 'https://example.app' });
  const pcb = records.find((r) => r.wbs === '2.2');

  it('produces one record per row with the documented values', () => {
    expect(records).toHaveLength(rows.length);
    expect(pcb).toEqual({
      wbs: '2.2', level: 1, parent: 'Ceiling Fan Motor',
      title: 'PCB fabrication for Prototype 2', status: 'in-progress', priority: 'medium',
      progress: 59, start: '2026-08-31', end: '2026-09-05', duration: 6,
      assignees: 'Archit Jain; Bibhuti Rajput', overdue: 'Yes', daysOverdue: 32,
      derived: 'No', link: 'https://example.app/roadmap/pcb2',
    });
  });

  it('falls back to the uid when a name is unknown, and accepts a plain object map', () => {
    const [r] = toExportRecords(
      buildGanttRows([node('n', { assignedTo: ['u1', 'u9'] })], { today: TODAY }),
      { u1: 'Archit Jain' },
    );
    expect(r.assignees).toBe('Archit Jain; u9');
    expect(r.link).toBe('');
  });

  it('quotes cells and doubles inner quotes', () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(0)).toBe('"0"');
  });

  it('defuses formula-looking cells', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-cmd')).toBe('"\'-cmd"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('Plain title')).toBe('"Plain title"');
  });

  it('writes a BOM, a header row and CRLF line endings', () => {
    const csv = toCsv(records);
    expect(csv.startsWith(String.fromCharCode(0xfeff) + '"WBS","Level"')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(records.length + 2); // header + rows + trailing empty
    expect(lines[0].split(',')).toHaveLength(EXPORT_COLUMNS.length);
    expect(csv).toContain('"Archit Jain; Bibhuti Rajput"');
  });

  it('names files by the local date', () => {
    expect(exportFileName('csv', TODAY)).toBe('airbuddy-roadmap-2026-10-07.csv');
  });
});
