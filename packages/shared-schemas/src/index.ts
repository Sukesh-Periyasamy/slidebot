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
