/**
 * PatentsPanel.jsx
 * KPI sub-panel for /kpi/patents
 * Shows all patents with filing stage badge (color-coded) and derived progress meter.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { deleteKpiPatent } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import PatentModal from './modals/PatentModal';

// ─── Filing stage → badge classes ─────────────────────────────────────────────
const stageClass = (stage) => {
  switch (stage) {
    case 'Granted':
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
      return 'bg-red-500/15 text-red-400 border-red-500/25';
    case 'Idea':
    default:
      return 'bg-border text-text-muted border-borderLight';
  }
};

// ─── Filing stage → progress fill color ───────────────────────────────────────
const stageColor = (stage) => {
  switch (stage) {
    case 'Granted':                 return '#22C55E';
    case 'Filed':
    case 'Published':
    case 'RQ Filed':
    case 'Under Examination':       return '#3B82F6';
    case 'Drafting':
    case 'Internal Review':         return '#F97316';
    case 'Rejected':                return '#EF4444';
    default:                        return '#656D76';
  }
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">📄</span>
    <p className="font-semibold text-text-primary">No patents yet</p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add patent filings to track their progress from idea to grant.
    </p>
  </div>
);

export default function PatentsPanel() {
  const { patents, loading, getPatentProgress, totalPatentsFiled, totalPatentsInFiling } = useKpi();
  const { isAdmin } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);

  const handleEdit = (patent) => { setEditing(patent); setModalOpen(true); };
  const handleAdd  = ()       => { setEditing(null);   setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this patent? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiPatent(id); }
    catch (err) { console.error('Delete patent failed:', err); }
    finally { setDeleting(null); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Patents</h1>
          <p className="text-sm text-text-muted mt-1">Monitor patent filings from idea to grant.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Patent
          </button>
        )}
      </div>

      {/* Summary strip */}
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
            <p className="text-sm font-semibold text-text-primary">Total Patents</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/15 text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalPatentsFiled}</p>
            <p className="text-sm font-semibold text-text-primary">Filed / Granted</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-orange/15 text-orange">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalPatentsInFiling}</p>
            <p className="text-sm font-semibold text-text-primary">In Filing</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : patents.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {patents.map((patent) => {
            const progress = getPatentProgress(patent.filingStage);
            const color    = stageColor(patent.filingStage);
            return (
              <div key={patent.id} className="card p-5 flex flex-col gap-3">
                {/* Title + stage badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">{patent.title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 ${stageClass(patent.filingStage)}`}>
                    {patent.filingStage || 'Idea'}
                  </span>
                </div>

                {/* Application number & Field of Invention */}
                {(patent.appNumber || patent.fieldOfInvention) && (
                  <div className="flex flex-col gap-1 text-[11px] leading-relaxed text-text-muted bg-background/35 px-2.5 py-1.5 rounded-md border border-borderLight/30 my-0.5">
                    {patent.appNumber && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-text-muted">App No:</span>
                        <span className="font-mono text-text-primary select-all">{patent.appNumber}</span>
                      </div>
                    )}
                    {patent.fieldOfInvention && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-text-muted">Field:</span>
                        <span className="font-semibold text-text-secondary">{patent.fieldOfInvention}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Derived progress meter */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-text-muted font-medium">Filing Progress</span>
                  </div>
                  <ProgressMeter value={progress} color={color} />
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button onClick={() => handleEdit(patent)}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(patent.id)} disabled={deleting === patent.id}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {deleting === patent.id ? 'Deleting…' : 'Delete'}
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
