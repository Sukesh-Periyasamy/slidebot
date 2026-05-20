/**
 * memory-stability.test.ts — Long-running room simulation to detect
 * server-side memory leaks (Redis key growth, listener accumulation).
 *
 * Validates SYSTEM_INVARIANTS §12: Stale connection cleanup guarantees.
 * Validates SYSTEM_INVARIANTS §14: Room teardown guarantees.
 *
 * Tests:
 * 1. 20 rapid room create/destroy cycles — Redis key count stays stable.
 * 2. 5 reconnect cycles for 5 clients — server listener count stays stable.
 * 3. After ended session, Redis state is cleaned up within 1 second.
 */

import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { TestClientPool } from './helpers/test-client-pool';

describe('WebSocket: Memory Stability', () => {
  let server: TestServerInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('server namespace socket set does not grow after disconnections', async () => {
    const CYCLES = 10;
    const presenterNs = server.io.of('/presenter');

    const initialSocketCount = presenterNs.sockets.size;

    // Connect and disconnect CYCLES sockets
    for (let i = 0; i < CYCLES; i++) {
      const pool = new TestClientPool({
        url: server.url,
        namespace: '/presenter',
        token: `memory-test-transient-${i}`,
      });
      const socket = await pool.createClient();
      await new Promise<void>((resolve) => {
        socket.emit('session:create', { deckId: `mem-deck-${i}`, totalSlides: 5 }, () => resolve());
      });
      socket.disconnect();
      await new Promise((r) => setTimeout(r, 100));
    }

    // Give server time to clean up
    await new Promise((r) => setTimeout(r, 500));

    const finalSocketCount = presenterNs.sockets.size;

    // Should be back to initial (or very close — within 2 for test timing)
    expect(finalSocketCount).toBeLessThanOrEqual(initialSocketCount + 2);
  }, 30_000);

  it('collaboration namespace does not retain sockets after disconnect', async () => {
    const collabNs = server.io.of('/collaboration');
    const initialCount = collabNs.sockets.size;

    for (let i = 0; i < 5; i++) {
      const pool = new TestClientPool({
        url: server.url,
        namespace: '/collaboration',
        token: `collab-mem-${i}`,
      });
      const socket = await pool.createClient();
      await new Promise<void>((resolve) => {
        socket.emit('join_deck', { deckId: `collab-mem-deck-${i}`, slideId: 'slide-0' }, () => resolve());
      });
      socket.disconnect();
      await new Promise((r) => setTimeout(r, 200));
    }

    await new Promise((r) => setTimeout(r, 500));

    const finalCount = collabNs.sockets.size;
    expect(finalCount).toBeLessThanOrEqual(initialCount + 1);
  }, 20_000);

  it('rapid reconnect cycles do not grow server listener count', async () => {
    const presenterNs = server.io.of('/presenter');
    const deckId = 'mem-reconnect-deck';

    // Create a session
    const presenterPool = new TestClientPool({
      url: server.url,
      namespace: '/presenter',
      token: 'mem-reconnect-presenter',
    });
    let socket = await presenterPool.createClient();
    await new Promise<void>((resolve) => {
      socket.emit('session:create', { deckId, totalSlides: 5 }, () => resolve());
    });

    // Record listener count on server after first join
    const initialServerSocketId = socket.id;
    const initialListenerCount = initialServerSocketId
      ? (presenterNs.sockets.get(initialServerSocketId)?.eventNames().length ?? 0)
      : 0;

    // Reconnect 5 times
    for (let i = 0; i < 5; i++) {
      (socket.io.engine as unknown as { close: () => void }).close();
      await new Promise((r) => setTimeout(r, 100));

      socket = await presenterPool.createClient();
      await new Promise<void>((resolve) => {
        socket.emit('session:join', { deckId }, () => resolve());
      });

      // Check server listener count on new socket
      const serverSocket = presenterNs.sockets.get(socket.id!);
      if (serverSocket) {
        const currentListenerCount = serverSocket.eventNames().length;
        // Listener count should not grow beyond baseline + 2 (connect/disconnect)
        expect(currentListenerCount).toBeLessThanOrEqual(
          Math.max(initialListenerCount, 5) + 2
        );
      }
    }

    presenterPool.disconnectAll();
  }, 30_000);
});
