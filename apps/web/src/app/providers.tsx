import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/features/auth/store/authStore';

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
  const { setSession, setLoading } = useAuthStore();

  useEffect(() => {
    // 1. Load initial session (handles page refresh)
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session, data.session?.user ?? null);
    });

    // 2. Subscribe to auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session, session?.user ?? null);

      // Invalidate all queries on auth change
      void queryClient.invalidateQueries();
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AppProviders — root provider tree
// ─────────────────────────────────────────────────────────────────────────────

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export { queryClient };
