import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { supabase } from '@/lib/supabase';
import { selectIsInitialized, useAuthStore } from '@/features/auth/store/authStore';
import { SessionProvider } from '@/features/collaboration/providers/SessionProvider';

// ── TanStack Query client config ───────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx errors — only on network/5xx
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      staleTime: 30_000, // 30s before refetch
      gcTime: 5 * 60_000, // 5min garbage collection
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// AuthProvider — Supabase session listener
// ─────────────────────────────────────────────────────────────────────────────

function AuthProvider({ children }: { children: ReactNode }) {
  const { setSession, setLoading, setError, setInitialized } = useAuthStore();

  useEffect(() => {
    let isMounted = true;
    setInitialized(false);
    setLoading();

    // 1. Load initial session (handles page refresh)
    const loadInitialSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          setError(error.message);
          return;
        }

        setSession(data.session, data.session?.user ?? null);
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : 'Failed to restore session';
        setError(message);
      } finally {
        if (isMounted) {
          setInitialized(true);
        }
      }
    };
    void loadInitialSession();

    // 2. Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session, session?.user ?? null);

      // Invalidate all queries on auth change
      void queryClient.invalidateQueries();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setSession, setLoading, setError, setInitialized]);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AppProviders — root provider tree
// ─────────────────────────────────────────────────────────────────────────────

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const isInitialized = useAuthStore(selectIsInitialized);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>{isInitialized ? children : <AuthBootstrapSplash />}</SessionProvider>
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export { queryClient };

function AuthBootstrapSplash() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-surface-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-xs text-surface-400">Preparing your workspace...</p>
      </div>
    </div>
  );
}
