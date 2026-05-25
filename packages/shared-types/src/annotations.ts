import { z } from 'zod';

// Schema versioning for migrations
export const SchemaVersion = z.enum(['v1']);
export type SchemaVersion = z.infer<typeof SchemaVersion>;

// Basic IDs
export const Id = z.string();
export type Id = z.infer<typeof Id>;

// Tool types for strokes
export const ToolType = z.enum(['pen', 'highlighter', 'eraser', 'laser']);
export type ToolType = z.infer<typeof ToolType>;

// A chunk of stroke points (chunked for partial replay)
export const StrokeChunk = z.object({
  strokeId: Id,
  seq: z.number().int().nonnegative(),
  points: z.array(z.number()).nonempty(), // [x0,y0,x1,y1,...]
  tool: ToolType,
  color: z.string(),
  width: z.number().positive(),
  pressure: z.number().min(0).max(1).optional(),
  ts: z.number().int().nonnegative(),
});
export type StrokeChunk = z.infer<typeof StrokeChunk>;

// Erase action targets an annotation or stroke id
export const EraseAction = z.object({
  targetId: Id,
  ts: z.number().int().nonnegative(),
});
export type EraseAction = z.infer<typeof EraseAction>;

// Ownership metadata
export const Ownership = z.object({
  ownerId: Id,
  isPresenterOverride: z.boolean().optional().default(false),
});
export type Ownership = z.infer<typeof Ownership>;

// Envelope for realtime annotation events
export const AnnotationEvent = z.object({
  eventId: Id,
  // Monotonic sequence number assigned by client for outgoing ops
  seq: z.number().int().nonnegative(),
  // The causal ordering token assigned by origin (server will also stamp)
  causalTs: z.number().int().nonnegative(),
  roomId: Id,
  slideIndex: z.number().int().nonnegative(),
  userId: Id,
  schemaVersion: SchemaVersion,
  type: z.enum([
    'stroke:chunk',
    'stroke:start',
    'stroke:end',
    'erase',
    'undo',
    'redo',
    'lock',
    'unlock',
    'meta',
  ]),
  payload: z.union([StrokeChunk, EraseAction, z.record(z.any())]),
  ownership: Ownership.optional(),
  ts: z.number().int().nonnegative(),
});
export type AnnotationEvent = z.infer<typeof AnnotationEvent>;

// Helper: validate and return typed event or throw
export function parseAnnotationEvent(input: unknown): AnnotationEvent {
  const res = AnnotationEvent.safeParse(input);
  if (!res.success) throw new Error(`Invalid AnnotationEvent: ${res.error}`);
  return res.data;
}

// Replay-safe wrapper: minimal metadata sent on replay
export const ReplayRecord = z.object({
  eventId: Id,
  seq: z.number().int().nonnegative(),
  roomId: Id,
  slideIndex: z.number().int().nonnegative(),
  userId: Id,
  schemaVersion: SchemaVersion,
  ts: z.number().int().nonnegative(),
});
export type ReplayRecord = z.infer<typeof ReplayRecord>;
