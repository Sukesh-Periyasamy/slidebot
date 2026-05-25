import { io, Socket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';

export interface TestClientConfig {
  url: string;
  namespace: string;
  token: string;
}

export class TestClientPool {
  private clients: Socket[] = [];

  constructor(private config: TestClientConfig) {}

  /**
   * Creates and connects a new Socket.IO client
   */
  async createClient(): Promise<Socket> {
    const socket = io(`${this.config.url}${this.config.namespace}`, {
      auth: { token: this.config.token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false, // tests should manually handle reconnects if needed
      parser: customParser,
    });

    this.clients.push(socket);

    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
      
      // timeout
      setTimeout(() => reject(new Error('Socket connect timeout')), 3000);
    });
  }

  /**
   * Creates multiple clients concurrently
   */
  async createClients(count: number): Promise<Socket[]> {
    const promises = Array.from({ length: count }).map(() => this.createClient());
    return Promise.all(promises);
  }

  /**
   * Disconnects all clients in the pool
   */
  disconnectAll() {
    for (const socket of this.clients) {
      if (socket.connected) {
        socket.disconnect();
      }
    }
    this.clients = [];
  }
}
