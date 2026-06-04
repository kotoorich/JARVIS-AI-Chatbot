import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
  </div>
);

/**
 * Admin route guard. Authenticated non-admins go back to /chat;
 * unauthenticated users go to /login. Loading state shows a spinner.
 */
export default function AdminRoute({ fallback = <DefaultFallback /> }) {
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  if (isLoadingAuth) return fallback;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/chat" replace />;
  return <Outlet />;
}
