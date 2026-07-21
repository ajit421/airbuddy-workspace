import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRoadmap }      from '../../context/RoadmapContext';
import { useRoadmapTree }  from '../../hooks/useRoadmapTree';
import { useAuth }         from '../../context/AuthContext';
import { canEditRoadmapStructure } from '../../utils/permissions';
import { archiveNode }     from '../../services/roadmapService';
import RoadmapTree         from './RoadmapTree';
import RoadmapNodeModal    from './RoadmapNodeModal';
import RoadmapNodeDetail   from './RoadmapNodeDetail';

/**
 * CompanyRoadmap.jsx
 * Top-level page for the Company Roadmap module.
 * Mounted at /roadmap and /roadmap/:nodeId.
 *
 * Phase 11 additions:
 *  - Split layout: scrollable tree panel (left) + RoadmapNodeDetail (right)
 *  - RoadmapNodeModal wired with full create/edit form
 *  - "Add Child Node" flow from detail panel
 *  - onCreated callback auto-selects the new node
 *  - onNavigate (breadcrumb) scrolls tree to parent nodes
 */
export default function CompanyRoadmap() {
  const { nodeId: deepLinkId }  = useParams();
  const { rootNodes, loading, error } = useRoadmap();
  const { userProfile }         = useAuth();
  const treeHook                = useRoadmapTree();
  const canEdit                 = canEditRoadmapStructure(userProfile);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState(deepLinkId ?? null);

  // Modal state
  const [modalOpen,     setModalOpen]     = useState(false);
  const [modalNode,     setModalNode]     = useState(null);   // null = create, obj = edit
  const [modalParent,   setModalParent]   = useState(null);   // full parent node doc

  // Filter/search state
  const [searchQuery,    setSearchQuery]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');

  // ── Deep-link: auto-select nodeId from URL ────────────────────────────────
  useEffect(() => {
    if (deepLinkId) setSelectedNodeId(deepLinkId);
  }, [deepLinkId]);

  // ── Filtered root nodes ───────────────────────────────────────────────────
  const filteredRoots = rootNodes.filter((n) => {
    const matchSearch   = !searchQuery || n.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus   = filterStatus   === 'all' || n.status   === filterStatus;
    const matchPriority = filterPriority === 'all' || n.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Toggle selection: click same node again → deselect (close panel)
  const handleSelect = useCallback((node) => {
    setSelectedNodeId((prev) => prev === node.id ? null : node.id);
  }, []);

  // Admin: open edit modal from card hover button OR from detail panel
  const handleEdit = useCallback((node) => {
    setModalNode(node);
    setModalParent(null);
    setModalOpen(true);
  }, []);

  // Admin: open create-child modal from detail panel "Add Child" button
  const handleAddChild = useCallback((parentNode) => {
    setModalNode(null);
    setModalParent(parentNode);
    setModalOpen(true);
  }, []);

  // Admin: open root-level create modal from toolbar button
  const handleAddRoot = useCallback(() => {
    setModalNode(null);
    setModalParent(null);
    setModalOpen(true);
  }, []);

  // After successful create: auto-select the new node
  const handleCreated = useCallback((newNodeId) => {
    setSelectedNodeId(newNodeId);
  }, []);

  // Archive (soft-delete) from card hover button
  const handleDelete = useCallback(async (node) => {
    if ((node.childCount ?? 0) > 0) return;
    const confirmed = window.confirm(
      `Archive "${node.title}"? It will be hidden from the roadmap. This can be undone by an admin.`
    );
    if (!confirmed) return;
    try {
      await archiveNode(node.id, userProfile?.uid);
      // If the archived node was selected, deselect
      if (selectedNodeId === node.id) setSelectedNodeId(null);
    } catch (err) {
      console.error('[CompanyRoadmap] archiveNode:', err);
      alert(`Failed to archive: ${err.message}`);
    }
  }, [userProfile, selectedNodeId]);

  // Breadcrumb navigation: clicking an ancestor highlights it
  const handleNavigate = useCallback((nodeId) => {
    setSelectedNodeId(nodeId ?? null);
  }, []);

  // Collapse all expanded nodes
  const handleCollapseAll = useCallback(() => {
    treeHook.expandedIds.forEach((id) => {
      if (treeHook.isExpanded(id)) treeHook.toggleExpand(id);
    });
  }, [treeHook]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalNode(null);
    setModalParent(null);
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Loading roadmap…</p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-red-400 text-sm font-medium">Failed to load roadmap</p>
        <p className="text-text-muted text-xs">{error?.message ?? 'Unknown error'}</p>
      </div>
    );
  }

  const detailOpen = Boolean(selectedNodeId);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-1 pb-4">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <span className="text-gradient">Company Roadmap</span>
            <span className="badge bg-orange-muted text-orange border border-orange/30 text-xs">
              {rootNodes.length} {rootNodes.length === 1 ? 'milestone' : 'milestones'}
            </span>
          </h1>
          <p className="section-subtitle mt-0.5">Track company goals, milestones, and deliverables</p>
        </div>

        {canEdit && (
          <button
            id="roadmap-add-root-btn"
            onClick={handleAddRoot}
            className="btn-primary flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Milestone
          </button>
        )}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2 pb-3">
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="roadmap-search"
            type="text"
            placeholder="Search milestones…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-8 h-8 text-xs"
          />
        </div>

        <select
          id="roadmap-filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="select-field h-8 text-xs w-36"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in-progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>

        <select
          id="roadmap-filter-priority"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="select-field h-8 text-xs w-36"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {treeHook.expandedIds.size > 0 && (
          <button
            id="roadmap-collapse-all"
            onClick={handleCollapseAll}
            className="btn-ghost h-8 text-xs flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            Collapse all
          </button>
        )}

        {(searchQuery || filterStatus !== 'all' || filterPriority !== 'all') && (
          <button
            onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); }}
            className="btn-ghost h-8 text-xs flex-shrink-0 text-orange"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Main content: tree panel + detail side panel ──────────────────── */}
      <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">

        {/* Tree panel */}
        <div className={`
          flex-1 min-w-0 overflow-y-auto pr-1 transition-all duration-300
          ${detailOpen ? 'pr-3' : ''}
        `}>
          {filteredRoots.length > 0 ? (
            <RoadmapTree
              nodes={filteredRoots}
              depth={0}
              treeState={treeHook}
              selectedId={selectedNodeId}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canEdit={canEdit}
            />
          ) : rootNodes.length === 0 ? (
            <EmptyState canEdit={canEdit} onAdd={handleAddRoot} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center">
                <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
              </div>
              <p className="text-text-secondary text-sm font-medium">No milestones match your filters</p>
              <button
                onClick={() => { setSearchQuery(''); setFilterStatus('all'); setFilterPriority('all'); }}
                className="text-orange text-xs hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Detail side panel — slide in when a node is selected */}
        {detailOpen && (
          <div className="
            w-80 xl:w-96 flex-shrink-0 rounded-xl overflow-hidden border border-border
            animate-slide-in
          ">
            <RoadmapNodeDetail
              nodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
              onEdit={handleEdit}
              onAddChild={handleAddChild}
              onNavigate={handleNavigate}
            />
          </div>
        )}
      </div>

      {/* ── Create / Edit modal ───────────────────────────────────────────── */}
      <RoadmapNodeModal
        isOpen={modalOpen}
        onClose={closeModal}
        parentNode={modalParent}
        node={modalNode}
        onCreated={handleCreated}
      />
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyState({ canEdit, onAdd }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 animate-fade-in">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-orange-muted border border-orange/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>

      <div className="text-center max-w-xs">
        <h3 className="text-text-primary font-semibold text-base mb-1">No milestones yet</h3>
        <p className="text-text-muted text-sm leading-relaxed">
          {canEdit
            ? 'Create the first company milestone to start building your roadmap.'
            : 'No milestones have been created yet. Check back later.'}
        </p>
      </div>

      {canEdit && (
        <button id="roadmap-empty-add-btn" onClick={onAdd} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add First Milestone
        </button>
      )}
    </div>
  );
}
