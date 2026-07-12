import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RoleBadge from './RoleBadge';

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/work-partner',
    label: 'Work Partner',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/team',
    label: 'Team Members',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
  },
  {
    to: '/announcements',
    label: 'Announcements',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    to: '/about',
    label: 'About & Help',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/docs',
    label: 'Documentation',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

export default function Sidebar({ isOpen, onClose }) {
  const { userProfile, isAdmin, realIsAdmin, isEmployeeView, toggleEmployeeView } = useAuth();

  const getLinkClass = ({ isActive }) =>
    isActive ? 'sidebar-link-active' : 'sidebar-link';

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-surface border-r border-border z-40
          flex flex-col transform transition-transform duration-300
          lg:static lg:transform-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white shadow-md flex items-center justify-center p-1 flex-shrink-0">
              <img
                src="/airbuddyin_logo.png"
                alt="AirBuddy"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs text-text-muted font-medium">AirBuddy</p>
              <p className="text-sm font-bold text-text-primary leading-tight">WorkSpace</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mb-3">
            Main Menu
          </p>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={getLinkClass}
                  onClick={onClose}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {isAdmin && (
            <>
              <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mt-6 mb-3">
                Administration
              </p>
              <ul className="space-y-1">
                <li>
                  <NavLink
                    to="/admin"
                    className={getLinkClass}
                    onClick={onClose}
                  >
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Admin Panel</span>
                  </NavLink>
                </li>
              </ul>
            </>
          )}

          {/* HRMS Section */}
          {/* All users see the HRMS header (employees have Leaves).         */}
          {/* Admin-only pages are hidden from employees in both sidebar AND  */}
          {/* route guards (App.jsx AdminRoute), matching ME-1 fix.          */}
          <>
            <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mt-6 mb-3">
              HRMS
            </p>
            <ul className="space-y-1">
              {/* Directory — Admin only */}
              {isAdmin && (
                <li>
                  <NavLink to="/hrms/directory" className={getLinkClass} onClick={onClose}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Directory</span>
                  </NavLink>
                </li>
              )}
              {/* Attendance — Admin only */}
              {isAdmin && (
                <li>
                  <NavLink to="/hrms/attendance" className={getLinkClass} onClick={onClose}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Attendance</span>
                  </NavLink>
                </li>
              )}
              {/* Leave Management — ALL users (employees see own leaves only) */}
              <li>
                <NavLink to="/hrms/leaves" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span>Leaves</span>
                </NavLink>
              </li>
              {/* Recruitment — Admin only */}
              {isAdmin && (
                <li>
                  <NavLink to="/hrms/recruitment" className={getLinkClass} onClick={onClose}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Recruitment</span>
                  </NavLink>
                </li>
              )}
              {/* Performance Dashboard — Admin only */}
              {isAdmin && (
                <li>
                  <NavLink to="/hrms/performance" className={getLinkClass} onClick={onClose}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Performance</span>
                  </NavLink>
                </li>
              )}
            </ul>
          </>


          {/* KPIs Section — visible to ALL authenticated users */}
          <>
            <p className="text-xs text-text-muted font-semibold uppercase tracking-wider px-3 mt-6 mb-3">
              KPIs
            </p>
            <ul className="space-y-1">
              <li>
                <NavLink to="/kpi" end className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>KPI Overview</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/kpi/industries" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Industries</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/kpi/clients" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Clients</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/kpi/products" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <span>Products</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/kpi/sales" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>Sales</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/kpi/ip" className={getLinkClass} onClick={onClose}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>IP</span>
                </NavLink>
              </li>
            </ul>
          </>
        </nav>

        {/* User Profile Footer */}
        <div className="px-3 py-4 border-t border-border flex-shrink-0 flex flex-col gap-2">
          {realIsAdmin && (
            <button
              onClick={toggleEmployeeView}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-colors border ${
                isEmployeeView
                  ? 'bg-orange/10 border-orange/30 text-orange hover:bg-orange/20'
                  : 'bg-surfaceHover border-border text-text-secondary hover:text-text-primary hover:border-gray-600'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {isEmployeeView ? 'Viewing as Employee' : 'Preview as Employee'}
              </span>
              <div className={`w-7 h-4 rounded-full relative transition-colors ${isEmployeeView ? 'bg-orange' : 'bg-border'}`}>
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isEmployeeView ? 'translate-x-3' : 'translate-x-0'}`} />
              </div>
            </button>
          )}
          
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-background">
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-orange-muted flex items-center justify-center text-orange font-bold text-sm flex-shrink-0">
                {userProfile?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{userProfile?.name || 'User'}</p>
              <RoleBadge role={userProfile?.role} customRole={userProfile?.customRole} size="xs" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
