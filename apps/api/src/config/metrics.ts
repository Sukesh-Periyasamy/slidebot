import { INSTANCE_ID } from '../socket/instance-manager';

export class MetricsRegistry {
  private counters = new Map<string, number>();

  inc(key: string, val = 1) {
    this.counters.set(key, (this.counters.get(key) || 0) + val);
  }

  get(key: string) {
    return this.counters.get(key) || 0;
  }

  set(key: string, val: number) {
    this.counters.set(key, val);
  }

  toJSON() {
    return {
      instance_id: INSTANCE_ID,
      metrics: Object.fromEntries(this.counters),
    };
  }
}

export const metrics = new MetricsRegistry();
