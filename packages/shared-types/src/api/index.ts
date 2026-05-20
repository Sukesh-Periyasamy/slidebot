import type { DeckRole } from '../models';

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface GetMeResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Decks endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDeckRequest {
  title: string;
  description?: string;
}

export interface UpdateDeckRequest {
  title?: string;
  description?: string;
  settings?: {
    theme?: 'light' | 'dark' | 'custom';
    defaultBackground?: string;
    aspectRatio?: '16:9' | '4:3' | '1:1';
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slides endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSlideRequest {
  position?: number;
  backgroundColor?: string;
}

export interface UpdateSlideRequest {
  backgroundColor?: string;
  backgroundImageUrl?: string | null;
}

export interface ReorderSlidesRequest {
  /** New ordered array of slide IDs */
  slideIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Collaborators endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface InviteCollaboratorRequest {
  email: string;
  role: Exclude<DeckRole, 'owner'>;
}

export interface UpdateCollaboratorRoleRequest {
  role: Exclude<DeckRole, 'owner'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotations endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface GetAnnotationsQuery {
  slideId: string;
}

export interface CreateAnnotationRequest {
  slideId: string;
  deckId: string;
  tool: string;
  color: string;
  strokeWidth: number;
  points?: number[];
  rect?: { x: number; y: number; width: number; height: number };
  text?: string;
  position?: { x: number; y: number };
  isEphemeral?: boolean;
}
