import {
  EXPORT_COLUMNS, toExportRecords, toCsv, exportFileName,
  computeRange, buildTimelineHeader, dayDiff, barCells, initials, blendArgb,
  monthLabel,
} from '../utils/ganttHelpers';

/**
 * roadmapExportService.js
 * Downloads the roadmap Gantt rows as CSV or Excel. Entirely client-side: the
 * rows are already in the browser, so nothing is sent anywhere, and there is
 * deliberately no Google Drive / Sheets API call. That would need an OAuth
 * scope on sign-in, which brings back the "Google hasn't verified this app"
 * screen for the whole team (see CLAUDE.md, Auth and identity). The Google
 * Sheets option is the .xlsx file, which Sheets opens with fills intact.
 *
 * exceljs is about 1 MB, so it is imported on click and never ships in the
 * roadmap chunk.
 *
 * Errors: console.error('[roadmapExportService] fn:', err) then re-throw, so
 * the menu can show it.
 */

// ── Light palette ───────────────────────────────────────────────────────────
// The export is deliberately light (white paper, dark text) even though the
// app is dark: it gets printed, pasted into slides and opened next to other
// spreadsheets. Everything else copies the Gantt view.
const UI = {
  paper:     'FFFFFF',
  header:    'F6F8FA',
  weekend:   'F6F8FA',
  border:    'D0D7DE',
  line:      'EAEEF2',
  text:      '1F2328',
  secondary: '57606A',
  muted:     '8C959F',
  orange:    'F97316',
  danger:    'EF4444',
  link:      '2563EB',
};

// RoadmapGanttView's BAR_THEME colours (Tailwind 500 for track and outline,
// 400 for the progress fill and the status dot), flattened onto white because
// Excel has no transparency.
const STATUS_RGB = {
  pending:       ['EAB308', 'FACC15'],
  'in-progress': ['3B82F6', '60A5FA'],
  completed:     ['22C55E', '4ADE80'],
  blocked:       ['EF4444', 'F87171'],
};
const barColours = (status) => {
  const [c500, c400] = STATUS_RGB[status] ?? STATUS_RGB.pending;
  return {
    track:   blendArgb(c500, UI.paper, 0.15),
    outline: blendArgb(c500, UI.paper, 0.75),
    fill:    blendArgb(c400, UI.paper, 0.85),
    dot:     `FF${c400}`,
  };
};
const DERIVED_TRACK   = blendArgb(UI.orange, UI.paper, 0.10);
const DERIVED_FILLED  = blendArgb(UI.orange, UI.paper, 0.55);
const DERIVED_OUTLINE = blendArgb(UI.orange, UI.paper, 0.8);

const argb  = (hex) => `FF${hex}`;
const solid = (argbValue) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argbValue } });
const edge  = (argbValue, style = 'thin') => ({ style, color: { argb: argbValue } });
const font  = (hex, extra = {}) => ({ name: 'Calibri', size: 9, color: { argb: argb(hex) }, ...extra });
const allSides = (e) => ({ top: e, bottom: e, left: e, right: e });

const STATUS_LABEL = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed', blocked: 'Blocked' };

const COLUMN_WIDTH = {
  wbs: 7, level: 6, parent: 26, title: 60, status: 12, priority: 10, progress: 11,
  start: 13, end: 13, duration: 10, assignees: 34, overdue: 9, daysOverdue: 12,
  derived: 14, link: 12,
};

/** Excel date for a day key: UTC midnight, which exceljs writes as that day. */
const keyToExcelDate = (key) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** '31 Aug 2026' from a day key, with no time zone involved. */
const longDay = (key) => `${Number(key.slice(8, 10))} ${monthLabel(key)}`;

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * @param {Array<object>} rows       visible Gantt rows (filters and collapse applied)
 * @param {Map<string,string>} userNames
 * @param {{ today: string }} opts
 */
export function exportRoadmapCsv(rows, userNames, { today }) {
  try {
    const records = toExportRecords(rows, userNames, { baseUrl: window.location.origin });
    const blob = new Blob([toCsv(records)], { type: 'text/csv;charset=utf-8' });
    triggerDownload(blob, exportFileName('csv', today));
  } catch (err) {
    console.error('[roadmapExportService] exportRoadmapCsv:', err);
    throw err;
  }
}

/**
 * Workbook with three sheets: Gantt (a copy of the Gantt view, opened first),
 * Roadmap (the table) and About (when, who, filters).
 *
 * @param {Array<object>} rows
 * @param {Map<string,string>} userNames
 * @param {{ today: string, exportedBy?: string, filterSummary?: string }} opts
 */
export async function exportRoadmapXlsx(rows, userNames, { today, exportedBy = '', filterSummary = '' }) {
  try {
    const { default: ExcelJS } = await import('exceljs');
    const records = toExportRecords(rows, userNames, { baseUrl: window.location.origin });

    const wb = new ExcelJS.Workbook();
    wb.creator = exportedBy || 'AirBuddy WorkSpace';
    wb.created = new Date();

    addGanttSheet(wb, rows, userNames, today);
    addTableSheet(wb, rows, records);
    addAboutSheet(wb, rows, { exportedBy, filterSummary });
    wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerDownload(blob, exportFileName('xlsx', today));
  } catch (err) {
    console.error('[roadmapExportService] exportRoadmapXlsx:', err);
    throw err;
  }
}

// ── Sheet: Gantt ────────────────────────────────────────────────────────────
//
// A copy of RoadmapGanttView in Week zoom, on white: the same four left
// columns (WBS, MILESTONE, OWNER, %), one 28 px column per day under month and
// date headers, shaded weekends, a line every Monday, the orange today line,
// the same legend, and the same bars: status track with an outline, the
// progress part filled in with its % label, a red outline when overdue,
// diamonds for single-date milestones and dashed summary bars for roots.
// Hovering the first cell of a bar shows a note with the view's hover card.
//
// The one thing a spreadsheet cannot copy is a bar thinner than its row: a
// bar fills the full height of its cells.

const LEFT_COLUMNS = [
  { header: 'WBS',       width: 6 },
  { header: 'MILESTONE', width: 46 },
  { header: 'OWNER',     width: 12 },
  { header: '%',         width: 6 },
];
const DAY_WIDTH_CHARS = 3.3;   // about 28 px, the view's Week-zoom day width
const ROW_HEIGHT_PT   = 21;    // about 28 px

function addGanttSheet(wb, rows, userNames, today) {
  const ws = wb.addWorksheet('Gantt', {
    views: [{ state: 'frozen', xSplit: LEFT_COLUMNS.length, ySplit: 3, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    properties: { tabColor: { argb: argb(UI.orange) } },
  });

  const range    = computeRange(rows, 'week', today);
  const { months, ticks } = buildTimelineHeader(range, 'week');
  const day0     = LEFT_COLUMNS.length + 1;              // first day column
  const lastCol  = day0 + range.days - 1;
  const todayIdx = dayDiff(range.start, today);
  const firstBodyRow = 4;
  const lastRow  = firstBodyRow + rows.length - 1;
  const nameOf   = (uid) => userNames.get(uid) || uid;

  LEFT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  for (let d = 0; d < range.days; d++) ws.getColumn(day0 + d).width = DAY_WIDTH_CHARS;

  // Base style for the whole chart area: white, dark text, centred vertically.
  for (let r = 1; r <= Math.max(lastRow, 3); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      cell.fill = solid(argb(r <= 3 ? UI.header : UI.paper));
      cell.font = font(UI.text);
      cell.alignment = { vertical: 'middle' };
    }
  }

  // ── Row 1: title and legend, like the view's toolbar ────────────────────
  const top = ws.getRow(1);
  top.height = 24;
  ws.mergeCells(1, 1, 1, LEFT_COLUMNS.length);
  top.getCell(1).value = {
    richText: [
      { text: 'Company Roadmap', font: font(UI.orange, { bold: true, size: 12 }) },
      { text: `   exported ${longDay(today)}`, font: font(UI.muted) },
    ],
  };
  const legend = [
    { label: 'Pending',       style: { fill: solid(barColours('pending').dot) } },
    { label: 'In progress',   style: { fill: solid(barColours('in-progress').dot) } },
    { label: 'Completed',     style: { fill: solid(barColours('completed').dot) } },
    { label: 'Blocked',       style: { fill: solid(barColours('blocked').dot) } },
    { label: 'Overdue',       style: { fill: solid(argb(UI.paper)), border: allSides(edge(argb(UI.danger), 'medium')) } },
    { label: 'From children', style: { fill: solid(DERIVED_TRACK), border: allSides(edge(DERIVED_OUTLINE, 'dashed')) } },
    { label: 'Today',         style: { fill: solid(argb(UI.orange)) } },
  ];
  legend.forEach((item, k) => {
    const col = day0 + 1 + k * 7;
    if (col + 1 > lastCol) return;
    Object.assign(top.getCell(col), item.style);
    const label = top.getCell(col + 1);
    label.value = item.label;
    label.font = font(UI.secondary);
  });

  // ── Row 2: month bands ─────────────────────────────────────────────────
  const monthRow = ws.getRow(2);
  monthRow.height = 16;
  ws.mergeCells(2, 1, 2, LEFT_COLUMNS.length);
  months.forEach((m) => {
    const from = day0 + m.offset;
    const to   = from + m.days - 1;
    if (to > from) ws.mergeCells(2, from, 2, to);
    const cell = monthRow.getCell(from);
    cell.value = m.label;
    cell.font = font(UI.secondary, { bold: true });
    cell.border = { left: edge(argb(UI.border)) };
  });

  // ── Row 3: column headers and day numbers ──────────────────────────────
  const headRow = ws.getRow(3);
  headRow.height = 16;
  LEFT_COLUMNS.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = font(UI.muted, { bold: true, size: 8 });
    cell.alignment = { vertical: 'middle', horizontal: c.header === '%' ? 'right' : 'left' };
  });
  ticks.forEach((t) => {
    const cell = headRow.getCell(day0 + t.offset);
    const isToday = t.key === today;
    cell.value = Number(t.label);
    cell.font = font(isToday ? UI.orange : UI.muted, { size: 7, bold: isToday });
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { left: edge(argb(UI.line)) };
  });
  for (let c = 1; c <= lastCol; c++) {
    const cell = headRow.getCell(c);
    cell.border = { ...cell.border, bottom: edge(argb(UI.border)) };
  }
  headRow.getCell(LEFT_COLUMNS.length).border = {
    ...headRow.getCell(LEFT_COLUMNS.length).border, right: edge(argb(UI.border)),
  };

  // ── Body: one row per milestone ────────────────────────────────────────
  rows.forEach((r, n) => {
    const row = ws.getRow(firstBodyRow + n);
    row.height = ROW_HEIGHT_PT;
    const colours = barColours(r.status);
    const isRoot = r.depth === 0;
    const names = r.assignedTo.map(nameOf);

    // Left panel
    const wbs = row.getCell(1);
    wbs.value = r.wbs;
    wbs.font = font(UI.muted, { name: 'Consolas', size: 8 });

    const title = row.getCell(2);
    title.value = {
      richText: [
        r.hasChildren
          ? { text: '▾  ', font: font(UI.muted) }
          : { text: '●  ', font: { ...font(UI.text, { size: 7 }), color: { argb: colours.dot } } },
        { text: r.title, font: font(isRoot ? UI.orange : UI.text, { bold: isRoot }) },
      ],
    };
    title.alignment = { vertical: 'middle', indent: Math.min(r.depth, 4) * 2 };

    const owner = row.getCell(3);
    if (names.length) {
      owner.value = names.slice(0, 2).map(initials).join(' ') + (names.length > 2 ? ` +${names.length - 2}` : '');
      owner.note = names.join(', ');
    } else {
      // Excel lets text spill into an empty neighbour; a space stops a long
      // title running over the Owner column, so it is cut off as in the view.
      owner.value = ' ';
    }
    owner.font = font(UI.orange, { bold: true, size: 8 });
    owner.alignment = { vertical: 'middle', horizontal: 'center' };

    const pct = row.getCell(4);
    pct.value = r.progress;
    pct.numFmt = '0"%"';
    pct.font = font(UI.secondary);
    pct.alignment = { vertical: 'middle', horizontal: 'right' };

    // Row separator under the left panel, and its right edge
    for (let c = 1; c < day0; c++) {
      row.getCell(c).border = {
        bottom: edge(argb(UI.line)),
        right: c === LEFT_COLUMNS.length ? edge(argb(UI.border)) : undefined,
      };
    }

    // Timeline background: weekend shading, Monday lines, row separator
    ticks.forEach((t) => {
      const cell = row.getCell(day0 + t.offset);
      if (t.weekend) cell.fill = solid(argb(UI.weekend));
      cell.border = {
        left:   t.offset % 7 === 0 ? edge(argb(UI.line)) : undefined,
        bottom: edge(argb(UI.line)),
      };
    });

    // The bar
    const bar = barCells(r, range.start);
    if (!bar) {
      const cell = row.getCell(day0);
      cell.value = 'No dates';
      cell.font = font(UI.muted, { italic: true, size: 8 });
    } else if (r.isMilestone) {
      const cell = row.getCell(day0 + bar.from);
      cell.value = '◆';
      cell.font = { ...font(UI.text, { size: 11 }), color: { argb: r.overdue ? argb(UI.danger) : colours.dot } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.note = hoverNote(r, names);
    } else {
      const outline = r.derived ? edge(DERIVED_OUTLINE, 'dashed')
        : r.overdue ? edge(argb(UI.danger), 'medium')
        : edge(colours.outline);
      for (let d = bar.from; d <= bar.to; d++) {
        const cell = row.getCell(day0 + d);
        const done = d - bar.from < bar.filled;
        cell.fill = solid(r.derived
          ? (done ? DERIVED_FILLED : DERIVED_TRACK)
          : (done ? colours.fill : colours.track));
        cell.border = {
          top: outline,
          bottom: outline,
          left: d === bar.from ? outline : undefined,
          right: d === bar.to ? outline : undefined,
        };
      }
      const first = row.getCell(day0 + bar.from);
      if (!r.derived && bar.to > bar.from) {
        // Left-aligned text with empty cells beside it runs across the bar,
        // like the view's % label.
        first.value = `${r.progress}%`;
        first.font = font(UI.text, { bold: true, size: 8 });
        first.alignment = { vertical: 'middle', horizontal: 'left' };
      }
      first.note = hoverNote(r, names);
    }
  });

  // Today line: an orange left edge down the whole timeline, over bars too.
  if (todayIdx >= 0 && todayIdx < range.days) {
    for (let r = 3; r <= lastRow; r++) {
      const cell = ws.getRow(r).getCell(day0 + todayIdx);
      cell.border = { ...cell.border, left: edge(argb(UI.orange), 'medium') };
    }
  }
}

/** The view's hover card, as an Excel note. */
function hoverNote(r, names) {
  return [
    r.title,
    `Start: ${longDay(r.start)}`,
    `Due: ${longDay(r.end)}`,
    `Status: ${STATUS_LABEL[r.status] ?? r.status}`,
    `Progress: ${r.progress}%`,
    `Assigned: ${names.length ? names.join(', ') : 'Nobody'}`,
    r.overdue ? `Overdue by ${r.daysOverdue} ${r.daysOverdue === 1 ? 'day' : 'days'}` : null,
    r.derived ? 'Dates taken from the milestones under it.' : null,
  ].filter(Boolean).join('\n');
}

// ── Sheet: Roadmap ──────────────────────────────────────────────────────────

function addTableSheet(wb, rows, records) {
  const ws = wb.addWorksheet('Roadmap', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = EXPORT_COLUMNS.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  COLUMN_WIDTH[c.key] ?? 12,
  }));

  records.forEach((rec, i) => {
    const row = ws.addRow({
      ...rec,
      start:       keyToExcelDate(rec.start),
      end:         keyToExcelDate(rec.end),
      duration:    rec.duration === '' ? null : rec.duration,
      daysOverdue: rec.daysOverdue === '' ? null : rec.daysOverdue,
      link:        rec.link ? { text: 'Open', hyperlink: rec.link } : '',
    });
    if (rows[i].depth === 0) row.font = { bold: true };
    row.getCell('title').alignment = { indent: rows[i].depth * 2, vertical: 'middle' };
    row.getCell('status').fill = solid(barColours(rec.status).track);
    if (rows[i].overdue) row.getCell('overdue').font = { bold: true, color: { argb: argb(UI.danger) } };
    if (rec.link) row.getCell('link').font = { color: { argb: argb(UI.link) }, underline: true };
  });

  ws.getColumn('start').numFmt    = 'dd-mmm-yyyy';
  ws.getColumn('end').numFmt      = 'dd-mmm-yyyy';
  ws.getColumn('progress').numFmt = '0"%"';

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: argb(UI.text) } };
  header.fill = solid(argb(UI.header));
  header.border = { bottom: edge(argb(UI.border)) };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
}

// ── Sheet: About ────────────────────────────────────────────────────────────

function addAboutSheet(wb, rows, { exportedBy, filterSummary }) {
  const ws = wb.addWorksheet('About');
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 76;

  [
    ['AirBuddy WorkSpace', 'Company Roadmap export'],
    ['Exported on', new Date().toLocaleString()],
    ['Exported by', exportedBy || ''],
    ['Rows', rows.length],
    ['Filters', filterSummary || 'None'],
    [],
    ['Gantt sheet', 'The same chart as the Gantt view in the app: columns, colours, legend and today line match.'],
    ['', 'Hover the first cell of a bar to see its dates, status, progress and the people assigned.'],
    ['Roadmap sheet', 'The same rows as a table, with real dates you can sort and filter.'],
  ].forEach((f) => ws.addRow(f));
  ws.getRow(1).font = { bold: true, size: 13 };
}
