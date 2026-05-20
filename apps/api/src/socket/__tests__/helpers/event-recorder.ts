import { Socket } from 'socket.io-client';

export interface RecordedEvent {
  socketId: string;
  event: string;
  payload: any;
  timestamp: number;
}

export class EventRecorder {
  public events: RecordedEvent[] = [];

  /**
   * Start recording all events received by this socket
   */
  public attach(socket: Socket, eventsToWatch: string[]) {
    for (const event of eventsToWatch) {
      socket.on(event, (payload: any) => {
        this.events.push({
          socketId: socket.id || 'unknown',
          event,
          payload,
          timestamp: Date.now(),
        });
      });
    }
  }

  public clear() {
    this.events = [];
  }

  public getEventsByName(eventName: string): RecordedEvent[] {
    return this.events.filter((e) => e.event === eventName);
  }
  
  /**
   * Helper to wait for a specific event to occur.
   */
  public async waitForEvent(eventName: string, timeoutMs = 2000): Promise<RecordedEvent> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkInterval = setInterval(() => {
        const found = this.events.find(e => e.event === eventName);
        if (found) {
          clearInterval(checkInterval);
          resolve(found);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for event: ${eventName}`));
        }
      }, 50);
    });
  }
}
