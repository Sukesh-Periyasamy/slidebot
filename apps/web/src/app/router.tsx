import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';

import { AuthGuard } from '@/features/auth/components/AuthGuard';
import { LoginPage, AuthCallbackPage } from '@/features/auth/components/LoginPage';
import { RoomPage } from '@/features/room/pages/RoomPage';
const DashboardPage = () => <div>Dashboard</div>;
const SettingsPage = () => <div>Settings</div>;
const LandingPage = () => <div>Landing</div>;
const NotFoundPage = () => <div>404</div>;
const AppLayout = () => <Outlet />;

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
