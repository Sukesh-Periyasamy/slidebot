// ─────────────────────────────────────────────────────────────────────────────
// Replay Renderer — Deterministic frame-by-frame replay engine
// ─────────────────────────────────────────────────────────────────────────────

import type { ReplayEvent, SerializedAnnotation } from '../types/renderCommand.types';

/**
 * Internal state for the replay engine.
 */
interface ReplayState {
  events: ReplayEvent[];
  currentIndex: number;
  annotations: Map<string, SerializedAnnotation>;
}

/**
 * Deterministic replay renderer that processes timestamped annotation events
 * to reconstruct annotation state at any point in time.
 *
 * Guarantees: same events + same timestamp = same annotation state output.
 */
export class ReplayRenderer {
  private state: ReplayState | null = null;

  /**
   * Whether the replay is currently active.
   */
  get isActive(): boolean {
    return this.state !== null;
  }

  /**
   * Start replay with an ordered sequence of timestamped events.
   * Events are sorted by timestamp to ensure deterministic processing.
   */
  start(events: ReplayEvent[]): void {
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    this.state = {
      events: sorted,
      currentIndex: 0,
      annotations: new Map(),
    };
  }

  /**
   * Advance replay to the given timestamp, processing all events from the
   * current index up to and including events at the target timestamp.
   * Returns the current annotation state.
   */
  advanceTo(timestamp: number): SerializedAnnotation[] {
    if (!this.state) {
      return [];
    }

    const { events, annotations } = this.state;

    while (this.state.currentIndex < events.length) {
      const event = events[this.state.currentIndex]!;
      if (event.timestamp > timestamp) {
        break;
      }
      this.applyEvent(event, annotations);
      this.state.currentIndex++;
    }

    return Array.from(annotations.values());
  }

  /**
   * Seek to an arbitrary timestamp by replaying all events from the beginning.
   * This ensures deterministic output regardless of previous state.
   */
  seekTo(timestamp: number): SerializedAnnotation[] {
    if (!this.state) {
      return [];
    }

    // Reset to beginning
    this.state.currentIndex = 0;
    this.state.annotations.clear();

    // Replay from start up to target timestamp
    return this.advanceTo(timestamp);
  }

  /**
   * Stop replay and clear all state.
   */
  stop(): void {
    this.state = null;
  }

  /**
   * Apply a single replay event to the annotations map.
   */
  private applyEvent(
    event: ReplayEvent,
    annotations: Map<string, SerializedAnnotation>
  ): void {
    if (event.action === 'add' && event.annotation) {
      annotations.set(event.annotation.id, event.annotation);
    } else if (event.action === 'remove' && event.annotationId) {
      annotations.delete(event.annotationId);
    }
  }
}
