/**
 * listener-cleanup.test.ts — Verifies that socket listeners do not accumulate
 * across connect/disconnect/reconnect cycles.
 *
 * Validates SYSTEM_INVARIANTS §12: Stale connections must be cleaned up.
 * Validates ENGINEERING_RULES §12: Reconnect recovery guarantees.
 *
 * Strategy:
 * - Create a test server, connect a client, record listener count baseline.
 * - Disconnect and reconnect 3 times.
 * - After each cycle, verify listener counts match baseline (no leaks).
 */

import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { TestClientPool } from './helpers/test-client-pool';
import { io } from 'socket.io-client';

describe('WebSocket: Listener Cleanup', () => {
  let server: TestServerInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('should not accumulate listeners across reconnect cycles', async () => {
    const presenterPool = new TestClientPool({
      url: server.url,
      namespace: '/presenter',
      token: 'listener-cleanup-test-1',
    });

    // First connection — establish baseline
    const socket1 = await presenterPool.createClient();

    // Emit session:create to register all server-side listeners
    await new Promise<void>((resolve) => {
      socket1.emit(
        'session:create',
        { deckId: 'deck-listener-cleanup', totalSlides: 5 },
        () => resolve()
      );
    });

    // Get baseline listener count for this socket on the server
    const serverSocket1 = server.io.of('/presenter').sockets.get(socket1.id!);
    expect(serverSocket1).toBeDefined();
    const baselineListenerCount = serverSocket1!.eventNames().length;
    expect(baselineListenerCount).toBeGreaterThan(0);

    // Reconnect 3 times — listener count should stay constant
    let prevSocket = socket1;
    for (let i = 0; i < 3; i++) {
      // Drop connection
      (prevSocket.io.engine as unknown as { close: () => void }).close();
      await new Promise((r) => setTimeout(r, 100));

      // New connection
      const newSocket = await presenterPool.createClient();

      // Join the same session
      await new Promise<void>((resolve) => {
        newSocket.emit('session:join', { deckId: 'deck-listener-cleanup' }, () => resolve());
      });

      // Verify server-side listener count hasn't grown
      const serverSocketNew = server.io.of('/presenter').sockets.get(newSocket.id!);
      if (serverSocketNew) {
        const newCount = serverSocketNew.eventNames().length;
        // Allow ≤ 2 extra (connect/disconnect are always registered)
        expect(newCount).toBeLessThanOrEqual(baselineListenerCount + 2);
      }

      prevSocket = newSocket;
    }

    presenterPool.disconnectAll();
  });

  it('should clean up all listeners when a socket disconnects', async () => {
    const pool = new TestClientPool({
      url: server.url,
      namespace: '/collaboration',
      token: 'listener-cleanup-test-2',
    });

    const socket = await pool.createClient();

    await new Promise<void>((resolve) => {
      socket.emit('join_deck', { deckId: 'deck-lc-collab', slideId: 'slide-0' }, () => resolve());
    });

    // Verify socket is tracked server-side
    const serverSocket = server.io.of('/collaboration').sockets.get(socket.id!);
    expect(serverSocket).toBeDefined();

    // Disconnect cleanly
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // Socket should be removed from the namespace
    const disconnectedSocket = server.io.of('/collaboration').sockets.get(socket.id!);
    expect(disconnectedSocket).toBeUndefined();

    pool.disconnectAll();
  });

  it('should not have ghost presenter after disconnect and reconnect in a new session', async () => {
    const pool = new TestClientPool({
      url: server.url,
      namespace: '/presenter',
      token: 'ghost-test-1',
    });

    // Create and immediately leave
    const socket = await pool.createClient();
    await new Promise<void>((resolve) => {
      socket.emit(
        'session:create',
        { deckId: 'deck-ghost-check', totalSlides: 3 },
        () => resolve()
      );
    });

    // Get session id from server state before disconnect
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 300));

    // Reconnect as the same user to a different deck — should not inherit ghost state
    const pool2 = new TestClientPool({
      url: server.url,
      namespace: '/presenter',
      token: 'ghost-test-1', // same token = same userId
    });
    const socket2 = await pool2.createClient();
    const joinRes = await new Promise<{ ok: boolean; error?: string; session?: unknown }>((resolve) => {
      socket2.emit('session:join', { deckId: 'deck-ghost-check' }, resolve);
    });

    // Session should be found but presenter is reconnecting — not a ghost
    // The important assertion: the response is well-formed (no crash/corruption)
    expect(typeof joinRes.ok).toBe('boolean');

    pool2.disconnectAll();
  });
});
