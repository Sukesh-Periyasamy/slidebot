/**
 * Controls quality reduction under load.
 * When mode is 'degraded', rendering quality is reduced to maintain responsiveness:
 * - Point smoothing is disabled
 * - Frame rate drops from 60fps to 30fps
 * - Point decimation is enabled
 * - Cache size is reduced from 500 to 100
 */
export class DegradationController {
  mode: 'normal' | 'degraded';

  constructor(mode: 'normal' | 'degraded' = 'normal') {
    this.mode = mode;
  }

  /** Whether point smoothing should be applied. False when degraded. */
  get smoothingEnabled(): boolean {
    return this.mode === 'normal';
  }

  /** Target frame interval in ms. 16.67ms (60fps) normal, 33.33ms (30fps) degraded. */
  get frameInterval(): number {
    return this.mode === 'normal' ? 1000 / 60 : 1000 / 30;
  }

  /** Whether to decimate points. True when degraded. */
  get decimatePoints(): boolean {
    return this.mode === 'degraded';
  }

  /** Max annotation cache size for current mode. 500 normal, 100 degraded. */
  get maxCacheSize(): number {
    return this.mode === 'normal' ? 500 : 100;
  }
}
