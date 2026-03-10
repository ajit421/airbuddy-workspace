import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext';
import AppLayout from './pages/AppLayout';
import LoginPage from './pages/LoginPage';
import EmployeeDashboard from './components/Dashboard/EmployeeDashboard';
import CalendarView from './components/Calendar/CalendarView';
import WorkPartner from './components/WorkPartner/WorkPartner';
import AnnouncementList from './components/Announcement/AnnouncementList';
import AboutPage from './components/About/AboutPage';
import AdminPanel from './components/Admin/AdminPanel';

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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
