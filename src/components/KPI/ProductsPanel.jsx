/**
 * ProductsPanel.jsx
 * KPI sub-panel for /kpi/products
 * Shows all products with type badge, dev progress meter and completion state.
 * Admin can add, edit, and delete entries.
 */

import { useState } from 'react';
import { useKpi } from '../../context/KpiContext';
import { useAuth } from '../../context/AuthContext';
import { deleteKpiProduct } from '../../services/kpiService';
import { ProgressMeter } from '../shared/Charts';
import ProductModal from './modals/ProductModal';

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
    <span className="text-4xl">📦</span>
    <p className="font-semibold text-text-primary">No products yet</p>
    <p className="text-xs text-text-muted max-w-xs">
      Admins can add products to track development progress and completion status.
    </p>
  </div>
);

export default function ProductsPanel() {
  const { products, loading } = useKpi();
  const { isAdmin } = useAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [deleting,  setDeleting]  = useState(null);

  const handleEdit = (product) => { setEditing(product); setModalOpen(true); };
  const handleAdd  = ()        => { setEditing(null);    setModalOpen(true); };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    setDeleting(id);
    try { await deleteKpiProduct(id); }
    catch (err) { console.error('Delete product failed:', err); }
    finally { setDeleting(null); }
  };

  const completedCount = products.filter((p) => p.devCompleted).length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-text-primary">Products</h1>
          <p className="text-sm text-text-muted mt-1">Follow product development lifecycle and completion status.</p>
        </div>
        {isAdmin && (
          <button onClick={handleAdd} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-icon bg-violet-500/15 text-violet-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{products.length}</p>
            <p className="text-sm font-semibold text-text-primary">Total Products</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-green-500/15 text-green-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-black text-text-primary">{completedCount}</p>
            <p className="text-sm font-semibold text-text-primary">Dev Completed</p>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="card p-5 flex flex-col gap-3">
              {/* Name + completion icon */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-text-primary text-base leading-tight">{product.name}</h3>
                <span className="text-lg flex-shrink-0" title={product.devCompleted ? 'Dev Completed' : 'In Progress'}>
                  {product.devCompleted ? '✅' : '⏳'}
                </span>
              </div>

              {/* Type badge */}
              {product.type && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border inline-block self-start bg-violet-500/15 text-violet-400 border-violet-500/25">
                  {product.type}
                </span>
              )}

              {/* Dev progress meter */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-text-muted font-medium">Dev Progress</span>
                </div>
                <ProgressMeter value={product.devProgressPercent || 0} color="#8B5CF6" />
              </div>

              {/* Admin actions */}
              {isAdmin && (
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <button onClick={() => handleEdit(product)}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(product.id)} disabled={deleting === product.id}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {deleting === product.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ProductModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
        item={editing}
      />
    </div>
  );
}
