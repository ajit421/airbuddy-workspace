/**
 * KpiDashboard.jsx
 * Landing page for /kpi — summary stat cards for all 5 KPI categories
 * with quick-nav buttons to each sub-panel.
 */

import { useNavigate } from 'react-router-dom';
import { useKpi } from '../../context/KpiContext';

const Spinner = () => (
  <div className="flex items-center justify-center py-16">
    <div className="w-9 h-9 border-2 border-orange border-t-transparent rounded-full animate-spin" />
  </div>
);

const panels = [
  {
    path: '/kpi/industries',
    label: 'Industries',
    description: 'Track industry verticals and growth metrics',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    getCount: (ctx) => ctx.totalIndustries,
    sublabel: (ctx) => `${ctx.totalClients} clients linked`,
  },
  {
    path: '/kpi/clients',
    label: 'Clients',
    description: 'Monitor client engagement and progress',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color: 'text-orange',
    iconBg: 'bg-orange/15',
    getCount: (ctx) => ctx.totalClients,
    sublabel: () => 'Active & tracking',
  },
  {
    path: '/kpi/products',
    label: 'Products',
    description: 'Follow product development lifecycle',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    color: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    getCount: (ctx) => ctx.totalProducts,
    sublabel: (ctx) => {
      const completed = ctx.products.filter(p => p.devCompleted).length;
      return `${completed} dev-completed`;
    },
  },
  {
    path: '/kpi/sales',
    label: 'Sales',
    description: 'Track units sold and launch status',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    color: 'text-green-400',
    iconBg: 'bg-green-500/15',
    getCount: (ctx) => ctx.totalUnitsSold,
    sublabel: (ctx) => `${ctx.totalLaunched} launched`,
  },
  {
    path: '/kpi/patents',
    label: 'Patents',
    description: 'Monitor patent filings and grants',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    color: 'text-yellow-400',
    iconBg: 'bg-yellow-500/15',
    getCount: (ctx) => ctx.patents.length,
    sublabel: (ctx) => `${ctx.totalPatentsFiled} filed/granted`,
  },
];

export default function KpiDashboard() {
  const ctx      = useKpi();
  const navigate = useNavigate();
  const { loading } = ctx;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-text-primary">KPI Overview</h1>
        <p className="text-sm text-text-muted mt-1">
          Real-time key performance indicators across all business areas.
        </p>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            {panels.map((panel) => (
              <button
                key={panel.path}
                onClick={() => navigate(panel.path)}
                className="stat-card text-left hover:border-orange/40 transition-colors group cursor-pointer"
              >
                <div className={`stat-icon ${panel.iconBg} ${panel.color}`}>
                  {panel.icon}
                </div>
                <div>
                  <p className="text-2xl font-black text-text-primary group-hover:text-orange transition-colors">
                    {panel.getCount(ctx)}
                  </p>
                  <p className="text-sm font-semibold text-text-primary">{panel.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{panel.sublabel(ctx)}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Panel navigation grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {panels.map((panel) => (
              <button
                key={panel.path}
                onClick={() => navigate(panel.path)}
                className="card p-5 text-left flex items-start gap-4 hover:border-orange/40 transition-all group cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${panel.iconBg} ${panel.color}`}>
                  {panel.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-text-primary group-hover:text-orange transition-colors">
                    {panel.label}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                    {panel.description}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-orange mt-2 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    View panel
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
