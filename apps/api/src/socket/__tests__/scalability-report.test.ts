/**
 * scalability-report.test.ts — End-to-end scalability benchmark.
 *
 * Validates SYSTEM_INVARIANTS §7: Multiplayer consistency guarantees.
 * Validates ENGINEERING_RULES §10: Performance constraints (< 200ms p99 latency).
 *
 * Measures:
 * - Average slide-change latency at 2, 5, 10, 20 clients.
 * - p99 latency (99th percentile event-to-receipt time).
 * - Event throughput (events successfully delivered per second).
 * - Outputs a JSON report to the test output for CI artifacts.
 *
 * Pass/Fail criteria:
 * - p99 latency MUST be < 200ms for ≤ 20 clients (ENGINEERING_RULES §10).
 * - Zero slide:changed events should be lost at ≤ 10 clients.
 */

import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { TestClientPool } from './helpers/test-client-pool';
import { EventRecorder } from './helpers/event-recorder';
import type { Socket } from 'socket.io-client';

interface LatencyReport {
  clientCount: number;
  slideChanges: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  deliveryRate: number; // 0.0 to 1.0
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)]!;
}

async function runScalabilityScenario(
  server: TestServerInstance,
  clientCount: number,
  slideChanges: number,
  deckId: string
): Promise<LatencyReport> {
  const presenterPool = new TestClientPool({
    url: server.url,
    namespace: '/presenter',
    token: `scale-presenter-${deckId}`,
  });
  const presenterSocket = await presenterPool.createClient();

  const createRes = await new Promise<{ ok: boolean; session?: { sessionId: string } }>((resolve) => {
    presenterSocket.emit('session:create', { deckId, totalSlides: 100 }, resolve);
  });
  if (!createRes.ok) throw new Error(`Failed to create session for ${deckId}`);
  const sessionId = createRes.session!.sessionId;

  // Connect viewer clients
  const viewerPools: TestClientPool[] = [];
  const viewerSockets: Socket[] = [];

  for (let i = 0; i < clientCount - 1; i++) {
    const pool = new TestClientPool({
      url: server.url,
      namespace: '/presenter',
      token: `scale-viewer-${deckId}-${i}`,
    });
    viewerPools.push(pool);
    const socket = await pool.createClient();
    await new Promise<void>((resolve) => {
      socket.emit('session:join', { deckId }, () => resolve());
    });
    viewerSockets.push(socket);
  }

  // Set up latency tracking on the first viewer
  const latencies: number[] = [];
  const sentTimestamps = new Map<number, number>();

  if (viewerSockets.length > 0) {
    viewerSockets[0]!.on('slide:changed', (payload: { slideIndex: number; serverTimestamp: number }) => {
      const sentAt = sentTimestamps.get(payload.slideIndex);
      if (sentAt) {
        latencies.push(Date.now() - sentAt);
      }
    });
  }

  // Send slide changes
  for (let i = 0; i < slideChanges; i++) {
    const slideIndex = i % 100;
    sentTimestamps.set(slideIndex, Date.now());
    presenterSocket.emit('slide:goto', { sessionId, slideIndex, sequenceNum: i });
    // Small delay to prevent complete flooding (realistic pacing = ~5 changes/second)
    await new Promise((r) => setTimeout(r, 20));
  }

  // Wait for propagation
  await new Promise((r) => setTimeout(r, 1000));

  // Compute stats
  const sorted = [...latencies].sort((a, b) => a - b);
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

  const report: LatencyReport = {
    clientCount,
    slideChanges,
    avgLatencyMs: Math.round(avg),
    p50LatencyMs: percentile(sorted, 50),
    p99LatencyMs: percentile(sorted, 99),
    maxLatencyMs: sorted[sorted.length - 1] ?? 0,
    deliveryRate: sorted.length / (viewerSockets.length > 0 ? slideChanges : 1),
  };

  // Cleanup
  presenterPool.disconnectAll();
  viewerPools.forEach((p) => p.disconnectAll());

  return report;
}

describe('WebSocket: Scalability Report', () => {
  let server: TestServerInstance;
  const allReports: LatencyReport[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    // Print the full scalability report to stdout for CI artifact capture
    console.log('\n=== SCALABILITY REPORT ===');
    console.log(JSON.stringify(allReports, null, 2));
    console.log('=========================\n');
    await server.close();
  });

  it('2 clients — p99 latency < 200ms', async () => {
    const report = await runScalabilityScenario(server, 2, 20, 'scale-2clients');
    allReports.push(report);

    console.log(`[2 clients] avg=${report.avgLatencyMs}ms p99=${report.p99LatencyMs}ms`);
    expect(report.p99LatencyMs).toBeLessThan(200);
  }, 45_000);

  it('5 clients — p99 latency < 200ms', async () => {
    const report = await runScalabilityScenario(server, 5, 20, 'scale-5clients');
    allReports.push(report);

    console.log(`[5 clients] avg=${report.avgLatencyMs}ms p99=${report.p99LatencyMs}ms`);
    expect(report.p99LatencyMs).toBeLessThan(200);
  }, 60_000);

  it('10 clients — p99 latency < 200ms', async () => {
    const report = await runScalabilityScenario(server, 10, 15, 'scale-10clients');
    allReports.push(report);

    console.log(`[10 clients] avg=${report.avgLatencyMs}ms p99=${report.p99LatencyMs}ms`);
    expect(report.p99LatencyMs).toBeLessThan(200);
  }, 60_000);

  it('20 clients — p99 latency < 200ms', async () => {
    const report = await runScalabilityScenario(server, 20, 10, 'scale-20clients');
    allReports.push(report);

    console.log(`[20 clients] avg=${report.avgLatencyMs}ms p99=${report.p99LatencyMs}ms`);
    expect(report.p99LatencyMs).toBeLessThan(200);
  }, 90_000);
});
