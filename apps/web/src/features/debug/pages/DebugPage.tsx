import { useEffect, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useDebugStore } from '../store/debugStore';

export function DebugPage() {
  const debug = useDebugStore(
    useShallow((state) => ({
      updatedAt: state.updatedAt,
      renderCounts: state.renderCounts,
      listeners: state.listeners,
      sockets: state.sockets,
      presenceCount: state.presenceCount,
      cursorCount: state.cursorCount,
      refresh: state.refresh,
    }))
  );

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    debug.refresh();
    const interval = window.setInterval(() => debug.refresh(), 1000);
    return () => window.clearInterval(interval);
  }, [debug]);

  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950 text-surface-200">
        <p className="text-sm">Debug tools are only available in development.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 px-6 py-6 text-surface-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-brand-300">Debug</p>
          <h1 className="mt-2 text-3xl font-semibold">Live runtime inspector</h1>
          <p className="mt-2 max-w-3xl text-sm text-surface-400">
            Development-only instrumentation for sockets, listeners, render counters, and collaborative state.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Presence participants" value={String(debug.presenceCount)} />
          <StatCard label="Live cursors" value={String(debug.cursorCount)} />
          <StatCard label="Socket status" value={debug.sockets.status} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Socket Inspector">
            <pre className="overflow-auto text-xs text-surface-300">{JSON.stringify(debug.sockets, null, 2)}</pre>
          </Panel>

          <Panel title="Render Waterfall">
            <pre className="overflow-auto text-xs text-surface-300">{JSON.stringify(debug.renderCounts, null, 2)}</pre>
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Listener Counts">
            <pre className="overflow-auto text-xs text-surface-300">{JSON.stringify(debug.listeners, null, 2)}</pre>
          </Panel>

          <Panel title="Last Refresh">
            <p className="text-sm text-surface-300">{debug.updatedAt ? new Date(debug.updatedAt).toLocaleTimeString() : 'pending'}</p>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-4 shadow-xl shadow-black/20">
      <h2 className="text-sm font-semibold text-surface-100">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900/70 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-surface-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-surface-50">{value}</p>
    </div>
  );
}
