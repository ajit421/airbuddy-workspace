/**
 * SalesPanel.jsx
 * KPI sub-panel for /kpi/sales
 * Shows all sale entries with product name, sale type badge, linked client name,
 * units sold, progress meter, and launched badge.
 * Summary strip shows: Total Launched, Total Units Sold, B2B Sales, Paid Pilots.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import { deleteKpiSale } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import SaleModal from './modals/SaleModal';

// ─── Sale type → badge classes ─────────────────────────────────────────────
const typeClass = (type) => {
  switch (type) {
    case 'B2B Sale':    return 'bg-green-500/15 text-green-400 border-green-500/25';
    case 'Paid Pilot':  return 'bg-blue-500/15 text-blue-400 border-blue-500/25';
    default:            return 'bg-border text-text-muted border-borderLight';
  }
};

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">📈</span>
    <p className="font-semibold text-text-primary">No sales data yet</p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add sales entries linked to products and clients to track units sold and launch status.
    </p>
  </div>
);

export default function SalesPanel() {
  const {
    sales,
    products,
    clients,
    loading,
    getProductForSale,
    getClientForSale,
    totalLaunched,
    totalUnitsSold,
    totalB2BSales,
    totalPaidPilots,
  } = useKpi();
  const { isAdmin } = useAuth();
  const { viewMode } = useViewMode();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);

  const handleEdit = (sale) => { setEditing(sale); setModalOpen(true); };
  const handleAdd  = ()     => { setEditing(null);  setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this sale entry? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiSale(id); }
    catch (err) { console.error('Delete sale failed:', err); }
    finally { setDeleting(null); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Sales</h1>
          <p className="text-sm text-text-muted mt-1">Track B2B product sales, paid pilots, and launch status.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Sale
          </button>
        )}
      </div>

      {/* Summary strip — 4 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-green-500/15 text-green-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalLaunched}</p>
            <p className="text-sm font-semibold text-text-primary">Total Launched</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-orange/15 text-orange">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalUnitsSold.toLocaleString()}</p>
            <p className="text-sm font-semibold text-text-primary">Total Units Sold</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-green-500/15 text-green-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalB2BSales}</p>
            <p className="text-sm font-semibold text-text-primary">B2B Sales</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-blue-500/15 text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{totalPaidPilots}</p>
            <p className="text-sm font-semibold text-text-primary">Paid Pilots</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : sales.length === 0 ? (
        <Empty />
      ) : viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-background">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden md:table-cell">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden sm:table-cell">Units Sold</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide hidden lg:table-cell">Progress</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Launched</th>
                {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {sales.map((sale) => {
                const product = getProductForSale(sale.productId);
                const client  = sale.clientId ? getClientForSale(sale.clientId) : null;
                const prog    = sale.salesProgressPercent || 0;
                return (
                  <tr key={sale.id} className="hover:bg-surfaceHover transition-colors">
                    <td className="px-4 py-3 font-semibold text-text-primary">{product?.name || 'Unknown'}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {sale.type ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${typeClass(sale.type)}`}>{sale.type}</span>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden md:table-cell">{client?.name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary hidden sm:table-cell">{(sale.unitsSold || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-20"><div className="progress-fill bg-green-500" style={{ width: `${prog}%` }} /></div>
                        <span className="text-xs text-text-muted">{prog}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        sale.launched ? 'bg-green-500/15 text-green-400 border-green-500/25' : 'bg-border text-text-muted border-borderLight'
                      }`}>
                        {sale.launched ? 'Launched' : 'Pending'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(sale); }}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(sale.id); }} disabled={deleting === sale.id}
                            className="btn-ghost flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {deleting === sale.id ? '…' : 'Del'}
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
          {sales.map((sale) => {
            const product = getProductForSale(sale.productId);
            const client  = sale.clientId ? getClientForSale(sale.clientId) : null;
            return (
              <div key={sale.id} className="card p-5 flex flex-col gap-3">
                {/* Product name + launched badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-text-primary text-base leading-tight">
                    {product?.name || 'Unknown Product'}
                  </h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block flex-shrink-0 ${
                    sale.launched
                      ? 'bg-green-500/15 text-green-400 border-green-500/25'
                      : 'bg-border text-text-muted border-borderLight'
                  }`}>
                    {sale.launched ? 'Launched' : 'Pending'}
                  </span>
                </div>

                {/* Sale type badge */}
                {sale.type && (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start ${typeClass(sale.type)}`}>
                    {sale.type}
                  </span>
                )}

                {/* Linked client */}
                {client && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <svg className="w-3.5 h-3.5 text-orange flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="font-semibold text-text-secondary">{client.name}</span>
                  </div>
                )}

                {/* Units sold */}
                <p className="text-sm text-text-secondary">
                  <span className="font-bold text-text-primary">{(sale.unitsSold || 0).toLocaleString()}</span>
                  {' '}units sold
                </p>

                {/* Sales progress meter */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-text-muted font-medium">Sales Progress</span>
                  </div>
                  <ProgressMeter value={sale.salesProgressPercent || 0} color="#22C55E" />
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button onClick={() => handleEdit(sale)}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(sale.id)} disabled={deleting === sale.id}
                      className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      {deleting === sale.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SaleModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
        item={editing}
        products={products}
        clients={clients}
      />
    </div>
  );
}
