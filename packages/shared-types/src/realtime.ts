import { z } from 'zod';
import { AnnotationEvent as AnnotationEventSchema, ReplayRecord as ReplayRecordSchema } from './annotations.js';

export const REALTIME_EVENTS = {
  SESSION_CREATE: 'session:create',
  SESSION_JOIN: 'session:join',
  SESSION_END: 'session:end',
  SESSION_STATE: 'session:state',
  SESSION_ENDED: 'session:ended',

  SLIDE_GOTO: 'slide:goto',
  SLIDE_CHANGE: 'slide:change',
  SLIDE_CHANGED: 'slide:changed',

  PRESENTER_HANDOFF: 'presenter:handoff',
  PRESENTER_CHANGED: 'presenter:changed',
  PRESENTER_DISCONNECTED: 'presenter:disconnected',
  PRESENTER_RECONNECTED: 'presenter:reconnected',
  PRESENTER_GRACE_EXPIRED: 'presenter:grace_expired',

  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_RECONNECTED: 'participant:reconnected',

  VIEWER_EXPLORE: 'viewer:explore',
  VIEWER_FOLLOW: 'viewer:follow',
  VIEWER_EXPLORING: 'viewer:exploring',

  JOIN_DECK: 'join_deck',
  LEAVE_DECK: 'leave_deck',

  CURSOR_MOVE: 'cursor_move',
  CURSOR_UPDATE: 'cursor_update',

  LASER_MOVE: 'laser_move',
  LASER_END: 'laser_end',
  LASER_UPDATE: 'laser_update',
  LASER_ENDED: 'laser_ended',

  ANNOTATION_START: 'annotation_start',
  ANNOTATION_DRAW: 'annotation_draw',
  ANNOTATION_END: 'annotation_end',
  ANNOTATION_DELETE: 'annotation_delete',
  ANNOTATION_CLEAR: 'annotation_clear',

  ANNOTATION_STARTED: 'annotation_started',
  ANNOTATION_DREW: 'annotation_drew',
  ANNOTATION_ENDED: 'annotation_ended',
  ANNOTATION_DELETED: 'annotation_deleted',
  ANNOTATION_CLEARED: 'annotation_cleared',
  ANNOTATION_SAVED: 'annotation_saved',

  USER_LEFT: 'user_left',
  USER_JOINED: 'user_joined',

  REACTION_SEND: 'reaction:send',
  REACTION_RECEIVED: 'reaction:received',

  HAND_RAISE: 'hand:raise',
  HAND_LOWER: 'hand:lower',
  HAND_RAISED: 'hand:raised',
  HAND_LOWERED: 'hand:lowered',

  COMMENT_CREATE: 'comment:create',
  COMMENT_CREATED: 'comment:created',

  APP_PING: 'app:ping',
  APP_PONG: 'app:pong',
} as const;

const IdSchema = z.string().min(1);
const NonNegativeNumberSchema = z.number().finite().min(0);

export const CursorPositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const SessionCreateSchema = z.object({
  deckId: IdSchema,
  totalSlides: z.number().int().min(1),
});

export const SessionJoinSchema = z
  .object({
    sessionId: IdSchema.optional(),
    deckId: IdSchema.optional(),
  })
  .refine((payload) => Boolean(payload.sessionId || payload.deckId), {
    message: 'sessionId or deckId is required',
  });

export const SessionScopedSchema = z.object({
  sessionId: IdSchema,
});

export const SlideGotoSchema = z.object({
  sessionId: IdSchema,
  slideIndex: z.number().int().min(0),
  sequenceNum: z.number().int().min(0),
});

export const SlideChangeSchema = z.object({
  roomId: IdSchema,
  slide: z.number().int().min(1),
});

export const PresenterHandoffSchema = z.object({
  sessionId: IdSchema,
  toUserId: IdSchema,
  toUserName: z.string().min(1),
});

export const JoinDeckSchema = z.object({
  deckId: IdSchema,
  slideId: IdSchema.optional(),
  clientRtt: z.number().optional(),
});

export const LeaveDeckSchema = z.object({
  deckId: IdSchema,
});

export const CursorMoveSchema = z.object({
  deckId: IdSchema,
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  position: CursorPositionSchema,
});

export const LaserMoveSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  trail: z.array(CursorPositionSchema),
});

export const LaserEndSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
});

export const AnnotationStartSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  annotationId: IdSchema,
  tool: z.string().min(1),
  color: z.string().min(1),
  strokeWidth: NonNegativeNumberSchema,
  opacity: z.number().finite().min(0).max(1),
  initialPoint: CursorPositionSchema,
});

export const AnnotationDrawSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  points: z.array(z.number().finite()),
});

export const AnnotationEndSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  annotation: z.unknown(),
});

export const AnnotationDeleteSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
  annotationId: IdSchema,
});

export const AnnotationClearSchema = z.object({
  sessionId: IdSchema.optional(),
  slideId: IdSchema,
});

export const UserJoinedSchema = z.object({
  user: z.any(), // Assuming SessionMemberSchema exists elsewhere or placeholder
});

export const ReactionSendSchema = z.object({
  roomId: IdSchema,
  emoji: z.string().min(1).max(10),
});

export const ReactionReceivedSchema = z.object({
  userId: IdSchema,
  displayName: z.string(),
  emoji: z.string(),
});

export const HandRaiseSchema = z.object({
  roomId: IdSchema,
});

export const HandLowerSchema = z.object({
  roomId: IdSchema,
  targetUserId: IdSchema.optional(),
});

export const HandEventSchema = z.object({
  userId: IdSchema,
});

export const CommentCreateSchema = z.object({
  roomId: IdSchema,
  slideId: IdSchema,
  text: z.string().min(1).max(500),
  positionX: z.number().finite().optional(),
  positionY: z.number().finite().optional(),
});

export const CommentCreatedSchema = z.object({
  id: IdSchema,
  roomId: IdSchema,
  slideId: IdSchema,
  userId: IdSchema,
  displayName: z.string(),
  text: z.string(),
  positionX: z.number().nullable().optional(),
  positionY: z.number().nullable().optional(),
  createdAt: z.string(),
});

export const AppPingSchema = z.object({
  ts: z.number().int().positive(),
});

export const RealtimeSchemas = {
  sessionCreate: SessionCreateSchema,
  sessionJoin: SessionJoinSchema,
  sessionScoped: SessionScopedSchema,
  slideGoto: SlideGotoSchema,
  slideChange: SlideChangeSchema,
  presenterHandoff: PresenterHandoffSchema,
  joinDeck: JoinDeckSchema,
  leaveDeck: LeaveDeckSchema,
  cursorMove: CursorMoveSchema,
  laserMove: LaserMoveSchema,
  laserEnd: LaserEndSchema,
  annotationStart: AnnotationStartSchema,
  annotationDraw: AnnotationDrawSchema,
  annotationEnd: AnnotationEndSchema,
  annotationEvent: AnnotationEventSchema,
  annotationDelete: AnnotationDeleteSchema,
  annotationClear: AnnotationClearSchema,
  reactionSend: ReactionSendSchema,
  handRaise: HandRaiseSchema,
  handLower: HandLowerSchema,
  commentCreate: CommentCreateSchema,
  replayRecord: ReplayRecordSchema,
  appPing: AppPingSchema,
} as const;

export type SessionCreatePayload = z.infer<typeof SessionCreateSchema>;
export type SessionJoinPayload = z.infer<typeof SessionJoinSchema>;
export type SessionScopedPayload = z.infer<typeof SessionScopedSchema>;
export type SlideGotoPayload = z.infer<typeof SlideGotoSchema>;
export type SlideChangePayload = z.infer<typeof SlideChangeSchema>;
export type PresenterHandoffPayload = z.infer<typeof PresenterHandoffSchema>;
export type JoinDeckPayloadRealtime = z.infer<typeof JoinDeckSchema>;
export type LeaveDeckPayloadRealtime = z.infer<typeof LeaveDeckSchema>;
export type CursorMovePayloadRealtime = z.infer<typeof CursorMoveSchema>;
export type LaserMovePayload = z.infer<typeof LaserMoveSchema>;
export type LaserEndPayload = z.infer<typeof LaserEndSchema>;
export type AnnotationStartPayloadRealtime = z.infer<typeof AnnotationStartSchema>;
export type AnnotationDrawPayloadRealtime = z.infer<typeof AnnotationDrawSchema>;
export type AnnotationEndPayloadRealtime = z.infer<typeof AnnotationEndSchema>;
export type AnnotationEventRealtime = z.infer<typeof AnnotationEventSchema>;
export type AnnotationDeletePayloadRealtime = z.infer<typeof AnnotationDeleteSchema>;
export type AnnotationClearPayloadRealtime = z.infer<typeof AnnotationClearSchema>;
