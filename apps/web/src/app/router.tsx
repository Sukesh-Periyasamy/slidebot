import { createBrowserRouter, RouterProvider, Navigate, Link } from 'react-router-dom';

import { AuthGuard } from '@/features/auth/components/AuthGuard';
import { LoginPage, AuthCallbackPage } from '@/features/auth/components/LoginPage';
import { DashboardPage } from '@/features/decks/components/DashboardPage';
import { RoomPage } from '@/features/room/pages/RoomPage';
import { selectAuthStatus, selectIsInitialized, useAuthStore } from '@/features/auth/store/authStore';
import { AppLayout } from '@/shared/layouts/AppLayout';
import { DebugPage } from '@/features/debug/pages/DebugPage';
import { RealtimeDebugPage } from '@/features/debug/pages/RealtimeDebugPage';

function HomeRedirect() {
  const isInitialized = useAuthStore(selectIsInitialized);
  const status = useAuthStore(selectAuthStatus);

  if (!isInitialized || status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 text-surface-200">
        <p className="text-sm">Loading workspace...</p>
      </div>
    );
  }

  return status === 'authenticated' ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl p-6 text-surface-100">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-surface-400">Manage your account and workspace preferences.</p>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface-950 px-6 text-center">
      <h1 className="text-3xl font-semibold text-surface-50">Page Not Found</h1>
      <p className="mt-3 text-sm text-surface-400">The page you requested does not exist.</p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        Go Home
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Router definition
// ─────────────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  // ── Public routes ────────────────────────────────────────────────────────
  {
    path: '/',
    element: <HomeRedirect />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },

  // ── Protected routes (wrapped in AuthGuard + AppLayout) ─────────────────
  {
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      {
        path: '/dashboard',
        element: <DashboardPage />,
      },
      {
        path: '/settings',
        element: <SettingsPage />,
      },
    ],
  },

  // ── Room (fullscreen — no sidebar layout) ───────────────────────────────
  {
    path: '/room/:roomId',
    element: (
      <AuthGuard>
        <RoomPage />
      </AuthGuard>
    ),
  },

  // ── Catch-all ───────────────────────────────────────────────────────────
  {
    path: '/404',
    element: <NotFoundPage />,
  },
  ...(import.meta.env.DEV
    ? [
        {
          path: '/debug',
          element: <DebugPage />,
        },
        {
          path: '/debug/realtime',
          element: <RealtimeDebugPage />,
        },
      ]
    : []),
  {
    path: '*',
    element: <Navigate to="/404" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
