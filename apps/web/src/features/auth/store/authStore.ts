import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  // State
  isInitialized: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  session: Session | null;
  error: string | null;

  // Actions
  setInitialized: (initialized: boolean) => void;
  setSession: (session: Session | null, user: User | null) => void;
  setLoading: () => void;
  setError: (error: string) => void;
  clearAuth: () => void;
  updateDisplayName: (displayName: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  devtools(
    subscribeWithSelector((set) => ({
      // Initial state
      isInitialized: false,
      status: 'loading',
      user: null,
      session: null,
      error: null,

      setInitialized: (initialized) => set({ isInitialized: initialized }),

      setSession: (session, supaUser) => {
        if (!session || !supaUser) {
          set({ status: 'unauthenticated', user: null, session: null, error: null });
          return;
        }

        const meta = supaUser.user_metadata as Record<string, string> | undefined;

        const user: AuthUser = {
          id: supaUser.id,
          email: supaUser.email ?? '',
          displayName:
            meta?.['full_name'] ?? meta?.['name'] ?? supaUser.email?.split('@')[0] ?? 'Anonymous',
          avatarUrl: meta?.['avatar_url'] ?? null,
        };

        set({ status: 'authenticated', user, session, error: null });
      },

      setLoading: () => set({ status: 'loading', error: null }),

      setError: (error) => set({ status: 'unauthenticated', error }),

      clearAuth: () => set({ status: 'unauthenticated', user: null, session: null, error: null }),

      updateDisplayName: (displayName) =>
        set((state) => ({
          user: state.user ? { ...state.user, displayName } : null,
        })),
    })),
    { name: 'AuthStore' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors (stable references — avoids re-renders)
// ─────────────────────────────────────────────────────────────────────────────

export const selectUser = (s: AuthState) => s.user;
export const selectSession = (s: AuthState) => s.session;
export const selectIsInitialized = (s: AuthState) => s.isInitialized;
export const selectAuthStatus = (s: AuthState) => s.status;
export const selectIsAuthenticated = (s: AuthState) => s.status === 'authenticated';
export const selectIsLoading = (s: AuthState) => s.status === 'loading';
export const selectAuthError = (s: AuthState) => s.error;
