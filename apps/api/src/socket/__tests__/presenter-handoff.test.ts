import './setup';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestServer, TestServerInstance } from './helpers/test-server';
import { RoomSimulator } from './helpers/room-simulator';
import { EventRecorder } from './helpers/event-recorder';

describe('WebSocket: Presenter Handoff & Switching', () => {
  let server: TestServerInstance;
  
  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('allows presenter to handoff to a viewer', async () => {
    const sim = new RoomSimulator(server.url, 'deck-1', 'presenter-1', ['viewer-1']);
    const { presenterSocket, viewerSockets, sessionId } = await sim.setupRoom(1);
    const viewerSocket = viewerSockets[0]!;

    const viewerRecorder = new EventRecorder();
    viewerRecorder.attach(viewerSocket, ['presenter:changed']);

    // Presenter hands off to viewer
    presenterSocket.emit('presenter:handoff', {
      sessionId,
      toUserId: 'user-viewer-1',
      toUserName: 'User viewer-1',
    });

    const event = await viewerRecorder.waitForEvent('presenter:changed');
    expect(event).toBeDefined();
    expect(event.payload.newPresenterId).toBe('user-viewer-1');
    expect(event.payload.previousPresenterId).toBe('user-presenter-1');

    sim.cleanup();
  });

  it('rejects slide changes from non-presenters after handoff', async () => {
    const sim = new RoomSimulator(server.url, 'deck-2', 'presenter-2', ['viewer-2']);
    const { presenterSocket, viewerSockets, sessionId } = await sim.setupRoom(1);
    const viewerSocket = viewerSockets[0]!;

    const presenterRecorder = new EventRecorder();
    presenterRecorder.attach(presenterSocket, ['error']);

    // Hand off to viewer
    presenterSocket.emit('presenter:handoff', {
      sessionId,
      toUserId: 'user-viewer-2',
      toUserName: 'User viewer-2',
    });

    // Wait a tiny bit for the handoff to propagate in Redis
    await new Promise(r => setTimeout(r, 100));

    // Old presenter tries to change slide
    presenterSocket.emit('slide:goto', {
      sessionId,
      slideIndex: 5,
      sequenceNum: 1
    });

    const errorEvent = await presenterRecorder.waitForEvent('error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.payload.code).toBe('FORBIDDEN');
    expect(errorEvent.payload.message).toContain('Only the presenter');

    sim.cleanup();
  });
});
