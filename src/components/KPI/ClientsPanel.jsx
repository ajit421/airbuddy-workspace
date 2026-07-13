/**
 * ClientsPanel.jsx
 * KPI sub-panel for /kpi/clients
 * Shows clients with Current/Total toggle, industry tag, progress meter, status badge,
 * and per-client sales/paid-pilot counts.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import { deleteKpiClient } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import ClientModal from './modals/ClientModal';

// ─── Status → badge classes ───────────────────────────────────────────────────
const statusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'inactive' || s === 'churned')
    return 'bg-red-500/15 text-red-400 border-red-500/25';
  if (s === 'on hold' || s === 'paused')
    return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
  return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = ({ filter }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">💼</span>
    <p className="font-semibold text-text-primary">
      {filter === 'current' ? 'No current clients' : 'No clients yet'}
    </p>
    <p className="text-xs text-text-muted max-w-xs">
      {filter === 'current'
        ? 'All clients are currently inactive or churned.'
        : 'Admins can add clients and link them to industry verticals to track engagement.'}
    </p>
  </div>
);

export default function ClientsPanel() {
  const {
    clients,
    industries,
    currentClients,
    totalCurrentClients,
    loading,
    getIndustryForClient,
    getSalesCountForClient,
    getPaidPilotsCountForClient,
  } = useKpi();
  const { isAdmin } = useAuth();
  const { viewMode } = useViewMode();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);
  const [filter,    setFilter]    = useState('current'); // 'current' | 'total'

  const handleEdit = (client) => { setEditing(client); setModalOpen(true); };
  const handleAdd  = ()       => { setEditing(null);   setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this client? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiClient(id); }
    catch (err) { console.error('Delete client failed:', err); }
    finally { setDeleting(null); }
  };

  const displayedClients = filter === 'current' ? currentClients : clients;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Clients</h1>
          <p className="text-sm text-text-muted mt-1">Monitor client engagement and progress.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Client
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-orange/15 text-orange">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalCurrentClients}</p>
            <p className="text-sm font-semibold text-text-primary">Current Clients</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/15 text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{clients.length}</p>
            <p className="text-sm font-semibold text-text-primary">Total Clients</p>
          </div>
        </div>
      </div>

      {/* Current / Total toggle */}
      <div className="flex items-center gap-1 mb-5 p-1 bg-surface rounded-lg border border-border self-start w-fit">
        <button
          onClick={() => setFilter('current')}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            filter === 'current'
              ? 'bg-orange text-white shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Current Clients
        </button>
        <button
          onClick={() => setFilter('total')}
          className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
            filter === 'total'
              ? 'bg-orange text-white shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Total Clients
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : displayedClients.length === 0 ? (
        <Empty filter={filter} />
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">Industry</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden sm:table-cell">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden lg:table-cell">Sales</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden lg:table-cell">Pilots</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {displayedClients.map((client) => {
                const industry    = getIndustryForClient(client.industryId);
                const salesCount  = getSalesCountForClient(client.id);
                const pilotsCount = getPaidPilotsCountForClient(client.id);
                const prog        = client.progressPercent || 0;
                return (
                  <tr key={client.id} className="hover:bg-surfaceHover transition-colors">
                    <td className="px-4 py-3 font-semibold text-text-primary">{client.name}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {industry ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-orange/15 text-orange border-orange/30">{industry.name}</span>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {client.currentStatus ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusClass(client.currentStatus)}`}>{client.currentStatus}</span>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-20"><div className="progress-fill bg-blue-500" style={{ width: `${prog}%` }} /></div>
                        <span className="text-xs text-text-muted">{prog}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden lg:table-cell">{salesCount}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden lg:table-cell">{pilotsCount}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(client.id); }} disabled={deleting === client.id}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {deleting === client.id ? '…' : 'Del'}
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
          {displayedClients.map((client) => {
            const industry   = getIndustryForClient(client.industryId);
            const salesCount = getSalesCountForClient(client.id);
            const pilotsCount = getPaidPilotsCountForClient(client.id);
            return (
              <div key={client.id} className="card p-5 flex flex-col gap-3">
                {/* Name + status */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">{client.name}</h3>
                  {client.currentStatus && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 ${statusClass(client.currentStatus)}`}>
                      {client.currentStatus}
                    </span>
                  )}
                </div>

                {/* Industry tag */}
                {industry && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start bg-orange/15 text-orange border-orange/30">
                    {industry.name}
                  </span>
                )}

                {/* Progress meter */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-text-muted font-medium">Engagement Progress</span>
                  </div>
                  <ProgressMeter value={client.progressPercent || 0} color="#3B82F6" />
                </div>

                {/* Sales / Pilots counts */}
                <div className="flex items-center gap-3 text-xs text-text-muted border-t border-border pt-2">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <span className="font-semibold text-text-secondary">{salesCount}</span> product sale{salesCount !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="font-semibold text-text-secondary">{pilotsCount}</span> paid pilot{pilotsCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button onClick={() => handleEdit(client)}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(client.id)} disabled={deleting === client.id}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {deleting === client.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ClientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
        item={editing}
        industries={industries}
      />
    </div>
  );
}
