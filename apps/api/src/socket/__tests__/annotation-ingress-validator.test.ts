/**
 * annotation-ingress-validator.test.ts
 *
 * Tests for server-side annotation packet validation:
 * - Schema validation (malformed payloads rejected)
 * - Duplicate packet detection
 * - Ownership consistency check (userId spoofing)
 * - Schema version validation
 * - Sequence ID validation
 * - DEV counter tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger before import
vi.mock('../../config/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Also set NODE_ENV for test isolation
process.env.NODE_ENV = 'test';

import {
  validateAnnotationEvent,
  createSocketDedupe,
  resetAnnotationIngressMetrics,
  getAnnotationIngressMetrics,
} from '../annotation-ingress-validator';


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_PAYLOAD = {
  eventId: 'test-event-1',
  seq: 1,
  causalTs: 1000,
  roomId: 'room-abc',
  slideIndex: 0,
  userId: 'user-123',
  schemaVersion: 'v1',
  type: 'stroke:chunk',
  payload: { data: 'stroke data' },
  ts: 1000,
};

function makePayload(overrides: Record<string, unknown> = {}) {
  return { ...VALID_PAYLOAD, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('validateAnnotationEvent', () => {
  let dedupe: ReturnType<typeof createSocketDedupe>;

  beforeEach(() => {
    dedupe = createSocketDedupe();
    resetAnnotationIngressMetrics();
  });

  // ── Valid payloads ────────────────────────────────────────────────────────

  it('accepts a valid AnnotationEvent payload', () => {
    const result = validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.eventId).toBe('test-event-1');
      expect(result.event.seq).toBe(1);
    }
  });

  it('accepts payload with optional ownership field', () => {
    const payload = makePayload({
      ownership: { ownerId: 'user-123', isPresenterOverride: false },
    });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(true);
  });

  it('increments valid counter on success', () => {
    validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    expect(getAnnotationIngressMetrics().valid).toBe(1);
  });

  // ── Malformed payload rejection ───────────────────────────────────────────

  it('rejects payload missing eventId', () => {
    const payload = makePayload({ eventId: undefined });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MALFORMED_PAYLOAD');
    }
  });

  it('rejects payload with negative seq', () => {
    const payload = makePayload({ seq: -1 });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_SEQUENCE');
    }
  });

  it('rejects payload with non-integer seq', () => {
    const payload = makePayload({ seq: 1.5 });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_SEQUENCE');
    }
  });

  it('rejects unknown schema version', () => {
    const payload = makePayload({ schemaVersion: 'v99' });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_VERSION_MISMATCH');
    }
  });

  it('rejects unknown event type', () => {
    const payload = makePayload({ type: 'unknown:type' });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNKNOWN_EVENT_TYPE');
    }
  });

  it('rejects extra (unknown) fields — strict mode', () => {
    const payload = makePayload({ unknownField: 'should be rejected' });
    const result = validateAnnotationEvent(payload, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
  });

  it('increments invalid counter on rejection', () => {
    validateAnnotationEvent(makePayload({ seq: -1 }), 'user-123', dedupe.isDuplicate);
    expect(getAnnotationIngressMetrics().invalid).toBe(1);
  });

  // ── Duplicate packet detection ────────────────────────────────────────────

  it('rejects duplicate eventId on same socket', () => {
    validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    const result = validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DUPLICATE_PACKET');
    }
  });

  it('increments duplicate counter on duplicate', () => {
    validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    expect(getAnnotationIngressMetrics().duplicates).toBe(1);
  });

  it('allows same eventId on different sockets (different dedupe instances)', () => {
    const dedupe2 = createSocketDedupe();
    validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    const result = validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe2.isDuplicate);
    // Different socket — should be valid
    expect(result.ok).toBe(true);
  });

  // ── Ownership check ───────────────────────────────────────────────────────

  it('rejects payload where userId does not match socketUserId', () => {
    const result = validateAnnotationEvent(VALID_PAYLOAD, 'different-user', dedupe.isDuplicate);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHORIZED_MUTATION');
    }
  });

  it('accepts payload where userId matches socketUserId', () => {
    const result = validateAnnotationEvent(VALID_PAYLOAD, 'user-123', dedupe.isDuplicate);
    expect(result.ok).toBe(true);
  });

  // ── createSocketDedupe ────────────────────────────────────────────────────

  describe('createSocketDedupe', () => {
    it('tracks seen eventIds within the same instance', () => {
      const { isDuplicate } = createSocketDedupe();
      expect(isDuplicate('e1')).toBe(false);
      expect(isDuplicate('e1')).toBe(true);
      expect(isDuplicate('e2')).toBe(false);
    });

    it('reset clears the dedupe state', () => {
      const { isDuplicate, reset } = createSocketDedupe();
      isDuplicate('e1');
      reset();
      expect(isDuplicate('e1')).toBe(false);
    });

    it('evicts oldest eventId at 512 capacity', () => {
      const { isDuplicate } = createSocketDedupe();
      // Fill to capacity
      for (let i = 0; i < 512; i++) {
        isDuplicate(`e${i}`);
      }
      // Adding one more evicts e0
      isDuplicate('e512');
      // e0 should no longer be seen
      expect(isDuplicate('e0')).toBe(false);
    });
  });

  // ── Metrics ───────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('correctly tracks rejection reasons', () => {
      validateAnnotationEvent(makePayload({ seq: -1 }), 'user-123', dedupe.isDuplicate);
      validateAnnotationEvent(makePayload({ schemaVersion: 'v99' }), 'user-123', dedupe.isDuplicate);

      const m = getAnnotationIngressMetrics();
      expect(m.invalid).toBe(2);
      expect(m.rejectionReasons['INVALID_SEQUENCE']).toBe(1);
      expect(m.rejectionReasons['SCHEMA_VERSION_MISMATCH']).toBe(1);
    });
  });
});
