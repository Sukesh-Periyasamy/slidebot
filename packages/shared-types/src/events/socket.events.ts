import type { Annotation, CursorPosition, DeckRole, SessionStatus, UserPresence } from '../models/index.js';

/**
 * Full AnnotationEvent envelope — used by the new unified annotation_event channel.
 * Matches the Zod schema in @slidebot/shared-schemas/annotationEventIngressSchema.
 * Defined inline to avoid a circular package dependency (shared-types → shared-schemas).
 */
export interface AnnotationEventIngress {
  eventId: string;
  seq: number;
  causalTs: number;
  roomId: string;
  slideIndex: number;
  userId: string;
  schemaVersion: 'v1';
  type:
    | 'stroke:chunk'
    | 'stroke:start'
    | 'stroke:end'
    | 'erase'
    | 'undo'
    | 'redo'
    | 'lock'
    | 'unlock'
    | 'meta';
  payload: Record<string, unknown>;
  ownership?: {
    ownerId: string;
    isPresenterOverride: boolean;
  };
  ts: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespace definitions
// ─────────────────────────────────────────────────────────────────────────────

export type SocketNamespace = 'collaboration' | 'presenter';

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT → SERVER events
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientToServerEvents {
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  /** Join a deck editing room */
  join_deck: (payload: JoinDeckPayload, ack?: AckCallback) => void;
  /** Leave a deck editing room */
  leave_deck: (payload: { deckId: string }) => void;

  // ── Presence ───────────────────────────────────────────────────────────────
  /** Broadcast cursor position to other users in the deck */
  cursor_move: (payload: CursorMovePayload) => void;
  /** Broadcast which element a user has selected */
  user_select_element: (payload: UserSelectElementPayload) => void;

  // ── CRDT (Yjs) ─────────────────────────────────────────────────────────────
  /** Forward a Yjs binary update to all peers */
  yjs_update: (payload: YjsUpdatePayload) => void;
  /** Request full Yjs document state (on reconnect) */
  yjs_sync_request: (payload: { deckId: string }, ack?: YjsSyncAckCallback) => void;

  // ── Annotations ────────────────────────────────────────────────────────────
  /** Start a drawing stroke */
  annotation_start: (payload: AnnotationStartPayload) => void;
  /** Stream points during drawing */
  annotation_draw: (payload: AnnotationDrawPayload) => void;
  /** Finalize and save annotation */
  annotation_end: (payload: AnnotationEndPayload) => void;
  /** Delete a saved annotation */
  annotation_delete: (payload: { slideId: string; annotationId: string }) => void;
  /** Clear all annotations on a slide */
  annotation_clear: (payload: { slideId: string }) => void;

  /** Check replay sequence integrity */
  replay_integrity_check: (
    payload: { deckId: string; slideId: string; localEventCount: number; checksum?: string },
    ack?: (response: { ok: boolean; match?: boolean; serverEventCount?: number; error?: string }) => void
  ) => void;

  /**
   * New unified annotation event channel.
   * Uses the full AnnotationEvent envelope (validated on server ingress).
   * Includes sequence ID, schema version, ownership metadata, and causal timestamp.
   */
  annotation_event: (payload: AnnotationEventIngress) => void;

  // ── Presentation Mode ──────────────────────────────────────────────────────
  /** Start or join a live presentation session */
  presenter_join: (payload: PresenterJoinPayload, ack?: AckCallback) => void;
  /** Advance to next slide */
  presenter_next: (payload: { sessionId: string }) => void;
  /** Go to previous slide */
  presenter_prev: (payload: { sessionId: string }) => void;
  /** Jump to a specific slide */
  presenter_goto: (payload: { sessionId: string; slideIndex: number }) => void;
  /** End the presentation session */
  presenter_end: (payload: { sessionId: string }) => void;
  /** Send a live reaction */
  reaction_send: (payload: ReactionPayload) => void;
  /** Raise hand */
  hand_raise: (payload: { sessionId: string }) => void;
  /** Lower hand */
  hand_lower: (payload: { sessionId: string; targetUserId?: string }) => void;
  /** Create a comment */
  comment_create: (payload: CommentCreatePayload) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVER → CLIENT events
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  // ── Presence ───────────────────────────────────────────────────────────────
  /** Full presence update (list of all users in room) */
  presence_update: (payload: { users: UserPresence[] }) => void;
  /** A single user's cursor moved */
  cursor_update: (payload: CursorUpdatePayload) => void;
  /** A new user joined the deck */
  user_joined: (payload: { user: UserPresence }) => void;
  /** A user left the deck */
  user_left: (payload: { userId: string }) => void;
  /** A user selected an element */
  element_selection_update: (payload: UserSelectElementPayload) => void;

  // ── CRDT (Yjs) ─────────────────────────────────────────────────────────────
  /** Broadcast a Yjs update to all peers */
  yjs_update: (payload: YjsUpdatePayload) => void;

  // ── Annotations ────────────────────────────────────────────────────────────
  /** A user started drawing (live preview) */
  annotation_started: (payload: AnnotationStartPayload & { userId: string }) => void;
  /** Points streaming (live preview) */
  annotation_drew: (payload: AnnotationDrawPayload & { userId: string }) => void;
  /** A completed annotation was saved */
  annotation_saved: (payload: { slideId: string; annotation: Annotation }) => void;
  /** An annotation was deleted */
  annotation_deleted: (payload: { slideId: string; annotationId: string }) => void;
  /** All annotations on a slide were cleared */
  annotation_cleared: (payload: { slideId: string }) => void;

  /**
   * Server broadcast of a validated annotation_event to all room members.
   * Mirrors annotation_event from ClientToServerEvents (already validated).
   */
  annotation_event_broadcast: (payload: AnnotationEventIngress) => void;

  // ── Presentation Mode ──────────────────────────────────────────────────────
  /** Slide changed by presenter */
  slide_changed: (payload: { sessionId: string; slideIndex: number }) => void;
  /** Session ended */
  presenter_ended: (payload: { sessionId: string }) => void;
  /** Reaction received */
  reaction_received: (payload: ReactionPayload & { userId: string; displayName: string; timestamp: string }) => void;
  /** A user raised their hand */
  hand_raised: (payload: { userId: string; timestamp: string }) => void;
  /** A user's hand was lowered */
  hand_lowered: (payload: { userId: string }) => void;
  /** A comment was created */
  comment_created: (payload: CommentCreatedPayload) => void;

  // ── Conversion ──────────────────────────────────────────────────────────────
  /** PPTX conversion status update (completed or failed) */
  conversion_status: (payload: ConversionStatusPayload) => void;

  // ── System ─────────────────────────────────────────────────────────────────
  /** Typed error from server */
  error: (payload: SocketError) => void;
  /** Rate limit notification */
  rate_limited: (payload: { retryAfter: number }) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload types
// ─────────────────────────────────────────────────────────────────────────────

export interface JoinDeckPayload {
  deckId: string;
  slideId?: string;
}

export interface CursorMovePayload {
  deckId: string;
  slideId: string;
  position: CursorPosition;
}

export interface CursorUpdatePayload {
  userId: string;
  deckId: string;
  slideId: string;
  position: CursorPosition;
}

export interface UserSelectElementPayload {
  userId: string;
  deckId: string;
  slideId: string;
  elementId: string | null;
}

export interface YjsUpdatePayload {
  deckId: string;
  /** Base64-encoded Uint8Array Yjs update */
  update: string;
  /** Origin identifier to prevent echo */
  origin: string;
}

export interface AnnotationStartPayload {
  slideId: string;
  annotationId: string;
  tool: Annotation['tool'];
  color: string;
  strokeWidth: number;
}

export interface AnnotationDrawPayload {
  slideId: string;
  annotationId: string;
  /** New points to append [x, y] */
  points: number[];
}

export interface AnnotationEndPayload {
  slideId: string;
  annotationId: string;
  isEphemeral: boolean;
}

export interface PresenterJoinPayload {
  deckId: string;
  sessionId?: string;
  role: 'presenter' | 'viewer';
}

export interface ReactionPayload {
  sessionId: string;
  emoji: string;
}

export interface CommentCreatePayload {
  sessionId: string;
  slideId: string;
  text: string;
  positionX?: number;
  positionY?: number;
}

export interface CommentCreatedPayload {
  id: string;
  sessionId: string;
  slideId: string;
  userId: string;
  displayName: string;
  text: string;
  positionX?: number | null;
  positionY?: number | null;
  createdAt: string;
}

export interface ConversionStatusPayload {
  deckId: string;
  status: 'completed' | 'failed';
  pdfStoragePath?: string;
  thumbnailPaths?: string[];
  error?: string;
}

export interface SocketError {
  code: SocketErrorCode;
  message: string;
}

export type SocketErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'DECK_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

// ─────────────────────────────────────────────────────────────────────────────
// Acknowledgement types
// ─────────────────────────────────────────────────────────────────────────────

export type AckCallback = (response: { ok: boolean; error?: SocketError }) => void;

export type YjsSyncAckCallback = (response: {
  ok: boolean;
  /** Base64-encoded full Yjs document state */
  state?: string;
  error?: SocketError;
}) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Inter-socket data (shared for rooms/namespaces)
// ─────────────────────────────────────────────────────────────────────────────

export interface SocketData {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: DeckRole;
  currentDeckId: string | null;
  currentSessionId: string | null;
  currentSlideId: string | null;
  clientRtt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Room name helpers
// ─────────────────────────────────────────────────────────────────────────────

export const ROOMS = {
  deck: (deckId: string) => `deck:${deckId}`,
  slide: (slideId: string) => `slide:${slideId}`,
  session: (sessionId: string) => `session:${sessionId}`,
} as const;
