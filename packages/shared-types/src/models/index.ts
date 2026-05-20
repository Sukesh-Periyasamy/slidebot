// ─────────────────────────────────────────────────────────────────────────────
// User model
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Hex color assigned to this user in this session */
  color: string;
  /** Current slide the user is viewing */
  slideId: string | null;
  cursor: CursorPosition | null;
  isActive: boolean;
  lastSeen: string;
}

export interface CursorPosition {
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deck model
// ─────────────────────────────────────────────────────────────────────────────

export type DeckRole = 'owner' | 'editor' | 'viewer';

export interface Deck {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  settings: DeckSettings;
  createdAt: string;
  updatedAt: string;
}

export interface DeckSettings {
  theme: 'light' | 'dark' | 'custom';
  defaultBackground: string;
  aspectRatio: '16:9' | '4:3' | '1:1';
}

export interface DeckWithSlides extends Deck {
  slides: Slide[];
  collaborators: DeckCollaborator[];
  role: DeckRole;
}

export interface DeckCollaborator {
  userId: string;
  deckId: string;
  role: DeckRole;
  user: Pick<User, 'id' | 'displayName' | 'avatarUrl' | 'email'>;
  invitedAt: string;
  acceptedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide model
// ─────────────────────────────────────────────────────────────────────────────

export interface Slide {
  id: string;
  deckId: string;
  position: number;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  layoutMeta: SlideLayoutMeta;
  createdAt: string;
  updatedAt: string;
}

export interface SlideLayoutMeta {
  /** Layout hint for the Yjs element structure */
  layout: 'blank' | 'title' | 'title-body' | 'two-column';
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide Element model (stored in Yjs, not DB rows)
// ─────────────────────────────────────────────────────────────────────────────

export type ElementType = 'text' | 'shape' | 'image' | 'video' | 'code';

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  style: ElementStyle;
  // Type-specific content is stored in sub-fields
  text?: TextContent;
  shape?: ShapeContent;
  image?: ImageContent;
}

export interface ElementStyle {
  opacity: number;
  borderRadius: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: BoxShadow;
}

export interface BoxShadow {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

export interface TextContent {
  /** Raw text content */
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
}

export interface ShapeContent {
  shapeType: 'rect' | 'ellipse' | 'triangle' | 'star' | 'arrow';
  fill: string;
  stroke: string;
}

export interface ImageContent {
  url: string;
  alt: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotation model
// ─────────────────────────────────────────────────────────────────────────────

export type AnnotationTool = 'freehand' | 'highlight' | 'arrow' | 'text' | 'pointer';

export interface Annotation {
  id: string;
  slideId: string;
  deckId: string;
  userId: string;
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  /** Flat array of points [x1, y1, x2, y2, ...] for freehand/arrow */
  points?: number[];
  /** Bounding rect for highlight */
  rect?: { x: number; y: number; width: number; height: number };
  /** Text content for text annotations */
  text?: string;
  /** Position for text/pointer annotations */
  position?: CursorPosition;
  /** If true, annotation is NOT persisted (e.g., laser pointer) */
  isEphemeral: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation Session model
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = 'waiting' | 'active' | 'ended';

export interface PresentationSession {
  id: string;
  deckId: string;
  presenterId: string;
  currentSlideIndex: number;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// API response wrappers
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}
