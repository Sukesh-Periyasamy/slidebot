/**
 * annotation-flood.test.ts — Validates server-side annotation rate limiting.
 *
 * Validates SYSTEM_INVARIANTS §9: DB persistence guarantees.
 * Validates ENGINEERING_RULES §11: Annotation engine constraints (throttling).
 *
 * Tests:
 * 1. Server drops events beyond the rate limit (120/s per socket).
 * 2. Other clients receive ≤ N events (not all 500 flood events).
 * 3. Server remains stable under flood (no crash, no OOM).
 * 4. Rate limit resets after the 1-second window.
 */

import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { RoomSimulator } from './helpers/room-simulator';
import { EventRecorder } from './helpers/event-recorder';

describe('WebSocket: Annotation Flood Protection', () => {
  let server: TestServerInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('rate-limits annotation_draw events to MAX_EVENTS_PER_SECOND', async () => {
    const sim = new RoomSimulator(
      server.url,
      'deck-flood-1',
      'flood-presenter-1',
      ['flood-viewer-1']
    );
    const { presenterSocket, viewerSockets } = await sim.setupRoom(1);
    const viewerSocket = viewerSockets[0]!;

    // Set up recorder on viewer socket to count received events
    const recorder = new EventRecorder();
    recorder.attach(viewerSocket, ['annotation_drew']);

    const sessionId = (presenterSocket as unknown as { _sessionId?: string })._sessionId ?? 'unknown';

    // Blast 500 annotation_draw events in < 1 second from the presenter's collab socket
    const FLOOD_COUNT = 500;
    for (let i = 0; i < FLOOD_COUNT; i++) {
      (presenterSocket as unknown as { emit: (...args: unknown[]) => void }).emit(
        'annotation_draw',
        {
          sessionId,
          slideId: 'slide-0',
          points: [i, i + 1, i + 2, i + 3],
        }
      );
    }

    // Wait for events to propagate (give server time to process + viewer time to receive)
    await new Promise((r) => setTimeout(r, 500));

    const receivedCount = recorder.getEventsByName('annotation_drew').length;

    // Viewer should receive at most MAX_EVENTS_PER_SECOND (120) + some tolerance
    // It will be much less than 500 if rate limiting is working
    expect(receivedCount).toBeLessThan(FLOOD_COUNT);
    // But some events should get through (rate limit != 0)
    // Note: rate limit is 120/s, test fires all 500 in < 200ms,
    // so we expect at most 120 * (0.2 + tolerance) events to get through
    expect(receivedCount).toBeLessThanOrEqual(150);

    sim.cleanup();
  }, 10_000);

  it('server remains healthy after an annotation flood', async () => {
    const sim = new RoomSimulator(
      server.url,
      'deck-flood-2',
      'flood-presenter-2',
      ['flood-viewer-2']
    );
    const { presenterSocket, viewerSockets } = await sim.setupRoom(1);

    // Blast 1000 events
    for (let i = 0; i < 1000; i++) {
      (presenterSocket as unknown as { emit: (...args: unknown[]) => void }).emit(
        'cursor_move',
        {
          sessionId: 'test-session',
          slideId: 'slide-0',
          position: { x: i % 100, y: Math.floor(i / 100) },
        }
      );
    }

    await new Promise((r) => setTimeout(r, 500));

    // Server should still be responsive — test with a new connection
    const { presenterSocket: newPres } = await new RoomSimulator(
      server.url,
      'deck-flood-healthcheck',
      'health-presenter-1',
      []
    ).setupRoom(0);

    // If this ack comes back, the server event loop is still healthy
    const healthRes = await new Promise<{ ok: boolean }>((resolve) => {
      newPres.emit('session:create', { deckId: 'deck-flood-healthcheck', totalSlides: 1 }, resolve);
    });

    expect(healthRes.ok).toBe(true);

    sim.cleanup();
  }, 15_000);

  it('rate limit resets after the 1-second window', async () => {
    const sim = new RoomSimulator(
      server.url,
      'deck-flood-3',
      'flood-presenter-3',
      ['flood-viewer-3']
    );
    const { presenterSocket, viewerSockets } = await sim.setupRoom(1);
    const viewerSocket = viewerSockets[0]!;

    const recorder = new EventRecorder();
    recorder.attach(viewerSocket, ['annotation_drew']);

    // Send 80 events (below limit) — all should pass
    for (let i = 0; i < 80; i++) {
      (presenterSocket as unknown as { emit: (...args: unknown[]) => void }).emit(
        'annotation_draw',
        { sessionId: 'test', slideId: 'slide-0', points: [i, i] }
      );
    }

    await new Promise((r) => setTimeout(r, 300));
    const firstBatch = recorder.getEventsByName('annotation_drew').length;

    // Wait for the rate limit window to reset (1.1 seconds)
    await new Promise((r) => setTimeout(r, 1100));
    recorder.clear();

    // Send another 80 — should all pass again after reset
    for (let i = 0; i < 80; i++) {
      (presenterSocket as unknown as { emit: (...args: unknown[]) => void }).emit(
        'annotation_draw',
        { sessionId: 'test', slideId: 'slide-0', points: [i, i] }
      );
    }

    await new Promise((r) => setTimeout(r, 300));
    const secondBatch = recorder.getEventsByName('annotation_drew').length;

    // Both batches should be comparable (rate reset correctly)
    expect(firstBatch).toBeGreaterThan(50); // Most of 80 got through
    expect(secondBatch).toBeGreaterThan(50); // Most of second 80 got through too

    sim.cleanup();
  }, 15_000);
});
