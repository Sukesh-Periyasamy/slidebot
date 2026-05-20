import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

import { AuthGuard } from '@/features/auth/components/AuthGuard';
import { LoginPage, AuthCallbackPage } from '@/features/auth/components/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { RoomPage } from '@/features/room/pages/RoomPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { AppLayout } from '@/shared/layouts/AppLayout';
import { NotFoundPage } from '@/shared/pages/NotFoundPage';

// ─────────────────────────────────────────────────────────────────────────────
// Router definition
// ─────────────────────────────────────────────────────────────────────────────

const router = createBrowserRouter([
  // ── Public routes ────────────────────────────────────────────────────────
  {
    path: '/',
    element: <LandingPage />,
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
    path: '/room/:deckId',
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
  {
    path: '*',
    element: <Navigate to="/404" replace />,
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
