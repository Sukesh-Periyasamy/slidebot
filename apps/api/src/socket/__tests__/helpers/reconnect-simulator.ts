import { Socket } from 'socket.io-client';
import { TestClientPool } from './test-client-pool';

export class ReconnectSimulator {
  /**
   * Simulates a dropped connection (e.g. network failure) by forcefully closing
   * the socket without sending a polite disconnect event, then reconnects after a delay.
   * Note: With Socket.IO, `socket.disconnect()` sends a packet. We simulate dropped
   * by destroying the underlying engine connection.
   */
  static async simulateDropAndReconnect(
    pool: TestClientPool,
    socket: Socket,
    delayMs = 1000
  ): Promise<Socket> {
    // 1. Force drop
    (socket.io.engine as unknown as { close: () => void }).close();
    
    // 2. Wait
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    
    // 3. Reconnect (force new instance to bypass io client reconnection logic for tests)
    const newSocket = await pool.createClient();
    return newSocket;
  }

  /**
   * Simulates a "reconnect storm" — multiple clients simultaneously dropping
   * and reconnecting with optional stagger to prevent thundering-herd.
   *
   * @param pools - Array of pools, one per client.
   * @param sockets - Array of current sockets corresponding to each pool.
   * @param staggerMs - Milliseconds to stagger between each client drop (0 = simultaneous).
   * @returns Array of new sockets, in same order as input.
   */
  static async simulateStorm(
    pools: TestClientPool[],
    sockets: Socket[],
    staggerMs = 0
  ): Promise<Socket[]> {
    const results: Promise<Socket>[] = [];

    for (let i = 0; i < sockets.length; i++) {
      const pool = pools[i]!;
      const socket = sockets[i]!;

      // Stagger drops if requested
      if (staggerMs > 0 && i > 0) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }

      // Force drop immediately (non-blocking — collect promises)
      results.push(
        (async () => {
          (socket.io.engine as unknown as { close: () => void }).close();
          await new Promise((r) => setTimeout(r, 50)); // small delay before reconnect
          return pool.createClient();
        })()
      );
    }

    return Promise.all(results);
  }
}
