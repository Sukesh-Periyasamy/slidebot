import type { SerializedAnnotation } from '../types/renderCommand.types';

/**
 * Bounded, insertion-order-preserving annotation cache for the render worker.
 * Stores committed annotations for the current slide, keyed by annotation ID.
 * Maintains insertion order for z-order rendering and enforces a maximum capacity
 * with oldest-eviction policy.
 */
export class WorkerAnnotationCache {
  private entries: Map<string, SerializedAnnotation>;
  private maxCapacity: number;

  constructor(maxCapacity: number = 500) {
    this.entries = new Map();
    this.maxCapacity = maxCapacity;
  }

  /**
   * Add or update an annotation. If the annotation already exists, it is
   * deleted and re-inserted at the end to maintain correct insertion order
   * (updated annotation moves to top of z-order). Evicts the oldest entry
   * when at capacity.
   */
  set(annotation: SerializedAnnotation): void {
    // If updating an existing entry, remove it first so re-insertion
    // places it at the end (top z-order)
    if (this.entries.has(annotation.id)) {
      this.entries.delete(annotation.id);
    }

    // Evict oldest (first in iteration order) if at capacity
    if (this.entries.size >= this.maxCapacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(annotation.id, annotation);
  }

  /** Remove an annotation by ID. Returns true if the annotation existed. */
  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  /** Get an annotation by ID. */
  get(id: string): SerializedAnnotation | undefined {
    return this.entries.get(id);
  }

  /** Iterate in insertion order (z-order). */
  values(): IterableIterator<SerializedAnnotation> {
    return this.entries.values();
  }

  /** Current number of cached annotations. */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Update max capacity (for degradation mode transitions).
   * If the new capacity is lower than the current size, evicts oldest
   * entries until size <= new capacity.
   */
  setMaxCapacity(capacity: number): void {
    this.maxCapacity = capacity;

    // Evict oldest entries if current size exceeds new capacity
    while (this.entries.size > this.maxCapacity) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      } else {
        break;
      }
    }
  }
}
