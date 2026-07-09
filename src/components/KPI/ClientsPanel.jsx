/**
 * ClientsPanel.jsx
 * KPI sub-panel for /kpi/clients
 * Shows all clients with industry tag, progress meter and status badge.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { deleteKpiClient } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import ClientModal from './modals/ClientModal';

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">💼</span>
    <p className="font-semibold text-text-primary">No clients yet</p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add clients and link them to industry verticals to track engagement.
    </p>
  </div>
);

export default function ClientsPanel() {
  const { clients, industries, loading, getIndustryForClient } = useKpi();
  const { isAdmin } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);

  const handleEdit = (client) => { setEditing(client); setModalOpen(true); };
  const handleAdd  = ()       => { setEditing(null);   setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this client? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiClient(id); }
    catch (err) { console.error('Delete client failed:', err); }
    finally { setDeleting(null); }
  };

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
            <p className="text-2xl font-black text-text-primary">{clients.length}</p>
            <p className="text-sm font-semibold text-text-primary">Total Clients</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : clients.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => {
            const industry = getIndustryForClient(client.industryId);
            return (
              <div key={client.id} className="card p-5 flex flex-col gap-3">
                {/* Name + status */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">{client.name}</h3>
                  {client.currentStatus && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 bg-blue-500/15 text-blue-400 border-blue-500/25">
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
