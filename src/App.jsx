import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ViewModeProvider } from './context/ViewModeContext';
import { TaskProvider } from './context/TaskContext';
import AppLayout from './pages/AppLayout';
import LoginPage from './pages/LoginPage';
import EmployeeDashboard from './components/Dashboard/EmployeeDashboard';
import CalendarView from './components/Calendar/CalendarView';
import WorkPartner from './components/WorkPartner/WorkPartner';
import AnnouncementList from './components/Announcement/AnnouncementList';
import AboutPage from './components/About/AboutPage';
import AdminPanel from './components/Admin/AdminPanel';
import DocsPage from './pages/DocsPage';
import ConnectClaudePage from './pages/ConnectClaudePage';

// HRMS Module imports — added for the new HRMS feature set
import EmployeeDirectory    from './components/HRMS/Directory/EmployeeDirectory';
import AttendanceManager    from './components/HRMS/Attendance/AttendanceManager';
import LeaveManagement      from './components/HRMS/Attendance/LeaveManagement';
import RecruitmentBoard     from './components/HRMS/Recruitment/RecruitmentBoard';
import PerformanceDashboard from './components/HRMS/Performance/PerformanceDashboard';
import TeamMembers          from './components/HRMS/Directory/TeamMembers';

// KPI Module imports
import { KpiProvider }    from './context/KpiContext';
import KpiDashboard       from './components/KPI/KpiDashboard';
import IndustriesPanel    from './components/KPI/IndustriesPanel';
import ClientsPanel       from './components/KPI/ClientsPanel';
import ProductsPanel      from './components/KPI/ProductsPanel';
import SalesPanel         from './components/KPI/SalesPanel';
import IPPanel            from './components/KPI/PatentsPanel';

import { ADMIN_PANEL_PERMISSIONS } from './utils/permissionCatalog';
// Company Roadmap Module imports
import { RoadmapProvider } from './context/RoadmapContext';
// Phase 19: lazy-loaded so the entire Roadmap component tree is split into
// a separate async chunk and excluded from the initial bundle.
const CompanyRoadmap = lazy(() => import('./components/Roadmap/CompanyRoadmap'));

/** Suspense fallback shown while the roadmap chunk is downloading */
function RoadmapLoadingFallback() {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4">
      <div className="w-10 h-10 border-2 border-orange border-t-transparent rounded-full animate-spin" />
      <p className="text-text-muted text-sm">Loading roadmap…</p>
    </div>
  );
}

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange to-orange-hover flex items-center justify-center text-white font-black text-xl animate-pulse">AB</div>
        <div className="animate-spin w-6 h-6 border-2 border-orange border-t-transparent rounded-full" />
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

// Admin-granted permission gate (src/utils/permissionCatalog.js). `perm` is
// one key or an array meaning "any of these". can() already returns true for
// an admin and false for an admin in "Viewing as Employee" mode. The rules
// enforce the same keys; this only keeps people off pages they cannot use.
const PermissionRoute = ({ perm, children }) => {
  const { can, loading } = useAuth();
  if (loading) return null;
  const keys = Array.isArray(perm) ? perm : [perm];
  return keys.some(can) ? children : <Navigate to="/" replace />;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-orange border-t-transparent rounded-full" />
    </div>
  );

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Hands the session to the local airbuddy-mcp server. Outside ProtectedRoute
          so a signed-out visit keeps its ?port=&state= — see ConnectClaudePage. */}
      <Route path="connect/claude" element={<ConnectClaudePage />} />
      {/* HI-9 fix: docs routes require login, placed outside AppLayout to avoid double header/sidebar layout issues */}
      <Route
        path="docs"
        element={
          <ProtectedRoute>
            <DocsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="docs/:docId"
        element={
          <ProtectedRoute>
            <DocsPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <TaskProvider>
              <AppLayout />
            </TaskProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<EmployeeDashboard />} />
        <Route path="calendar" element={<CalendarView />} />
        <Route path="work-partner" element={<WorkPartner />} />
        <Route path="team" element={<TeamMembers />} />
        <Route path="announcements" element={<AnnouncementList />} />
        <Route path="about" element={<AboutPage />} />
        <Route
          path="admin"
          element={
            <PermissionRoute perm={ADMIN_PANEL_PERMISSIONS}>
              <AdminPanel />
            </PermissionRoute>
          }
        />

        {/* HRMS Routes — Human Resource Management System module */}
        {/* ME-1 fix: team-wide HRMS views are guarded, now per permission
            rather than admin-only (admins pass every PermissionRoute).
            /hrms/leaves is intentionally left open to all employees — they
            only see their own leave applications (Firestore rules enforce this). */}
        <Route path="hrms/leaves" element={<LeaveManagement />} />
        <Route path="hrms/directory"   element={<PermissionRoute perm="hrms.directory"><EmployeeDirectory /></PermissionRoute>} />
        <Route path="hrms/attendance"  element={<PermissionRoute perm="hrms.attendance"><AttendanceManager /></PermissionRoute>} />
        <Route path="hrms/recruitment" element={<PermissionRoute perm="hrms.recruitment"><RecruitmentBoard /></PermissionRoute>} />
        <Route path="hrms/performance" element={<PermissionRoute perm="hrms.performance"><PerformanceDashboard /></PermissionRoute>} />

        {/* KPI Routes — wrapped in KpiProvider so listeners only run on KPI pages */}
        <Route element={<KpiProvider><Outlet /></KpiProvider>}>
          <Route path="kpi"            element={<KpiDashboard />} />
          <Route path="kpi/industries" element={<IndustriesPanel />} />
          <Route path="kpi/clients"    element={<ClientsPanel />} />
          <Route path="kpi/products"   element={<ProductsPanel />} />
          <Route path="kpi/sales"      element={<SalesPanel />} />
          <Route path="kpi/ip"         element={<IPPanel />} />
          <Route path="kpi/patents"    element={<Navigate to="/kpi/ip" replace />} />
        </Route>

        {/* Company Roadmap Routes — lazy-loaded chunk (Phase 19) */}
        {/* RoadmapProvider scopes Firestore listeners to /roadmap routes only */}
        <Route element={
          <Suspense fallback={<RoadmapLoadingFallback />}>
            <RoadmapProvider><Outlet /></RoadmapProvider>
          </Suspense>
        }>
          <Route path="roadmap"         element={<CompanyRoadmap />} />
          <Route path="roadmap/:nodeId" element={<CompanyRoadmap />} />
        </Route>
      </Route>
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ViewModeProvider>
          <AppRoutes />
        </ViewModeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
