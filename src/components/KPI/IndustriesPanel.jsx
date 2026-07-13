/**
 * IndustriesPanel.jsx
 * KPI sub-panel for /kpi/industries
 * Shows all industries with growth meter, status badge, linked clients count,
 * and product variants linked to each industry.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import { deleteKpiIndustry } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import IndustryModal from './modals/IndustryModal';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusClass = (status) => {
  switch (status) {
    case 'Active':   return 'bg-green-500/15 text-green-400 border-green-500/25';
    case 'Paused':   return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    case 'Inactive': return 'bg-border text-text-muted border-borderLight';
    default:         return 'bg-border text-text-muted border-borderLight';
  }
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">🏭</span>
    <p className="font-semibold text-text-primary">No industries yet</p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add industry verticals to start tracking growth and linked clients.
    </p>
  </div>
);

// ─── Component ───────────────────────────────────────────────────────────────
export default function IndustriesPanel() {
  const {
    industries,
    clients,
    loading,
    getClientsForIndustry,
    getProductsForIndustry,
  } = useKpi();
  const { isAdmin } = useAuth();
  const { viewMode } = useViewMode();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null); // null = create mode
  const [deleting,  setDeleting]  = useState(null); // id being deleted

  const handleEdit = (industry) => {
    setEditing(industry);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this industry? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deleteKpiIndustry(id);
    } catch (err) {
      console.error('Delete industry failed:', err);
    } finally {
      setDeleting(null);
    }
  };

  const totalClients = clients.length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Industries</h1>
          <p className="text-sm text-text-muted mt-1">Track industry verticals, growth metrics, and linked products.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Industry
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/15 text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{industries.length}</p>
            <p className="text-sm font-semibold text-text-primary">Total Industries</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-orange/15 text-orange">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalClients}</p>
            <p className="text-sm font-semibold text-text-primary">Total Clients</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : industries.length === 0 ? (
        <Empty />
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden sm:table-cell">Growth</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">Clients</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden lg:table-cell">Products</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {industries.map((industry) => {
                const linkedClients  = getClientsForIndustry(industry.id);
                const linkedProducts = getProductsForIndustry(industry.id);
                const growth         = industry.growthPercent || 0;
                return (
                  <tr key={industry.id} className="hover:bg-surfaceHover transition-colors">
                    <td className="px-4 py-3 font-semibold text-text-primary">{industry.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass(industry.status)}`}>
                        {industry.status || 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-20"><div className="progress-fill bg-orange" style={{ width: `${growth}%` }} /></div>
                        <span className="text-xs text-text-muted">{growth}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden md:table-cell">{linkedClients.length}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden lg:table-cell">{linkedProducts.length}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(industry); }}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(industry.id); }} disabled={deleting === industry.id}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {deleting === industry.id ? '…' : 'Del'}
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
          {industries.map((industry) => {
            const linkedClients  = getClientsForIndustry(industry.id);
            const linkedProducts = getProductsForIndustry(industry.id);
            // Show up to 3 product badges, then "+N more"
            const visibleProducts = linkedProducts.slice(0, 3);
            const extraCount      = linkedProducts.length - visibleProducts.length;
            return (
              <div key={industry.id} className="card p-5 flex flex-col gap-3">
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">{industry.name}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 ${statusClass(industry.status)}`}>
                    {industry.status || 'Active'}
                  </span>
                </div>

                {/* Growth meter */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-text-muted font-medium">Growth</span>
                  </div>
                  <ProgressMeter value={industry.growthPercent || 0} color="#F97316" />
                </div>

                {/* Clients count */}
                <p className="text-xs text-text-muted">
                  {linkedClients.length} client{linkedClients.length !== 1 ? 's' : ''} linked
                </p>

                {/* Product variants */}
                <div>
                  <p className="text-xs text-text-muted mb-1.5">
                    {linkedProducts.length} product variant{linkedProducts.length !== 1 ? 's' : ''}
                  </p>
                  {linkedProducts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleProducts.map((p) => (
                        <span
                          key={p.id}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-violet-500/15 text-violet-400 border-violet-500/25"
                        >
                          {p.name}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-border text-text-muted border-borderLight">
                          +{extraCount} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button
                      onClick={() => handleEdit(industry)}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(industry.id)}
                      disabled={deleting === industry.id}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {deleting === industry.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <IndustryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
        item={editing}
      />
    </div>
  );
}
