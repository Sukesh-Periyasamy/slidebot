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
    // In dev, log listener details to help track duplicates instead of
    // immediately throwing — this aids diagnosis while preserving app
    // stability during investigation.
    // eslint-disable-next-line no-console
    console.warn(`[${context}] Expected exactly 1 listener for "${eventName}", found ${listeners.length}`);
    try {
      const details = listeners.map((l, i) => {
        try {
          const fnName = (l as any).name || '<anonymous>';
          const src = (l as any).toString?.().slice(0, 200) ?? '<no-src>';
          return { index: i, name: fnName, src };
        } catch (err) {
          return { index: i, name: '<unknown>', src: '<toString() failed>' };
        }
      });
      // eslint-disable-next-line no-console
      console.warn('[listener:details]', { event: eventName, context, details });
    } catch (err) {
      /* ignore */
    }
  }
}
