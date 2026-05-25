/**
 * annotation-ingress-validator.ts
 *
 * Validates AnnotationEvent payloads at the socket ingress boundary.
 *
 * Architecture position:
 *   socket → annotationIngressValidator → manager → validated payload → store
 *
 * Responsibilities:
 * - Reject malformed payloads early (before any business logic)
 * - Never mutate incoming payloads (pure validation)
 * - Validate sequence IDs (non-negative integer)
 * - Validate ownership metadata (ownerId present when required)
 * - Validate schema version (reject unknown versions)
 * - Track DEV counters: invalid packets, duplicate packets
 * - Detect duplicate packets by eventId (per-socket sliding window)
 *
 * DO NOT:
 * - Validate inside React
 * - Attach validation inside UI components
 *
 * Validation boundary MUST remain:
 *   socket → manager → validated payload → store
 */

import {
  annotationEventIngressSchema,
  type AnnotationValidationError,
} from '@slidebot/shared-schemas';
import { logger } from '../config/logger';

// Zod-inferred type — avoids exactOptionalPropertyTypes conflict with the
// shared-types interface. The two types are structurally compatible.
type ValidatedAnnotationEvent = typeof annotationEventIngressSchema._output;

// ─────────────────────────────────────────────────────────────────────────────
// DEV Metrics counters
// Reset-able for test isolation; exported for debug routes.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnotationIngressMetrics {
  /** Total valid packets processed */
  valid: number;
  /** Total packets rejected due to schema errors */
  invalid: number;
  /** Total duplicate packets detected and dropped */
  duplicates: number;
  /** Breakdown of rejection reasons */
  rejectionReasons: Record<string, number>;
}

const metrics: AnnotationIngressMetrics = {
  valid: 0,
  invalid: 0,
  duplicates: 0,
  rejectionReasons: {},
};

export function getAnnotationIngressMetrics(): Readonly<AnnotationIngressMetrics> {
  return { ...metrics, rejectionReasons: { ...metrics.rejectionReasons } };
}

export function resetAnnotationIngressMetrics(): void {
  metrics.valid = 0;
  metrics.invalid = 0;
  metrics.duplicates = 0;
  metrics.rejectionReasons = {};
}

function trackRejection(code: string): void {
  metrics.invalid++;
  metrics.rejectionReasons[code] = (metrics.rejectionReasons[code] ?? 0) + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-socket duplicate detection
// Sliding window of seen eventIds (bounded to MAX_SEEN_IDS per socket)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SEEN_IDS = 512;

/**
 * Creates a per-socket deduplication tracker.
 * Call createSocketDedupe() once per socket connection.
 * Pass the returned `isDuplicate` function to validateAnnotationEvent().
 */
export function createSocketDedupe(): {
  isDuplicate: (eventId: string) => boolean;
  reset: () => void;
} {
  const seen: string[] = [];
  const seenSet = new Set<string>();

  return {
    isDuplicate(eventId: string): boolean {
      if (seenSet.has(eventId)) {
        return true;
      }
      seen.push(eventId);
      seenSet.add(eventId);
      // Evict oldest when at capacity
      if (seen.length > MAX_SEEN_IDS) {
        const evicted = seen.shift();
        if (evicted) seenSet.delete(evicted);
      }
      return false;
    },
    reset(): void {
      seen.length = 0;
      seenSet.clear();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation result
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationValidationResult =
  | { ok: true; event: ValidatedAnnotationEvent }
  | { ok: false; error: AnnotationValidationError };

/**
 * Validates an unknown socket payload as a well-formed AnnotationEvent.
 *
 * @param rawPayload   - Raw unknown payload from socket
 * @param socketUserId - userId from socket.data (trusted, set by auth middleware)
 * @param isDuplicate  - Per-socket dedup tracker (from createSocketDedupe())
 * @param context      - For logging (e.g. namespace name)
 * @returns AnnotationValidationResult — either { ok: true, event } or { ok: false, error }
 */
export function validateAnnotationEvent(
  rawPayload: unknown,
  socketUserId: string,
  isDuplicate: (eventId: string) => boolean,
  context = 'unknown'
): AnnotationValidationResult {
  // ── 1. Schema parse (strict — rejects unknown keys) ───────────────────────
  const parsed = annotationEventIngressSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path?.map(String) ?? [];
    const message = firstIssue?.message ?? 'Malformed AnnotationEvent payload';

    // Classify rejection reason
    let code: AnnotationValidationError['code'] = 'MALFORMED_PAYLOAD';
    if (path.includes('schemaVersion')) code = 'SCHEMA_VERSION_MISMATCH';
    else if (path.includes('seq')) code = 'INVALID_SEQUENCE';
    else if (path.includes('type')) code = 'UNKNOWN_EVENT_TYPE';
    else if (path.includes('ownership')) code = 'MISSING_OWNERSHIP';

    trackRejection(code);

    if (process.env.NODE_ENV !== 'production') {
      logger.warn(
        { context, code, path, message, issues: parsed.error.issues },
        '[AnnotationIngress] Rejected malformed payload'
      );
    }

    return {
      ok: false,
      error: { code, path, message },
    };
  }

  const event = parsed.data;

  // ── 2. Duplicate detection ─────────────────────────────────────────────────
  if (isDuplicate(event.eventId)) {
    metrics.duplicates++;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(
        { context, eventId: event.eventId, seq: event.seq },
        '[AnnotationIngress] Duplicate packet dropped'
      );
    }
    return {
      ok: false,
      error: {
        code: 'DUPLICATE_PACKET',
        message: `Duplicate eventId: ${event.eventId}`,
        eventId: event.eventId,
        seq: event.seq,
      },
    };
  }

  // ── 3. Ownership consistency check ────────────────────────────────────────
  // The userId in the payload must match the authenticated socket userId.
  // This prevents clients from spoofing other users' ownership.
  if (event.userId !== socketUserId) {
    trackRejection('UNAUTHORIZED_MUTATION');
    if (process.env.NODE_ENV !== 'production') {
      logger.warn(
        {
          context,
          payloadUserId: event.userId,
          socketUserId,
          eventId: event.eventId,
        },
        '[AnnotationIngress] userId mismatch — possible spoofing attempt'
      );
    }
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_MUTATION',
        message: 'Payload userId does not match authenticated user',
        eventId: event.eventId,
        seq: event.seq,
      },
    };
  }

  // ── 4. All checks passed ───────────────────────────────────────────────────
  metrics.valid++;
  return { ok: true, event };
}
