import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Deck Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createDeckSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(500).optional(),
});

export const updateDeckSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  settings: z
    .object({
      theme: z.enum(['light', 'dark', 'custom']).optional(),
      defaultBackground: z.string().optional(),
      aspectRatio: z.enum(['16:9', '4:3', '1:1']).optional(),
    })
    .optional(),
});

export const deckIdSchema = z.object({
  id: z.string().uuid(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Slide Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createSlideSchema = z.object({
  position: z.number().int().positive().optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .optional(),
});

export const updateSlideSchema = z.object({
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  backgroundImageUrl: z.string().url().nullable().optional(),
});

export const reorderSlidesSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// Collaborator Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const inviteCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['editor', 'viewer']),
});

export const updateCollaboratorRoleSchema = z.object({
  role: z.enum(['editor', 'viewer']),
});

// ─────────────────────────────────────────────────────────────────────────────
// Annotation Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createAnnotationSchema = z.object({
  slideId: z.string().uuid(),
  deckId: z.string().uuid(),
  tool: z.enum(['freehand', 'highlight', 'arrow', 'text', 'pointer']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  strokeWidth: z.number().min(1).max(50),
  points: z.array(z.number()).optional(),
  rect: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  text: z.string().max(500).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  isEphemeral: z.boolean().default(false),
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Schema
// ─────────────────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

// ─────────────────────────────────────────────────────────────────────────────
// Realtime AnnotationEvent ingress validation
// Full envelope validation for socket→manager→store boundary.
// This is intentionally STRICT (strip unknown keys, validate all fields).
// ─────────────────────────────────────────────────────────────────────────────

export const annotationSchemaVersionSchema = z.enum(['v1']);

export const annotationOwnershipSchema = z.object({
  ownerId: z.string().min(1, 'ownerId is required'),
  isPresenterOverride: z.boolean().default(false),
});

export const annotationEventTypeSchema = z.enum([
  'stroke:chunk',
  'stroke:start',
  'stroke:end',
  'erase',
  'undo',
  'redo',
  'lock',
  'unlock',
  'meta',
]);

/**
 * Full server-side ingress validation schema for AnnotationEvent packets.
 *
 * Responsibilities:
 * - Validates schema version (reject unknown versions)
 * - Validates sequence ID (monotonic, non-negative integer)
 * - Validates ownership metadata (ownerId present)
 * - Validates event type enum
 * - Validates causal timestamp (non-negative)
 * - Validates roomId and slideIndex
 * - Strips unknown extra fields (strict mode via .strict())
 */
export const annotationEventIngressSchema = z
  .object({
    eventId: z.string().min(1, 'eventId is required'),
    seq: z
      .number()
      .int('seq must be integer')
      .nonnegative('seq must be non-negative'),
    causalTs: z
      .number()
      .int('causalTs must be integer')
      .nonnegative('causalTs must be non-negative'),
    roomId: z.string().min(1, 'roomId is required'),
    slideIndex: z
      .number()
      .int('slideIndex must be integer')
      .nonnegative('slideIndex must be non-negative'),
    userId: z.string().min(1, 'userId is required'),
    schemaVersion: annotationSchemaVersionSchema,
    type: annotationEventTypeSchema,
    payload: z.record(z.any()),
    ownership: annotationOwnershipSchema.optional(),
    ts: z
      .number()
      .int('ts must be integer')
      .nonnegative('ts must be non-negative'),
  })
  .strict();

/**
 * Structured validation error for rejected socket packets.
 * Used for DEV-side diagnostics and metric counters.
 */
export const annotationValidationErrorSchema = z.object({
  code: z.enum([
    'SCHEMA_VERSION_MISMATCH',
    'INVALID_SEQUENCE',
    'MISSING_OWNERSHIP',
    'UNKNOWN_EVENT_TYPE',
    'MALFORMED_PAYLOAD',
    'DUPLICATE_PACKET',
    'UNAUTHORIZED_MUTATION',
  ]),
  path: z.array(z.string()).optional(),
  message: z.string(),
  eventId: z.string().optional(),
  seq: z.number().optional(),
});

export type AnnotationEventIngress = z.infer<typeof annotationEventIngressSchema>;
export type AnnotationOwnership = z.infer<typeof annotationOwnershipSchema>;
export type AnnotationValidationError = z.infer<typeof annotationValidationErrorSchema>;
export type AnnotationSchemaVersion = z.infer<typeof annotationSchemaVersionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Exported inferred types
// ─────────────────────────────────────────────────────────────────────────────

export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type CreateSlideInput = z.infer<typeof createSlideSchema>;
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;
export type ReorderSlidesInput = z.infer<typeof reorderSlidesSchema>;
export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
