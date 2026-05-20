import http from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { createApp } from '../../../app';
import { initializeSocket } from '../../index';

export interface TestServerInstance {
  httpServer: http.Server;
  io: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function createTestServer(): Promise<TestServerInstance> {
  const app = createApp();
  const httpServer = http.createServer(app);
  
  // initialize socket with standard redis (it will be mocked by ioredis-mock via vitest in the test file)
  const io = initializeSocket(httpServer);

  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const port = (httpServer.address() as AddressInfo).port;
      const url = `http://localhost:${port}`;
      
      resolve({
        httpServer,
        io,
        port,
        url,
        close: () => {
          return new Promise<void>((res) => {
            io.close(() => {
              httpServer.close(() => res());
            });
          });
        }
      });
    });
  });
}
