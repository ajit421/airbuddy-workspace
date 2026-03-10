import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { formatDate } from '../../utils/dateHelpers';

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

export default function Navbar({ onMenuToggle }) {
  const { userProfile, signOut, isAdmin } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path === '/calendar') return 'Calendar';
    if (path === '/work-partner') return 'Work Partner';
    if (path === '/announcements') return 'Announcements';
    if (path === '/about') return 'About & Help';
    if (path.startsWith('/admin')) return 'Admin Panel';
    return 'WorkSpace';
  };

  return (
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-40">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <button
          id="mobile-menu-toggle"
          onClick={onMenuToggle}
          className="lg:hidden btn-ghost p-2"
        >
          <MenuIcon />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-muted border border-orange/30 flex items-center justify-center">
            <span className="text-orange font-bold text-sm">AB</span>
          </div>
          <div className="hidden sm:block">
            <p className="text-xs text-text-secondary font-medium">AirBuddy Aerospace</p>
            <p className="text-sm font-bold text-text-primary leading-tight">{getPageTitle()}</p>
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications Bell */}
        <div className="relative" ref={notifRef}>
          <button
            id="notifications-bell"
            onClick={() => setNotifOpen(p => !p)}
            className="relative btn-ghost p-2 rounded-lg"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange rounded-full text-xs text-white font-bold flex items-center justify-center animate-pulse-dot">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded-xl shadow-card overflow-hidden animate-fade-in z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="font-semibold text-sm text-text-primary">Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-orange hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      className={`px-4 py-3 border-b border-borderLight cursor-pointer hover:bg-surfaceHover transition-colors ${!n.read ? 'bg-orange-muted/30' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read ? 'bg-orange' : 'bg-border'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary font-medium truncate">{n.title}</p>
                          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-text-muted">{formatDate(n.createdAt)}</p>
                            {n.eventLink && (
                              <a
                                href={n.eventLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 18H5V9h14v13zM7 11h5v5H7z" />
                                </svg>
                                View in Calendar
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            id="user-menu-toggle"
            onClick={() => setUserMenuOpen(p => !p)}
            className="flex items-center gap-2 btn-ghost px-2 py-1.5 rounded-lg"
          >
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-orange-muted border border-orange/30 flex items-center justify-center text-orange font-bold text-xs">
                {userProfile?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-text-primary leading-tight">{userProfile?.name || 'User'}</p>
              <p className="text-xs text-text-muted capitalize">{userProfile?.role || 'employee'}</p>
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-surface border border-border rounded-xl shadow-card overflow-hidden animate-fade-in z-50">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold text-text-primary">{userProfile?.name}</p>
                <p className="text-xs text-text-muted truncate">{userProfile?.email}</p>
                {isAdmin && <span className="badge-orange mt-1">Admin</span>}
              </div>
              {isAdmin && (
                <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="block px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surfaceHover transition-colors">
                  Admin Panel
                </Link>
              )}
              <button
                id="sign-out-btn"
                onClick={signOut}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
