import type { Socket } from 'socket.io-client';

export function assertSingleSocketListener(
  socket: Socket,
  eventName: string,
  context: string
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const listeners = (socket as unknown as { listeners: (event: string) => unknown[] }).listeners(
    eventName
  );

  if (listeners.length !== 1) {
    throw new Error(
      `[${context}] Expected exactly 1 listener for "${eventName}", found ${listeners.length}`
    );
  }
}
