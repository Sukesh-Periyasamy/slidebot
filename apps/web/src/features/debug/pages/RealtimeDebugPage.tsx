import { useEffect, type ReactNode } from 'react';
import { useRealtimeDebugStore } from '../store/realtimeDebugStore';

export function RealtimeDebugPage() {
  const metrics = useRealtimeDebugStore((state) => state.metrics);

  if (!import.meta.env.DEV) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950 text-surface-200">
        <p className="text-sm">Realtime debug tools are only available in development.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 px-6 py-6 text-surface-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-brand-300">Debug</p>
          <h1 className="mt-2 text-3xl font-semibold">Realtime Telemetry</h1>
          <p className="mt-2 max-w-3xl text-sm text-surface-400">
            Monitor real-time socket performance, payload sizes, and backpressure drops.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Socket Status" value={metrics.socketStatus} />
          <StatCard label="Ping" value={`${metrics.lastPingMs} ms`} />
          <StatCard label="Dropped Events" value={String(metrics.droppedPackets)} />
          <StatCard label="Replay Queue" value={String(metrics.replayQueueDepth)} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Data Sent">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-surface-500">Bytes Sent</p>
                <p className="text-xl font-semibold">{metrics.bytesSent}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Events Sent</p>
                <p className="text-xl font-semibold">{metrics.eventsSent}</p>
              </div>
            </div>
          </Panel>

          <Panel title="Data Received">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-surface-500">Bytes Received</p>
                <p className="text-xl font-semibold">{metrics.bytesReceived}</p>
              </div>
              <div>
                <p className="text-xs text-surface-500">Events Received</p>
                <p className="text-xl font-semibold">{metrics.eventsReceived}</p>
              </div>
            </div>
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
      <div className="mt-4">{children}</div>
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
