// Phase 10: Full implementation — expandable/collapsible roadmap tree UI
// Dependencies: RoadmapContext, RoadmapTree, RoadmapNodeDetail, RoadmapNodeModal

/**
 * CompanyRoadmap.jsx
 * Top-level page for the Company Roadmap module.
 * Mounted at /roadmap and /roadmap/:nodeId.
 *
 * Phase 10 implementation will:
 *  - Render the full-page layout: toolbar + tree panel + detail side-panel
 *  - Read useParams() for :nodeId deep-link auto-expansion
 *  - Render admin-only "Create Root Node" button
 *  - Delegate tree rendering to RoadmapTree.jsx
 *  - Delegate detail panel to RoadmapNodeDetail.jsx
 */
export default function CompanyRoadmap() {
  return (
    <div className="flex flex-col h-full items-center justify-center text-text-muted">
      <p className="text-lg font-semibold text-text-primary">Company Roadmap</p>
      <p className="text-sm mt-2">Phase 10 implementation coming soon.</p>
    </div>
  );
}
