# Gantt chart for the Company Roadmap

A plan for adding a third roadmap view, **Gantt**, next to List and Journey, with
an **Export** menu that downloads the roadmap as Excel (.xlsx), CSV, or a file
you open in Google Sheets.

Work through the steps in order. Each step ends with a check you can run before
moving on. Tick the boxes as you go.

> **Status (2026-10-07):** Steps 1 to 9 and 11 to 13 are done and checked in the
> browser. Step 10 was skipped on purpose. Still open: open the exported files in
> Excel and Google Sheets yourself (Step 15), fix one bad milestone date (see the
> progress log at the end), then commit and push (Step 16). Nothing is committed
> or deployed yet.

---

## 1. What the roadmap looks like today

### Live data (checked 2026-10-07)

| Root milestone | Children | Progress | Root dates |
|---|---|---|---|
| AC Outdoor Fan Motor | 15 | 7% | none |
| Ceiling Fan Motor | 15 | 11% | none |
| Drone Motor (200-unit) | 15 | 0% | none |

- 48 nodes in total: 3 roots, 45 children, all at depth 1. Nothing is deeper yet,
  but the Gantt must still handle deeper trees because Add Child allows them.
- Children follow a weekly cadence: `startDate` on a Monday, `dueDate` on the
  Saturday (for example 2026-08-31 to 2026-09-05). The timeline runs from
  2026-08-24 to 2026-12-05.
- The roots have **no** `startDate` or `dueDate`. Their Gantt bar has to be
  derived from their children (earliest start to latest due).
- 16 of 45 children are overdue, 2 are completed, 1 is in progress.
- 29 of 45 children have no assignee.

### What the two existing views show

- **List** ([RoadmapTree.jsx](src/components/Roadmap/RoadmapTree.jsx),
  [RoadmapNodeCard.jsx](src/components/Roadmap/RoadmapNodeCard.jsx)): one card
  per node with priority, status, due date, "Overdue by N d" and a progress bar.
  It does not show the start date or who is assigned, and you only see one
  branch at a time.
- **Journey** ([RoadmapJourneyView.jsx](src/components/Roadmap/RoadmapJourneyView.jsx)):
  a level map of the 3 roots ("Level 0 of 3"), with drill-down into each root's
  15 sub-quests. It shows order and status, not time.

Neither view answers "what is happening in which week, and what overlaps". That
is the gap the Gantt fills.

### Code facts the plan depends on

- The view switch lives in
  [CompanyRoadmap.jsx:70-75](src/components/Roadmap/CompanyRoadmap.jsx#L70-L75)
  as `viewMode` (`'list' | 'journey'`), saved in `localStorage` under
  `roadmap-view-mode`.
- `handleSelect` in the same file is the single click funnel: a root opens the
  right-hand panel, a child opens the Task Details modal. The Gantt must call it
  too, so bar clicks behave exactly like card clicks.
- The search, status and priority filters only filter **root** nodes today
  (`filteredRoots`).
- Nodes already carry `startDate` and `dueDate`
  ([roadmapService.js:42-43](src/services/roadmapService.js#L42-L43)), and the
  milestone form already edits both. No schema change is needed.
- Dates are stored in two shapes. `createNode` stores a `Date` (UTC midnight),
  but `updateNode` stores the raw `'YYYY-MM-DD'` string from the form. The Gantt
  must accept both (see Step 3).
- `RoadmapContext` only loads roots. Children are loaded per branch when you
  expand. The Gantt needs every node at once, so it needs its own query.
- Assignee names come from `subscribeToAllUsers` in
  [teamMembersService.js](src/services/teamMembersService.js), the same way
  [RoadmapNodeDetail.jsx:250](src/components/Roadmap/RoadmapNodeDetail.jsx#L250)
  does it.
- There is no spreadsheet library in `package.json` yet.

---

## 2. Decisions (read before coding)

| Question | Decision | Why |
|---|---|---|
| Gantt library or build our own? | Build our own with divs and Tailwind | 48 rows is small. A library would bring its own CSS that fights the dark theme, and most React Gantt packages lag behind React 19. |
| Excel library | `exceljs`, loaded only when Export is clicked | It can colour cells, so the Excel file can contain a real Gantt sheet with filled week cells. The free SheetJS build cannot write cell colours. |
| Google Sheets | Download the .xlsx and open it in Google Drive | A direct "Open in Google Sheets" button needs a Google Drive or Sheets OAuth scope, and adding any scope to sign-in brings back the "Google hasn't verified this app" screen for the whole team. Google Sheets opens .xlsx files with the colours intact. |
| Who can export? | Everyone who can open the roadmap | The roadmap is already readable by every allowed user, so export reveals nothing new. If you want to restrict it later, add a `roadmap.export` key (see Step 12). |
| Bar for a node with no start date | Use the due date, draw a diamond (single-day marker) | Better than inventing a start date. |
| Bar for a node with no dates at all | Derive the span from its children; if it has none, show the row with no bar and "No dates" | This is the case for all 3 roots today. |
| Filters | Apply search, status and priority to every row, and keep a parent row visible if any child matches | Otherwise searching for "PCB" would hide everything, since no root title contains it. |
| Dependencies (arrows between bars) | Not in this version | There is no dependency field in the data model. Add it later if needed. |

---

## 3. Step 1: pure helpers and their tests

All the logic goes into one file of plain functions, so it can be tested without
a browser (this repo has no jsdom).

- [x] Create `src/utils/ganttHelpers.js` with these exports:

  - `toDayKey(value)`: returns `'YYYY-MM-DD'` or `null`. If `value` is already a
    `'YYYY-MM-DD'` string, return it unchanged. Otherwise run it through
    `toDate()` and `toLocalDateString()` from
    [dateHelpers.js](src/utils/dateHelpers.js). Never use
    `toISOString().slice(0, 10)`; it gives the previous day for IST users before
    05:30.
  - `dayDiff(fromKey, toKey)`: whole days between two day keys. Parse each key
    as `Date.UTC(y, m - 1, d)` so daylight saving and time zones cannot shift it.
  - `buildGanttRows(nodes)`: takes a flat array of nodes and returns rows in tree
    order (parent, then its children sorted with `sortNodesByDueDate`). Each row:
    `{ id, node, depth, wbs, title, start, end, derived, isMilestone, status,
    priority, progress, assignedTo, overdue }`.
    - `wbs` is the outline number: `1`, `1.1`, `1.2`, `2`, ...
    - `start` is `toDayKey(startDate)`, or `end` if there is no start date
      (`isMilestone: true`).
    - For a node with no dates, take the earliest child start and the latest
      child due, and set `derived: true`. Work bottom up so this also works for
      deeper trees.
    - `overdue` is `end < today && status !== 'completed'`.
  - `filterGanttRows(rows, { search, status, priority })`: keeps matching rows
    plus all of their ancestors.
  - `computeRange(rows, zoom)`: earliest start and latest end, padded to whole
    weeks (Monday start) for week zoom or whole months for month zoom, and always
    including today.
  - `toCsv(rows, userNames)`: see Step 7.

- [x] Create `src/utils/ganttHelpers.test.js`. Cover at least:
  - `toDayKey` with a `Date`, a Firestore-like `{ toDate() }`, a `'YYYY-MM-DD'`
    string, `null`, and a garbage string.
  - A root with no dates gets its span from its children, with `derived: true`.
  - A node with only a due date becomes a milestone diamond.
  - WBS numbers come out as `1`, `1.1`, `1.2`, `2`, `2.1`.
  - The filter keeps the parent of a matching child.
  - CSV escaping (see Step 7).
  - A date of 2026-09-05 stays 2026-09-05 when the test runs with
    `process.env.TZ = 'Asia/Kolkata'`.

**Check:** `npx vitest run src/utils/ganttHelpers.test.js` passes.

---

## 4. Step 2: load the whole tree in one listener

- [x] In [roadmapService.js](src/services/roadmapService.js), add:

  ```js
  /**
   * Subscribe to every non-archived roadmap node, for the Gantt view.
   * One equality filter, so the automatic single-field index serves it and
   * firestore.indexes.json needs no new entry.
   */
  export function subscribeToAllNodes(onData, onError) {
    const q = query(
      collection(db, ROADMAP_NODES_COL),
      where('isArchived', '==', false),
    );
    return onSnapshot(
      q,
      (snap) => onData(snapToArray(snap)),
      (err) => {
        console.error('[roadmapService] subscribeToAllNodes:', err);
        if (onError) onError(err);
      }
    );
  }
  ```

  Do not add `orderBy()`; sorting happens in `buildGanttRows`. Do not touch
  `fieldOverrides` in `firestore.indexes.json` (see the warning in CLAUDE.md).

- [x] Create `src/hooks/useRoadmapGantt.js`. It subscribes to
  `subscribeToAllNodes` and `subscribeToAllUsers`, and returns
  `{ rows, userNames, loading, error }`, with `rows` memoised from
  `buildGanttRows`. Return the unsubscribe functions from `useEffect`.

- [x] Mount the hook **inside the Gantt component only**, so the listener runs
  only while the Gantt view is open, not on every roadmap visit.

**Check:** a log of `rows.length` shows 48 on the current data. Then remove the
log.

---

## 5. Step 3: the Gantt view component

- [x] Create `src/components/Roadmap/RoadmapGanttView.jsx` with the same props as
  the other two views: `onSelect`, `onEdit`, `onDelete`, `canEdit`, plus
  `filters` (search, status, priority).

Layout (all colours from the Tailwind tokens, no raw hex):

```
+---------------------------+--------------------------------------------+
| WBS  Title       Owner  % |  Aug 31 | Sep 7 | Sep 14 | ... | Dec 5      |
+---------------------------+--------------------------------------------+
| 1   AC Outdoor Fan   -   7|  [=========== derived summary bar =======] |
| 1.1  Release P1 PCB  AJ 100|  [###]                                     |
| 1.2  PCB fab...      AG  0|        [   ]                               |
|                           |              |  <- today line              |
+---------------------------+--------------------------------------------+
  left panel: sticky          right panel: scrolls horizontally
```

- [x] **Left panel** (sticky, about 320px on desktop): WBS, title (indented by
  depth), assignee initials, progress %. Root rows are bold, with a chevron to
  collapse or expand their children (local state, all expanded by default).
- [x] **Right panel**: one column per day. Width per day depends on zoom:
  Week = 28px, Month = 8px, Quarter = 3px. A two-line header shows months on top
  and week starts (or days in Week zoom) underneath. Shade weekends lightly in
  Week zoom.
- [x] **Bars**: `left = dayDiff(rangeStart, start) * dayWidth`,
  `width = (dayDiff(start, end) + 1) * dayWidth`. Fill a darker inner strip to
  `progress%`. Colour by status, using the same tokens as the cards:
  completed = `status-success`, in-progress = `orange`, blocked =
  `status-danger`, pending = `border` grey. Overdue bars get a red outline.
  Derived root bars are thinner and striped, so nobody mistakes them for real
  dates.
- [x] **Milestone diamonds** for nodes with only a due date: a 12px square
  rotated 45 degrees.
- [x] **Today line**: a 1px orange vertical line across all rows, labelled
  "Today".
- [x] **Tooltip on hover**: title, start, due, status, progress, assignee names,
  and "Overdue by N days" when it applies. Use `formatDate()` and
  `getDueDateLabel()` from `dateHelpers`, the same helpers the cards use.
- [x] **Click** on a bar or a title calls `onSelect(row.node)`. That reuses
  `handleSelect`: a root opens the side panel, a child opens Task Details.
- [x] On open, scroll the right panel so today is about a third of the way in.
- [x] Wrap the row component in `React.memo`, the same as the node cards.
- [x] Empty state when no row has any date: "No dated milestones yet. Add a
  start or due date to a milestone to place it on the timeline."

**Mobile (under 640px):** hide the Owner and % columns, narrow the title column
to 140px, and keep the horizontal scroll **inside** the Gantt container so the
page itself never scrolls sideways.

**Check:** the page renders with the 3 roots and 45 bars. "PCB fabrication for
Prototype 2" (Ceiling Fan, 2026-08-31 to 2026-09-05) shows a 59% fill and a red
outline, because it is overdue.

---

## 6. Step 4: wire it into CompanyRoadmap

- [x] In [CompanyRoadmap.jsx](src/components/Roadmap/CompanyRoadmap.jsx), add a
  third button to the view switcher: **Gantt** (bar-chart icon), with
  `viewMode === 'gantt'`.
- [x] Load it lazily so List and Journey users do not download it:
  `const RoadmapGanttView = lazy(() => import('./RoadmapGanttView'));`, wrapped
  in a `Suspense` with a small spinner.
- [x] Render it in the `viewMode` branch next to `RoadmapJourneyView`. Pass the
  raw filter state (`searchQuery`, `filterStatus`, `filterPriority`), not
  `filteredRoots`, because the Gantt filters every level itself.
- [x] Hide the "Collapse all" button in Gantt mode (it belongs to the List tree),
  and show a Zoom select (Week / Month / Quarter) and the Export button instead.
  Remember the zoom in `localStorage` under `roadmap-gantt-zoom`, inside
  try/catch, like the view mode.
- [x] Make sure a stored `'gantt'` value from `localStorage` still works on the
  deep link route `/roadmap/:nodeId`: the side panel opens over the Gantt.
- [x] Update the "Phase 18" comment block at the top of the file to mention the
  third view.

**Check:** switching List, Journey, Gantt keeps the filters, and a reload stays
on Gantt.

---

## 7. Step 5: CSV export

CSV needs no library.

- [x] Implement `toCsv(rows, userNames)` in `ganttHelpers.js` with these
  columns:

  | Column | Example |
  |---|---|
  | WBS | 2.2 |
  | Level | 1 |
  | Parent | Ceiling Fan Motor |
  | Milestone | PCB fabrication for Prototype 2 in progress at vendor (order already placed). |
  | Status | in-progress |
  | Priority | medium |
  | Progress % | 59 |
  | Start | 2026-08-31 |
  | Due | 2026-09-05 |
  | Duration (days) | 6 |
  | Assigned to | Archit Jain; Bibhuti Rajput |
  | Overdue | Yes |
  | Days overdue | 32 |
  | Dates derived from children | No |
  | Link | https://airbuddy-workspace.vercel.app/roadmap/wKprIF4A9Y7JoxZksDQD |

- [x] Escape every cell:
  - Wrap it in double quotes and double any quote inside.
  - **Formula injection guard:** if a value starts with `=`, `+`, `-`, `@`, a
    tab or a carriage return, prefix it with a single quote `'`. Titles are typed
    by people, and a title like `=HYPERLINK(...)` would otherwise run as a
    formula when the file is opened in Excel.
- [x] Start the file with a UTF-8 byte order mark (`U+FEFF`) and use `\r\n`
  line endings. Without the BOM, Excel on Windows shows names with accents as
  garbage.
- [x] Download with a `Blob` and a temporary `<a download>` link. File name:
  `airbuddy-roadmap-YYYY-MM-DD.csv`, using `toLocalDateString()` for the date.
- [x] Export **the rows currently shown** (after filters and collapse), and say
  so in the menu: "Exports the 48 rows currently shown".
- [x] Put the download helper in `src/services/roadmapExportService.js`, so the
  component does not handle Blobs itself.

**Check:** the test for `toCsv` covers quotes, commas, newlines in a title, and a
title starting with `=`. Open the file in Excel and check that "Archit Jain;
Bibhuti Rajput" sits in one cell and the dates are correct.

---

## 8. Step 6: Excel (.xlsx) export with a Gantt sheet

- [x] Install it: `npm install exceljs`.
- [x] In `roadmapExportService.js`, load it only when needed:

  ```js
  const { default: ExcelJS } = await import('exceljs');
  ```

  If Vite complains about Node built-ins (`stream`, `fs`), import the browser
  build instead: `await import('exceljs/dist/exceljs.min.js')`.

- [x] Build a workbook with two sheets.

  **Sheet "Roadmap"** (the table):
  - The same columns as the CSV.
  - Start and Due written as real Excel dates (`new Date(Date.UTC(y, m - 1, d))`
    with `numFmt: 'dd-mmm-yyyy'`), so they sort and filter as dates.
  - Progress as a number with `numFmt: '0"%"'`.
  - Bold header, frozen first row, autofilter on the header, sensible column
    widths, and root rows in bold.
  - The Link column as a real hyperlink.

  **Sheet "Gantt"** (the picture):
  - Columns A to E: WBS, Milestone, Owner, Start, Due.
  - From column F, one column per week (Monday), headed `31-Aug`, `07-Sep`, ...,
    with a month row above it.
  - For each row, fill the week cells the bar covers. Use solid fills matching
    the app (completed green, in progress orange, blocked red, pending grey).
    Fill overdue bars red, and root (derived) rows a lighter shade.
  - Put a thin orange border on the column of the current week.
  - Freeze panes at F3, so the names stay visible while scrolling across.
  - Narrow week columns (width about 4).

  **Sheet "About"** (optional, small): export date and time, who exported it,
  which filters were active, and the legend of colours.

- [x] Write it with `await workbook.xlsx.writeBuffer()` and download as
  `airbuddy-roadmap-YYYY-MM-DD.xlsx`.
- [x] Show a spinner on the Export button while it builds, and a toast if it
  fails (follow the `console.error('[roadmapExportService] ...')` and re-throw
  convention).

**Check:** open the file in Excel. Both sheets open without a repair warning, the
dates filter as dates, and the Gantt sheet shows coloured bars that match the
app.

---

## 9. Step 7: Google Sheets

- [x] In the Export menu, add **Google Sheets (.xlsx)**. It downloads the same
  .xlsx file and shows a short note underneath: "Upload this file to Google
  Drive and open it with Google Sheets."
- [x] Do **not** add a Google Drive or Sheets API scope, and do not add any scope
  to `googleProvider`. See CLAUDE.md, "Auth and identity", and the comment in
  [firebase.js](src/services/firebase.js).
- [ ] (to do, you) Test the file in Google Sheets: the fills on the Gantt sheet, the frozen
  panes and the date format must survive the import.

---

## 10. Step 8: the Export menu

- [x] Add a button labelled **Export** with a download icon in the toolbar,
  visible in Gantt mode (and optionally in List mode, since the data is the
  same).
- [x] Its menu has three items:
  1. Excel (.xlsx), with table and Gantt sheets
  2. CSV
  3. Google Sheets (.xlsx), with the upload note
- [x] Close the menu on outside click and on Escape. It must work by keyboard
  (Tab, Enter).
- [x] Use `.btn-secondary` and the existing dropdown styles. No browser `alert()`
  for success; a toast is enough.

---

## 11. Step 9: bundle

- [x] Run `npm run build` and confirm `exceljs` ends up in its own lazy chunk,
  not in `vendor-react` or the main bundle.
- [x] While in [vite.config.js](vite.config.js), fix the existing chunk bug found
  in the codebase review: `id.includes('node_modules/react')` also matches
  `react-big-calendar`, `react-markdown` and `react-chartjs-2`. Change the React
  checks to `'node_modules/react/'`, `'node_modules/react-dom/'`,
  `'node_modules/react-router'` and `'node_modules/scheduler/'`.
- [x] Do not add a catch-all rule (it causes circular chunk warnings; see
  CLAUDE.md, "Bundle chunks").

**Check:** in `dist/assets`, there is a separate exceljs chunk, and
`vendor-react` is much smaller than its current 534 KB.

---

## 12. Step 10 (optional): restrict export to a permission

Only do this if you decide export should not be open to everyone.

- [ ] (skipped, export is open to everyone) Add `roadmap.export` to
  [permissionCatalog.js](src/utils/permissionCatalog.js) and to
  `PERMISSION_KEYS` in `mcp/src/workItems.js` (a parity test checks this).
- [ ] (skipped) Show the Export button only when `can('roadmap.export')`.
- [ ] (skipped) No `firestore.rules` change is needed, because export only reads data the
  user can already read. Note this in the catalog entry so nobody goes looking
  for the matching rule.

---

## 13. Step 11: data fix that makes the Gantt correct

- [x] `updateNode` in [roadmapService.js](src/services/roadmapService.js)
  writes `startDate`/`dueDate` as raw strings while `createNode` writes `Date`
  objects. The Gantt copes with both through `toDayKey`, but other queries do
  not. Convert them the same way `createNode` does (`new Date(value)` when set,
  `null` when cleared), and add a Zod check there.
- [x] Add a test for it next to the existing `createNode` tests.

---

## 14. Step 12: docs

Plain words, no emoji, no em dashes (the same rule as the rest of the docs).

- [x] [src/docs/company-roadmap.md](src/docs/company-roadmap.md): a "Gantt view"
  section (how to open it, zoom, what the striped bars mean, clicking a bar) and
  an "Export" section (the three formats, what is exported, how to open the file
  in Google Sheets).
- [x] [README.md](README.md): one line in the Roadmap feature list.
- [x] CLAUDE.md, Roadmap section: a short paragraph saying the Gantt has its own
  `subscribeToAllNodes` listener, mounted only in Gantt mode; that root bars are
  derived from children; and that export is client-side, with no Google scope.

---

## 15. Step 13: verify in the browser

Use the dev server that is already running on `http://localhost:5173` with your
admin session.

- [x] `npm test` and `npm run lint` (0 errors).
- [x] Gantt view as admin: 3 roots, 45 bars, today line on 2026-10-07 (or the
  current day), 16 overdue bars outlined in red.
- [ ] (partly done) Click a root bar: the side panel opens. Click a child bar: Task Details
  opens. Change progress there, save, and watch the bar fill update live.
- [x] Filters: search "PCB" keeps the 3 roots as parents and shows only the PCB
  rows; status "Completed" shows the 2 completed rows.
- [x] Zoom Week, Month, Quarter: bars stay aligned with the header dates.
- [x] Deep link `/roadmap/<id>` with Gantt selected: the panel opens over the
  Gantt.
- [x] **Preview as Employee** toggle on: the Gantt loads and export works (read
  access only); no edit buttons appear.
- [x] Mobile: a 390px wide same-origin iframe. The Gantt scrolls sideways inside
  its box and the page does not.
- [ ] (partly done, open the files yourself) Export all three formats. Open the .xlsx in Excel and in Google Sheets, and
  the .csv in Excel. Check that dates, names and colours are right.
- [x] Check the console for `[roadmapService]` or `[roadmapExportService]`
  errors.

---

## 16. Step 14: hand off

- [ ] (you) Leave the changes uncommitted, then stage, commit and push yourself when
  you are happy. Pushing `main` deploys to the whole team through Vercel.

### Files this plan touches

| New | Changed |
|---|---|
| `src/utils/ganttHelpers.js` | `src/components/Roadmap/CompanyRoadmap.jsx` |
| `src/utils/ganttHelpers.test.js` | `src/services/roadmapService.js` |
| `src/hooks/useRoadmapGantt.js` | `vite.config.js` |
| `src/components/Roadmap/RoadmapGanttView.jsx` | `package.json` (exceljs) |
| `src/services/roadmapExportService.js` | `src/docs/company-roadmap.md`, `README.md`, `CLAUDE.md` |

No changes to `firestore.rules`, `firestore.indexes.json`, Cloud Functions or the
MCP connector (unless you do the optional Step 10).

---

## 17. Progress log

### What was built

| File | What it is |
|---|---|
| `src/utils/ganttHelpers.js` | All Gantt and export logic as pure functions (day keys, rows, filters, range, header, CSV). |
| `src/utils/ganttHelpers.test.js` | 36 tests for the above. |
| `src/hooks/useRoadmapGantt.js` | Loads every node plus user names, only while the Gantt is open. |
| `src/components/Roadmap/RoadmapGanttView.jsx` | The Gantt view (lazy-loaded chunk, 25 KB). |
| `src/components/Roadmap/GanttExportMenu.jsx` | The Export button and its three options. |
| `src/services/roadmapExportService.js` | CSV and Excel writers; `exceljs` is loaded on click (its own 937 KB chunk). The Excel file opens on a Gantt sheet that looks like the app's chart, on white. |
| `src/services/roadmapService.js` | New `subscribeToAllNodes`; `updateNode` and `createNode` now store real dates and refuse impossible years. |
| `src/components/Roadmap/CompanyRoadmap.jsx` | Third **Gantt** button, lazy load, Collapse all hidden in Gantt mode. |
| `src/components/Roadmap/RoadmapNodeModal.jsx` | Date inputs limited to 2000 to 2100, with an error message. |
| `vite.config.js` | React chunk rule fixed: `vendor-react` went from 534 KB to 231 KB, and `vendor-calendar` is now emitted. |
| `package.json` | One new dependency: `exceljs` ^4.4.0. |
| Docs | `src/docs/company-roadmap.md`, `README.md`, `CLAUDE.md`. |

Tests: 486 passed, 28 skipped (emulator suites). Lint: 0 errors, 51 warnings (the
same deliberate warnings as before).

### Changes from the plan

- **Bar colours** match the List view cards (yellow pending, blue in progress,
  green completed, red blocked) instead of grey and orange, so the two views read
  the same. The Excel Gantt sheet uses the same colours.
- **Zoom and Export** sit in a small bar inside the Gantt panel, not in the page
  toolbar, so the all-nodes listener stays inside the Gantt component.
- **No toast library exists** in the app, so export errors show inside the Export
  menu, and the Google Sheets option shows its upload note there too.
- **Impossible dates are ignored.** Any date outside the years 2000 to 2100 is
  treated as missing in the Gantt, and refused when a milestone is saved. This was
  added because of the data problem below.

### Follow-up: Excel Gantt sheet now copies the app's chart

You asked for the export to look like the Gantt chart itself, without the dark
theme. The Excel file now opens on a **Gantt** sheet that copies the Week view on
a white background:

- the same left columns: WBS, Milestone (with the status dot, indented children,
  orange bold roots), Owner initials (full names in a note) and %
- one column per day (about 28 px, like the app) under month and date headers,
  shaded weekends and a line every Monday
- the same legend in the top row: Pending, In progress, Completed, Blocked,
  Overdue, From children, Today
- the same bars: status colour track with an outline, the progress part filled
  in with its % label, a red outline when overdue, diamonds for single-date
  milestones, dashed orange bars for root milestones
- the orange today line down the chart
- hovering the first cell of a bar shows a note with the same details as the
  app's hover card
- frozen header rows and left columns, gridlines off, landscape print set to one
  page wide

The one difference a spreadsheet cannot avoid: a bar fills the full height of its
row, where the app draws it a little thinner. The table moved to the second sheet
(Roadmap) and the About sheet is third. The table header is light too.

New helpers in `ganttHelpers.js` (`barCells`, `initials`, `blendArgb`) are shared
by the app and the export and have 3 more tests.

### What was checked in the browser

- Gantt as admin: 3 roots, 45 child bars, dashed root bars spanning their
  children, today line on 7 Oct, overdue bars outlined in red.
- Week, Month and Quarter zoom; search "PCB" (20 rows, parents kept); hover card
  with dates, assignees and "Overdue by 4 days".
- Clicking a child bar opens Task Details; clicking a root opens the side panel;
  a deep link `/roadmap/<id>` opens the panel over the Gantt.
- Preview as Employee: the Gantt and Export still work.
- 390 px phone width: no sideways page scroll, the chart scrolls inside its box.
- Excel export, read back in the browser and drawn cell by cell: three sheets
  (Gantt first, Roadmap, About), the Gantt sheet matches the app's chart (bars,
  progress, overdue outlines, today line on 7 Oct, legend), real dates in
  `dd-mmm-yyyy` on the Roadmap sheet, "Exported by Ajit Kumar".
- CSV export: UTF-8 byte order mark present, 48 rows plus header, names joined
  with "; ".
- No console errors.

Not checked: opening the files in the real Excel and Google Sheets apps, and
changing a milestone's progress from Task Details and watching the bar update.

### Open item: one milestone has a broken start date

"Documentation, DVP report, go/no-go review for production tooling" (Ceiling Fan
Motor, row 2.14) has its start date saved as **23 Nov 0006** instead of
**23 Nov 2026**; the year was probably typed as "6". Its due date (28 Nov 2026) is
fine. The Gantt now ignores the bad date and draws a diamond on 28 Nov. Open the
milestone, click Edit, set the start date to 23 Nov 2026 and save; the form now
refuses a year like 0006, so this cannot happen again.

### Problem during the work (fixed)

The first `npm install exceljs` also rewrote three unrelated versions in
`package.json` (`firebase` 12 to 9, `firebase-admin` 10 to 14, `tailwindcss` 3
to 4). Both package files were restored from git, `node_modules` was rebuilt with
`npm ci`, and `exceljs` was added again after a dry run. The final
`package.json` change is the single `exceljs` line. `exceljs` depends on an older
`uuid` with a moderate advisory that only applies when a caller passes its own
buffer, which the export never does.
