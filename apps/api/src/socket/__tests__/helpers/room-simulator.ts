import { TestClientPool, TestClientConfig } from './test-client-pool';
import { Socket } from 'socket.io-client';

export class RoomSimulator {
  public presenterPool: TestClientPool;
  public viewerPool: TestClientPool;

  constructor(
    private url: string,
    private deckId: string,
    private presenterToken: string,
    private viewerTokens: string[]
  ) {
    this.presenterPool = new TestClientPool({
      url,
      namespace: '/presenter',
      token: presenterToken,
    });
    
    this.viewerPool = new TestClientPool({
      url,
      namespace: '/collaboration',
      token: viewerTokens[0] || 'dummy',
    });
  }

  /**
   * Initializes a room with a presenter and a set number of viewers.
   */
  async setupRoom(viewerCount: number): Promise<{
    presenterSocket: Socket;
    presenterCollabSocket: Socket;
    viewerSockets: Socket[];
    viewerCollabSockets: Socket[];
    sessionId: string;
  }> {
    const presenterSocket = await this.presenterPool.createClient();
    
    // Presenter creates the session
    const sessionRes: any = await new Promise((resolve) => {
      presenterSocket.emit('session:create', { deckId: this.deckId, totalSlides: 10 }, resolve);
    });

    if (!sessionRes.ok) {
      throw new Error('Failed to create session: ' + sessionRes.error);
    }
    const sessionId = sessionRes.session.sessionId;

    // Viewers join presenter namespace
    const viewerSockets: Socket[] = [];
    const viewerCollabSockets: Socket[] = [];
    for (let i = 0; i < viewerCount; i++) {
      // Connect to presenter namespace
      const viewerPresenterPool = new TestClientPool({
        url: this.url,
        namespace: '/presenter',
        token: this.viewerTokens[i] || `viewer-token-${i}`,
      });
      const viewerPresSocket = await viewerPresenterPool.createClient();
      (viewerPresSocket as any).pool = viewerPresenterPool;
      
      const joinRes: any = await new Promise((resolve) => {
        viewerPresSocket.emit('session:join', { deckId: this.deckId }, resolve);
      });
      
      if (!joinRes.ok) {
        throw new Error('Viewer failed to join session: ' + joinRes.error);
      }
      viewerSockets.push(viewerPresSocket);
      // We attach the pool to keep it tracked
      (this as any).viewerPresenterPools = (this as any).viewerPresenterPools || [];
      (this as any).viewerPresenterPools.push(viewerPresenterPool);

      // Connect to collaboration namespace
      const viewerCollabPool = new TestClientPool({
        url: this.url,
        namespace: '/collaboration',
        token: this.viewerTokens[i] || `viewer-token-${i}`,
      });
      const viewerCollabSocket = await viewerCollabPool.createClient();
      (viewerCollabSocket as any).pool = viewerCollabPool;
      
      const collabJoinRes: any = await new Promise((resolve) => {
        viewerCollabSocket.emit('join_deck', { deckId: this.deckId, slideId: 'slide-0' }, resolve);
      });
      
      if (!collabJoinRes.ok) {
        throw new Error('Viewer failed to join deck collab: ' + collabJoinRes.error);
      }
      viewerCollabSockets.push(viewerCollabSocket);
      (this as any).viewerCollabPools = (this as any).viewerCollabPools || [];
      (this as any).viewerCollabPools.push(viewerCollabPool);
    }

    // Connect presenter to collaboration as well
    const presenterCollabPool = new TestClientPool({
      url: this.url,
      namespace: '/collaboration',
      token: this.presenterToken,
    });
    const presenterCollabSocket = await presenterCollabPool.createClient();
    (presenterCollabSocket as any).pool = presenterCollabPool;
    (presenterSocket as any).pool = this.presenterPool;
    await new Promise((resolve) => {
      presenterCollabSocket.emit('join_deck', { deckId: this.deckId, slideId: 'slide-0' }, resolve);
    });
    (this as any).presenterCollabPool = presenterCollabPool;

    return { 
      presenterSocket, 
      presenterCollabSocket, 
      viewerSockets, 
      viewerCollabSockets, 
      sessionId 
    };
  }

  cleanup() {
    this.presenterPool.disconnectAll();
    this.viewerPool.disconnectAll();
    if ((this as any).viewerPresenterPools) {
      for (const pool of (this as any).viewerPresenterPools) pool.disconnectAll();
    }
    if ((this as any).viewerCollabPools) {
      for (const pool of (this as any).viewerCollabPools) pool.disconnectAll();
    }
    if ((this as any).presenterCollabPool) {
      (this as any).presenterCollabPool.disconnectAll();
    }
  }
}
