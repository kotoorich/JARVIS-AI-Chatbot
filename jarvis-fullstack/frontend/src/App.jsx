import { Suspense, lazy, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { queryClientInstance } from '@/lib/query-client';
import Layout from './components/Layout';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import { setToastQueryClient } from '@/components/ui/use-toast';

// Route-level code splitting keeps the initial bundle small.
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Chat = lazy(() => import('./pages/Chat'));
const Settings = lazy(() => import('./pages/Settings'));
const Support = lazy(() => import('./pages/Support'));
const TicketDetail = lazy(() => import('./pages/TicketDetail'));
const Modules = lazy(() => import('./pages/Modules'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminUserDetail = lazy(() => import('./pages/admin/AdminUserDetail'));
const AdminTickets = lazy(() => import('./pages/admin/AdminTickets'));
const AdminActivity = lazy(() => import('./pages/admin/AdminActivity'));
const AdminModules = lazy(() => import('./pages/admin/AdminModules'));
const AdminModuleEdit = lazy(() => import('./pages/admin/AdminModuleEdit'));
const PageNotFound = lazy(() => import('./pages/PageNotFound'));

const FullScreenLoader = () => (
  <div className="h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
  </div>
);

const AppRoutes = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return <FullScreenLoader />;

  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        {/* First-login animated greeting (no Layout chrome) */}
        <Route
          path="/welcome"
          element={isAuthenticated ? <Welcome /> : <Navigate to="/login" replace />}
        />

        {/* Authenticated user routes — share the main app Layout */}
        <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:conversationId" element={<Chat />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/support" element={<Support />} />
          <Route path="/support/:id" element={<TicketDetail />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/modules/:slug" element={<Modules />} />
        </Route>

        {/* Admin-only routes — different layout (sidebar) with role guard */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            <Route path="/admin/modules" element={<AdminModules />} />
            <Route path="/admin/modules/:id" element={<AdminModuleEdit />} />
            <Route path="/admin/tickets" element={<AdminTickets />} />
            <Route path="/admin/tickets/:id" element={<TicketDetail adminContext={true} />} />
            <Route path="/admin/activity" element={<AdminActivity />} />
          </Route>
        </Route>

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  // Hand the React Query client to the toast() shim so it can bump the
  // notification list whenever a new notification is posted.
  useEffect(() => {
    setToastQueryClient(queryClientInstance);
  }, []);

  return (
    <QueryClientProvider client={queryClientInstance}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
