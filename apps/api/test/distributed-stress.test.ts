import './src/socket/__tests__/setup';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';
import customParser from 'socket.io-msgpack-parser';
import { createTestServer, TestServerInstance } from './src/socket/__tests__/helpers/test-server';

// This test focuses on the Socket.io binary transport and connection limits
describe('Distributed Stress & Resiliency', () => {
  let server: TestServerInstance;
  let sockets: ClientSocket[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    sockets.forEach((s) => {
      if (s.connected) {
        s.disconnect();
      }
    });
    await server.close();
  });

  it('should handle simultaneous connections and binary msgpack parsing', async () => {
    const BATCH_SIZE = 10;
    let connectedCount = 0;
    
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
      
      for (let i = 0; i < BATCH_SIZE; i++) {
        const socket = Client(`${server.url}/collaboration`, {
          auth: { token: `dist-stress-test-${i}` },
          parser: customParser,
          transports: ['websocket'],
          reconnection: false
        });
        
        socket.on('connect', () => {
          connectedCount++;
          if (connectedCount === BATCH_SIZE) {
            clearTimeout(timeout);
            resolve();
          }
        });
        
        socket.on('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        
        sockets.push(socket);
      }
    });

    expect(connectedCount).toBe(BATCH_SIZE);
  });
});
