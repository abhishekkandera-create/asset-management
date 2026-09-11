import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * Waits for the stored session to be verified before deciding. Redirecting
 * while that check is in flight would bounce a signed-in user to the login
 * screen on every reload.
 */
export function ProtectedRoute(): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Checking your session</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // `from` lets login send the user back where they were headed.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
