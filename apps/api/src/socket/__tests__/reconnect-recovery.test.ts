import './setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { RoomSimulator } from './helpers/room-simulator';
import { ReconnectSimulator } from './helpers/reconnect-simulator';
import { EventRecorder } from './helpers/event-recorder';

describe('WebSocket: Reconnect & Recovery', () => {
  let server: TestServerInstance;
  
  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('restores state when a viewer reconnects', async () => {
    const sim = new RoomSimulator(server.url, 'deck-rec-1', 'presenter-rec-1', ['viewer-rec-1']);
    const { viewerSockets, sessionId } = await sim.setupRoom(1);
    let viewerSocket = viewerSockets[0];

    // Drop connection and reconnect
    viewerSocket = await ReconnectSimulator.simulateDropAndReconnect((viewerSocket as any).pool, viewerSocket, 100);
    
    // Attempt to join the same session/deck again
    const joinRes: any = await new Promise((resolve) => {
      viewerSocket.emit('session:join', { deckId: 'deck-rec-1' }, resolve);
    });

    // Validates that state is returned in the ack
    expect(joinRes.ok).toBe(true);
    expect(joinRes.session).toBeDefined();
    expect(joinRes.session.sessionId).toBe(sessionId);
    expect(joinRes.members.some((m: any) => m.userId === 'user-viewer-rec-1')).toBe(true);

    sim.cleanup();
  });
  
  it('triggers grace period when presenter drops', async () => {
    const sim = new RoomSimulator(server.url, 'deck-rec-2', 'presenter-rec-2', ['viewer-rec-2']);
    const { presenterSocket, viewerSockets } = await sim.setupRoom(1);
    const viewerSocket = viewerSockets[0];

    const viewerRecorder = new EventRecorder();
    viewerRecorder.attach(viewerSocket, ['presenter:disconnected', 'presenter:reconnected']);

    // Drop presenter connection
    const newPresenterSocket = await ReconnectSimulator.simulateDropAndReconnect((presenterSocket as any).pool, presenterSocket, 500);

    // Verify viewer got the disconnect warning
    const discEvent = await viewerRecorder.waitForEvent('presenter:disconnected');
    expect(discEvent).toBeDefined();

    // Rejoin presenter
    await new Promise((resolve) => {
      newPresenterSocket.emit('session:join', { deckId: 'deck-rec-2' }, resolve);
    });

    // Verify viewer got the reconnected event
    const reconEvent = await viewerRecorder.waitForEvent('presenter:reconnected');
    expect(reconEvent).toBeDefined();

    sim.cleanup();
  });
});
