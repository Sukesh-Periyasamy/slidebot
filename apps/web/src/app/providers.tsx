import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { supabase } from '@/lib/supabase';
import { recordRenderCount } from '@/features/debug/lib/renderInspector';
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
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setError = useAuthStore((s) => s.setError);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const lastSessionIdRef = useRef<string | null>(null);

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
        lastSessionIdRef.current = data.session?.user?.id ?? null;
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setSession(session, session?.user ?? null);

      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      const nextSessionId = session?.user?.id ?? null;
      if (nextSessionId !== lastSessionIdRef.current) {
        lastSessionIdRef.current = nextSessionId;
        void queryClient.invalidateQueries({ queryKey: ['rooms'] });
      }
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
  if (import.meta.env.DEV) {
    recordRenderCount('APP_RENDER');
    (window as typeof window & { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__ =
      queryClient;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>
          <AuthGate>{children}</AuthGate>
        </SessionProvider>
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export { queryClient };

function AuthGate({ children }: { children: ReactNode }) {
  const isInitialized = useAuthStore(selectIsInitialized);

  return isInitialized ? <>{children}</> : <AuthBootstrapSplash />;
}

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
