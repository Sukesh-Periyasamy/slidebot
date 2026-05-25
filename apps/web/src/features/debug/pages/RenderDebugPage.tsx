import { type ReactNode } from 'react';

export function RenderDebugPage() {
  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950 text-surface-200">
        <p className="text-sm">Render debug tools are only available in development.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 px-6 py-6 text-surface-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-brand-300">Debug</p>
          <h1 className="mt-2 text-3xl font-semibold">Render Profiler</h1>
          <p className="mt-2 max-w-3xl text-sm text-surface-400">
            Monitor React rendering performance and bounds.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="FPS" value="60" />
          <StatCard label="Active Stores" value="4" />
          <StatCard label="Canvas Nodes" value="120" />
        </section>
      </div>
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
