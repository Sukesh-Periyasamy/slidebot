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
    (socket.io.engine as any).close();
    
    // 2. Wait
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    
    // 3. Reconnect (force new instance to bypass io client reconnection logic for tests)
    const newSocket = await pool.createClient();
    return newSocket;
  }
}
