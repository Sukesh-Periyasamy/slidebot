import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { selectAuthStatus, selectIsInitialized, useAuthStore } from '../store/authStore';

/**
 * useRequireAuth — redirect unauthenticated users to /login.
 * Place in any page component that requires authentication.
 *
 * @param redirectTo - path to redirect after login (defaults to current path)
 *
 * @example
 * function DashboardPage() {
 *   useRequireAuth();
 *   return <Dashboard />;
 * }
 */
export function useRequireAuth(redirectTo?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const isInitialized = useAuthStore(selectIsInitialized);
  const status = useAuthStore(selectAuthStatus);

  useEffect(() => {
    if (!isInitialized || status === 'loading') return;

    if (status === 'unauthenticated') {
      const returnTo = redirectTo ?? location.pathname + location.search;
      void navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [isInitialized, status, navigate, location, redirectTo]);

  return { isReady: isInitialized && status !== 'loading' };
}

/**
 * useRedirectIfAuthenticated — redirect already-logged-in users away from auth pages.
 *
 * @example
 * function LoginPage() {
 *   useRedirectIfAuthenticated('/dashboard');
 *   ...
 * }
 */
export function useRedirectIfAuthenticated(redirectTo = '/dashboard') {
  const navigate = useNavigate();
  const status = useAuthStore(selectAuthStatus);

  useEffect(() => {
    if (status === 'authenticated') {
      void navigate(redirectTo, { replace: true });
    }
  }, [status, navigate, redirectTo]);
}
