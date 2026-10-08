import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { exportRoadmapCsv, exportRoadmapXlsx } from '../../services/roadmapExportService';

/**
 * GanttExportMenu.jsx
 * Export button for the roadmap Gantt: Excel, CSV, or an .xlsx meant for
 * Google Sheets. Exports exactly the rows the Gantt is showing (filters and
 * collapsed branches applied), and says how many.
 *
 * The Google Sheets item downloads the same .xlsx with a note on how to open
 * it. A direct "open in Sheets" would need a Drive or Sheets OAuth scope, and
 * any scope on sign-in brings back Google's unverified-app warning for the
 * whole team, so that is deliberately not offered.
 *
 * Props:
 *  - rows           visible Gantt rows
 *  - userNames      Map uid -> name
 *  - today          'YYYY-MM-DD'
 *  - filterSummary  human-readable active filters, for the About sheet
 */
const ITEMS = [
  { id: 'xlsx',   label: 'Excel (.xlsx)',          hint: 'Gantt chart like the app, plus a table' },
  { id: 'csv',    label: 'CSV',                    hint: 'Plain table, opens anywhere' },
  { id: 'sheets', label: 'Google Sheets (.xlsx)',  hint: 'Upload to Google Drive, then open with Google Sheets' },
];

export default function GanttExportMenu({ rows, userNames, today, filterSummary = '' }) {
  const { userProfile } = useAuth();
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(null);   // item id while building
  const [error, setError] = useState('');
  const [note, setNote]   = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (id) => {
    setBusy(id);
    setError('');
    setNote('');
    try {
      if (id === 'csv') {
        exportRoadmapCsv(rows, userNames, { today });
      } else {
        await exportRoadmapXlsx(rows, userNames, {
          today,
          exportedBy: userProfile?.name || userProfile?.email || '',
          filterSummary,
        });
      }
      if (id === 'sheets') {
        setNote('Downloaded. Upload the file to Google Drive and open it with Google Sheets.');
      } else {
        setOpen(false);
      }
    } catch (err) {
      setError(`Export failed: ${err?.message ?? 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const disabled = rows.length === 0;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        id="roadmap-gantt-export"
        onClick={() => { setOpen((v) => !v); setError(''); setNote(''); }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-secondary h-7 px-2.5 text-xs gap-1.5 disabled:opacity-50"
        title={disabled ? 'Nothing to export' : 'Export the rows shown'}
      >
        {busy ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-40 w-72 rounded-lg border border-border bg-surface shadow-xl p-1 animate-fade-in"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-text-muted">
            Exports the {rows.length} {rows.length === 1 ? 'row' : 'rows'} currently shown
          </p>
          {ITEMS.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              onClick={() => run(item.id)}
              disabled={Boolean(busy)}
              className="w-full text-left px-2.5 py-2 rounded-md hover:bg-surfaceHover focus:bg-surfaceHover focus:outline-none disabled:opacity-60"
            >
              <span className="flex items-center justify-between text-xs font-medium text-text-primary">
                {item.label}
                {busy === item.id && (
                  <span className="w-3 h-3 border-2 border-orange border-t-transparent rounded-full animate-spin" />
                )}
              </span>
              <span className="block text-[11px] text-text-muted mt-0.5">{item.hint}</span>
            </button>
          ))}
          {note && <p className="px-2.5 py-2 text-[11px] text-green-400">{note}</p>}
          {error && <p className="px-2.5 py-2 text-[11px] text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
