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

const AdminRoute = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? children : <Navigate to="/" replace />;
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
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />

        {/* HRMS Routes — Human Resource Management System module */}
        {/* ME-1 fix: Admin-only HRMS views wrapped in AdminRoute guard.
            /hrms/leaves is intentionally left open to all employees — they
            only see their own leave applications (Firestore rules enforce this). */}
        <Route path="hrms/leaves" element={<LeaveManagement />} />
        <Route
          element={
            <AdminRoute>
              <Outlet />
            </AdminRoute>
          }
        >
          <Route path="hrms/directory"   element={<EmployeeDirectory />} />
          <Route path="hrms/attendance"  element={<AttendanceManager />} />
          <Route path="hrms/recruitment" element={<RecruitmentBoard />} />
          <Route path="hrms/performance" element={<PerformanceDashboard />} />
        </Route>

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
