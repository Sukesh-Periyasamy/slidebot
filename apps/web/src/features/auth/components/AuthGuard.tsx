import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { selectAuthStatus, selectIsInitialized, useAuthStore } from '../store/authStore';

interface AuthGuardProps {
  children: ReactNode;
  /** Fallback shown during session loading (default: full-screen spinner) */
  fallback?: ReactNode;
}

/**
 * AuthGuard — route-level protection component.
 *
 * Wraps protected routes in the router. Redirects to /login
 * when unauthenticated, and shows a loading state during session resolution.
 *
 * @example
 * <Route element={<AuthGuard><DashboardPage /></AuthGuard>} />
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const location = useLocation();
  const isInitialized = useAuthStore(selectIsInitialized);
  const status = useAuthStore(selectAuthStatus);

  if (!isInitialized || status === 'loading') {
    return fallback ?? <AuthLoadingScreen />;
  }

  if (status === 'unauthenticated') {
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  return <>{children}</>;
}

/**
 * Full-screen loading screen shown while session is being resolved.
 */
function AuthLoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-950">
      <div className="flex flex-col items-center gap-4">
        {/* Animated logo mark */}
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-xl bg-brand-500 opacity-20 animate-ping" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
            <SlideBotIcon />
          </div>
        </div>
        <p className="text-sm text-surface-400 animate-pulse-soft">Loading...</p>
      </div>
    </div>
  );
}

function SlideBotIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
      <rect x="6" y="14" width="6" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.4" />
    </svg>
  );
}
