import { useCallback } from 'react';

import { supabase } from '@/lib/supabase';
import {
  selectAuthError,
  selectAuthStatus,
  selectIsAuthenticated,
  selectIsLoading,
  selectSession,
  selectUser,
  useAuthStore,
} from '../store/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// useAuth — central auth hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Primary auth hook.
 * Provides user state + all auth actions (login, logout, etc.)
 *
 * @example
 * const { user, isAuthenticated, signInWithGoogle, signOut } = useAuth();
 */
export function useAuth() {
  const user = useAuthStore(selectUser);
  const session = useAuthStore(selectSession);
  const status = useAuthStore(selectAuthStatus);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isLoading = useAuthStore(selectIsLoading);
  const error = useAuthStore(selectAuthError);
  const setError = useAuthStore((s) => s.setError);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // ── Email + Password Sign In ──────────────────────────────────────────────
  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return { error: authError.message };
      }

      return { error: null };
    },
    [setError]
  );

  // ── Email + Password Sign Up ──────────────────────────────────────────────
  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      displayName: string
    ): Promise<{ error: string | null }> => {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        return { error: authError.message };
      }

      return { error: null };
    },
    [setError]
  );

  // ── Google OAuth ──────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async (): Promise<{ error: string | null }> => {
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          // Request offline access for refresh tokens
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (authError) {
      setError(authError.message);
      return { error: authError.message };
    }

    return { error: null };
  }, [setError]);

  // ── Sign Out ──────────────────────────────────────────────────────────────
  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
    clearAuth();
  }, [clearAuth]);

  // ── Get access token (for API requests) ──────────────────────────────────
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return {
    // State
    user,
    session,
    status,
    isAuthenticated,
    isLoading,
    error,

    // Actions
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    getAccessToken,
  };
}
