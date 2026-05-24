import type { Socket } from 'socket.io';

export function assertSingleServerListener(socket: Socket, eventName: string, context: string): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const listeners = socket.listeners(eventName);
  if (listeners.length !== 1) {
    throw new Error(
      `[${context}] Expected exactly 1 listener for "${eventName}", found ${listeners.length}`
    );
  }
}
