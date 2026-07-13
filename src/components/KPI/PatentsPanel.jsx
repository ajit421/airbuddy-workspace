/**
 * PatentsPanel.jsx  (now renders as IPPanel)
 * KPI sub-panel for /kpi/ip
 * Shows all IP entries (Patents, Trademarks, Software/Calculators) with:
 *   - Filter tabs: All | Patents | Trademarks | Software/Tools
 *   - IP type badge + filing stage / status badge per entry
 *   - Summary stat cards broken down by ipType
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import { deleteKpiIP } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import PatentModal from './modals/PatentModal';

// ─── Filing stage → badge classes (Patents) ───────────────────────────────────
const stageClass = (stage) => {
  switch (stage) {
    case 'Granted':
    case 'Registered':
      return 'bg-green-500/15 text-green-400 border-green-500/25';
    case 'Filed':
    case 'Published':
    case 'RQ Filed':
    case 'Under Examination':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    case 'Drafting':
    case 'Internal Review':
      return 'bg-orange/15 text-orange border-orange/30';
    case 'Rejected':
    case 'Opposed':
      return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'Idea':
    default:
      return 'bg-border text-text-muted border-borderLight';
  }
};

// ─── Filing stage → progress fill color ───────────────────────────────────────
const stageColor = (stage) => {
  switch (stage) {
    case 'Granted':
    case 'Registered':              return '#22C55E';
    case 'Filed':
    case 'Published':
    case 'RQ Filed':
    case 'Under Examination':       return '#3B82F6';
    case 'Drafting':
    case 'Internal Review':         return '#F97316';
    case 'Rejected':
    case 'Opposed':                 return '#EF4444';
    default:                        return '#656D76';
  }
};

// ─── Software status → badge classes ─────────────────────────────────────────
const softwareStatusClass = (status) => {
  switch (status) {
    case 'Live':       return 'bg-green-500/15 text-green-400 border-green-500/25';
    case 'In Dev':     return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    case 'Deprecated': return 'bg-red-500/15 text-red-400 border-red-500/25';
    default:           return 'bg-border text-text-muted border-borderLight';
  }
};

// ─── IP type → badge classes ──────────────────────────────────────────────────
const ipTypeClass = (ipType) => {
  switch (ipType) {
    case 'Patent':               return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25';
    case 'Trademark':            return 'bg-purple-500/15 text-purple-400 border-purple-500/25';
    case 'Software/Calculator':  return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25';
    default:                     return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25';
  }
};

const FILTER_TABS = [
  { key: 'all',                  label: 'All' },
  { key: 'Patent',               label: 'Patents' },
  { key: 'Trademark',            label: 'Trademarks' },
  { key: 'Software/Calculator',  label: 'Software/Tools' },
];

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = ({ filter }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">📋</span>
    <p className="font-semibold text-text-primary">
      {filter === 'all' ? 'No IP entries yet' : `No ${filter === 'Software/Calculator' ? 'Software/Tools' : filter + 's'} yet`}
    </p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add IP entries — patents, trademarks, or software tools — to track their status.
    </p>
  </div>
);

export default function IPPanel() {
  const {
    patents,
    loading,
    getPatentProgress,
    totalPatentsFiled,
    totalPatentsInFiling,
    totalIPPatents,
    totalIPTrademarks,
    totalIPSoftware,
  } = useKpi();
  const { isAdmin } = useAuth();
  const { viewMode } = useViewMode();

  const [modalOpen,   setModalOpen]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [deleting,    setDeleting]    = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const handleEdit = (patent) => { setEditing(patent); setModalOpen(true); };
  const handleAdd  = ()       => { setEditing(null);   setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this IP entry? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiIP(id); }
    catch (err) { console.error('Delete IP failed:', err); }
    finally { setDeleting(null); }
  };

  const filteredEntries = activeFilter === 'all'
    ? patents
    : patents.filter((p) => {
        // Legacy documents without ipType are treated as Patent
        const type = p.ipType || 'Patent';
        return type === activeFilter;
      });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">IP</h1>
          <p className="text-sm text-text-muted mt-1">Track patents, trademarks, and software tools from filing to registration.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add IP Entry
          </button>
        )}
      </div>

      {/* Summary strip — 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-yellow-500/15 text-yellow-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{patents.length}</p>
            <p className="text-sm font-semibold text-text-primary">Total IP</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-yellow-500/15 text-yellow-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalIPPatents}</p>
            <p className="text-sm font-semibold text-text-primary">Patents</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple-500/15 text-purple-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalIPTrademarks}</p>
            <p className="text-sm font-semibold text-text-primary">Trademarks</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-cyan-500/15 text-cyan-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalIPSoftware}</p>
            <p className="text-sm font-semibold text-text-primary">Software/Tools</p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 p-1 bg-surface rounded-lg border border-border self-start w-fit flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              activeFilter === tab.key
                ? 'bg-orange text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : filteredEntries.length === 0 ? (
        <Empty filter={activeFilter} />
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">IP Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Stage / Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden lg:table-cell">Detail</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden sm:table-cell">Progress</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {filteredEntries.map((entry) => {
                const ipType = entry.ipType || 'Patent';
                const stageOrStatus = ipType === 'Software/Calculator'
                  ? (entry.status || 'In Dev')
                  : (entry.filingStage || (ipType === 'Trademark' ? 'Filed' : 'Idea'));
                const prog = ipType === 'Patent' ? getPatentProgress(entry.filingStage) : 0;
                return (
                  <tr key={entry.id} className="hover:bg-surfaceHover transition-colors">
                    <td className="px-4 py-3 font-semibold text-text-primary max-w-[200px]">
                      <span className="line-clamp-1">{entry.title || entry.toolName || 'Untitled'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ipTypeClass(ipType)}`}>
                        {ipType === 'Software/Calculator' ? 'Software' : ipType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        ipType === 'Software/Calculator' ? softwareStatusClass(stageOrStatus) : stageClass(stageOrStatus)
                      }`}>
                        {stageOrStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted hidden lg:table-cell">
                      {ipType === 'Patent' && entry.appNumber && <span className="font-mono text-text-secondary">{entry.appNumber}</span>}
                      {ipType === 'Trademark' && entry.trademarkClass && <span>Class: {entry.trademarkClass}</span>}
                      {ipType === 'Software/Calculator' && entry.repoOrToolLink && (
                        <a href={entry.repoOrToolLink} target="_blank" rel="noopener noreferrer"
                          className="text-orange hover:text-orange-hover truncate inline-block max-w-[160px]" onClick={e => e.stopPropagation()}>
                          {entry.repoOrToolLink}
                        </a>
                      )}
                      {!entry.appNumber && !entry.trademarkClass && !entry.repoOrToolLink && '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {ipType === 'Patent' ? (
                        <div className="flex items-center gap-2">
                          <div className="progress-bar w-20"><div className="progress-fill" style={{ width: `${prog}%`, backgroundColor: stageColor(entry.filingStage) }} /></div>
                          <span className="text-xs text-text-muted">{prog}%</span>
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }} disabled={deleting === entry.id}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {deleting === entry.id ? '…' : 'Del'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntries.map((entry) => {
            const ipType = entry.ipType || 'Patent';
            return (
              <div key={entry.id} className="card p-5 flex flex-col gap-3">
                {/* Title + IP type badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">
                    {entry.title || entry.toolName || 'Untitled'}
                  </h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 ${ipTypeClass(ipType)}`}>
                    {ipType === 'Software/Calculator' ? 'Software' : ipType}
                  </span>
                </div>

                {/* ── Patent body ── */}
                {ipType === 'Patent' && (
                  <>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start ${stageClass(entry.filingStage)}`}>
                      {entry.filingStage || 'Idea'}
                    </span>

                    {(entry.appNumber || entry.fieldOfInvention) && (
                      <div className="flex flex-col gap-1 text-[11px] leading-relaxed text-text-muted bg-background/35 px-2.5 py-1.5 rounded-md border border-borderLight/30 my-0.5">
                        {entry.appNumber && (
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-text-muted">App No:</span>
                            <span className="font-mono text-text-primary select-all">{entry.appNumber}</span>
                          </div>
                        )}
                        {entry.fieldOfInvention && (
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-text-muted">Field:</span>
                            <span className="font-semibold text-text-secondary">{entry.fieldOfInvention}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs text-text-muted font-medium">Filing Progress</span>
                      </div>
                      <ProgressMeter value={getPatentProgress(entry.filingStage)} color={stageColor(entry.filingStage)} />
                    </div>
                  </>
                )}

                {/* ── Trademark body ── */}
                {ipType === 'Trademark' && (
                  <>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start ${stageClass(entry.filingStage)}`}>
                      {entry.filingStage || 'Filed'}
                    </span>
                    {entry.trademarkClass && (
                      <div className="text-[11px] text-text-muted bg-background/35 px-2.5 py-1.5 rounded-md border border-borderLight/30">
                        <span className="font-medium">Class:</span>{' '}
                        <span className="text-text-secondary font-semibold">{entry.trademarkClass}</span>
                      </div>
                    )}
                  </>
                )}

                {/* ── Software / Calculator body ── */}
                {ipType === 'Software/Calculator' && (
                  <>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start ${softwareStatusClass(entry.status)}`}>
                      {entry.status || 'In Dev'}
                    </span>
                    {entry.repoOrToolLink && (
                      <a
                        href={entry.repoOrToolLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-orange hover:text-orange-hover truncate flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {entry.repoOrToolLink}
                      </a>
                    )}
                  </>
                )}

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button onClick={() => handleEdit(entry)}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {deleting === entry.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <PatentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
        item={editing}
      />
    </div>
  );
}
