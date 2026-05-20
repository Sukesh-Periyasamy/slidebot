import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { RoomSimulator } from './helpers/room-simulator';
import { EventRecorder } from './helpers/event-recorder';

describe('WebSocket: Collaboration Sync & Concurrency', () => {
  let server: TestServerInstance;
  
  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('handles simultaneous annotations from 20 clients without dropping events', async () => {
    const NUM_CLIENTS = 20;
    const tokens = Array.from({ length: NUM_CLIENTS }).map((_, i) => `viewer-collab-${i}`);
    
    const sim = new RoomSimulator(server.url, 'deck-collab-1', 'presenter-collab-1', tokens);
    const { presenterCollabSocket, viewerCollabSockets } = await sim.setupRoom(NUM_CLIENTS);

    // Presenter records incoming annotations
    const presenterRecorder = new EventRecorder();
    presenterRecorder.attach(presenterCollabSocket, ['annotation_saved']);

    // Fire 1 annotation from all 20 viewers simultaneously
    const promises = viewerCollabSockets.map((socket, idx) => {
      return new Promise<void>((resolve) => {
        socket.emit('annotation_end', {
          slideId: 'slide-0',
          annotationId: `ann-${idx}`,
          tool: 'pen',
          color: '#000000',
          strokeWidth: 2,
          opacity: 1,
          data: { points: [[0,0], [10,10]] },
          isEphemeral: false,
        });
        resolve();
      });
    });

    await Promise.all(promises);

    // Wait until presenter receives all 20 annotations
    let received = 0;
    const start = Date.now();
    while (received < NUM_CLIENTS && Date.now() - start < 3000) {
      received = presenterRecorder.getEventsByName('annotation_saved').length;
      if (received < NUM_CLIENTS) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    expect(received).toBe(NUM_CLIENTS);

    sim.cleanup();
  }, 10000); // Allow extra time for heavy concurrency
});
