/**
 * collaboration-stress.test.ts — Validates system stability under extreme
 * load from Phase 3 collaboration features.
 *
 * Tests:
 * 1. Blast thousands of reactions, hand raises, and comments simultaneously.
 * 2. Verify server does not crash or OOM.
 */

import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { RoomSimulator } from './helpers/room-simulator';

describe('WebSocket: Collaboration Stress Testing', () => {
  let server: TestServerInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('server remains healthy under extreme collaboration flood', async () => {
    const sim = new RoomSimulator(
      server.url,
      'deck-collab-stress',
      'stress-presenter',
      ['stress-viewer-1', 'stress-viewer-2']
    );
    const { presenterCollabSocket, viewerCollabSockets } = await sim.setupRoom(2);

    const sessionId = (presenterCollabSocket as any)._sessionId ?? 'unknown';

    // Blast 1000 events of different types
    const FLOOD_COUNT = 1000;
    
    // Viewer 1 spamming hand raises
    for (let i = 0; i < FLOOD_COUNT / 2; i++) {
      (viewerCollabSockets[0] as any).emit('hand_raise', {
        roomId: 'deck:deck-collab-stress'
      });
      (viewerCollabSockets[0] as any).emit('hand_lower', {
        roomId: 'deck:deck-collab-stress'
      });
    }

    // Viewer 2 spamming reactions
    for (let i = 0; i < FLOOD_COUNT; i++) {
      (viewerCollabSockets[1] as any).emit('reaction_send', {
        roomId: 'deck:deck-collab-stress',
        emoji: '🔥'
      });
    }

    await new Promise((r) => setTimeout(r, 500));

    // Server should still be responsive — test with a new connection
    const { presenterSocket: newPres } = await new RoomSimulator(
      server.url,
      'deck-stress-check',
      'stress-checker',
      []
    ).setupRoom(0);

    const res = await new Promise<{ ok: boolean }>((resolve) => {
      newPres.emit('session:create', { deckId: 'deck-stress-check', totalSlides: 1 }, resolve);
    });

    expect(res.ok).toBe(true);

    sim.cleanup();
  }, 10_000);
});
