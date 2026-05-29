import { describe, it, expect } from 'vitest';
import { DegradationController } from '../degradationController';

describe('DegradationController', () => {
  describe('constructor', () => {
    it('defaults to normal mode', () => {
      const controller = new DegradationController();
      expect(controller.mode).toBe('normal');
    });

    it('accepts an initial mode', () => {
      const controller = new DegradationController('degraded');
      expect(controller.mode).toBe('degraded');
    });
  });

  describe('normal mode', () => {
    const controller = new DegradationController('normal');

    it('enables smoothing', () => {
      expect(controller.smoothingEnabled).toBe(true);
    });

    it('uses 60fps frame interval (~16.67ms)', () => {
      expect(controller.frameInterval).toBeCloseTo(1000 / 60, 5);
    });

    it('does not decimate points', () => {
      expect(controller.decimatePoints).toBe(false);
    });

    it('uses max cache size of 500', () => {
      expect(controller.maxCacheSize).toBe(500);
    });
  });

  describe('degraded mode', () => {
    const controller = new DegradationController('degraded');

    it('disables smoothing', () => {
      expect(controller.smoothingEnabled).toBe(false);
    });

    it('uses 30fps frame interval (~33.33ms)', () => {
      expect(controller.frameInterval).toBeCloseTo(1000 / 30, 5);
    });

    it('enables point decimation', () => {
      expect(controller.decimatePoints).toBe(true);
    });

    it('uses max cache size of 100', () => {
      expect(controller.maxCacheSize).toBe(100);
    });
  });

  describe('mode switching', () => {
    it('updates getters when mode changes from normal to degraded', () => {
      const controller = new DegradationController('normal');
      expect(controller.smoothingEnabled).toBe(true);
      expect(controller.maxCacheSize).toBe(500);

      controller.mode = 'degraded';
      expect(controller.smoothingEnabled).toBe(false);
      expect(controller.frameInterval).toBeCloseTo(1000 / 30, 5);
      expect(controller.decimatePoints).toBe(true);
      expect(controller.maxCacheSize).toBe(100);
    });

    it('updates getters when mode changes from degraded to normal', () => {
      const controller = new DegradationController('degraded');
      expect(controller.smoothingEnabled).toBe(false);
      expect(controller.maxCacheSize).toBe(100);

      controller.mode = 'normal';
      expect(controller.smoothingEnabled).toBe(true);
      expect(controller.frameInterval).toBeCloseTo(1000 / 60, 5);
      expect(controller.decimatePoints).toBe(false);
      expect(controller.maxCacheSize).toBe(500);
    });
  });
});
