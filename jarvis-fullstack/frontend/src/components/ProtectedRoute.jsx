import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
  </div>
);

/**
 * Route guard that matches AuthContext's actual API
 * ({ isAuthenticated, isLoadingAuth }). Renders nested routes when
 * authenticated, redirects to /login otherwise.
 */
export default function ProtectedRoute({ fallback = <DefaultFallback /> }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) return fallback;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
