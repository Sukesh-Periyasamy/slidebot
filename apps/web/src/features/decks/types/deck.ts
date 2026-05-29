import type { PresentationDocument } from '@slidebot/shared-types/scene-graph';

// ─── Source Type ─────────────────────────────────────────────────────────────

export type DeckSourceType = 'pdf' | 'pptx';

// ─── Conversion Status ───────────────────────────────────────────────────────

export type ConversionStatus = 'none' | 'pending' | 'processing' | 'completed' | 'failed';

// ─── API Response Types ──────────────────────────────────────────────────────

export interface UploadDeckResponse {
  deckId: string;
  roomId?: string;
  name: string;
  slides: number;
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
  /** Present for PPTX uploads */
  sourceType?: DeckSourceType;
  /** Author extracted from PPTX core properties */
  author?: string;
  /** Conversion status for PPTX decks */
  conversionStatus?: ConversionStatus;
}

export interface DeckRecord {
  deckId: string;
  name: string;
  slides: number;
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresAt: number;
  createdAt: number;
  /** Source file type: 'pdf' or 'pptx' */
  sourceType: DeckSourceType;
  /** Author extracted from PPTX core properties */
  author?: string;
  /** Path to the server-converted PDF (available after conversion completes) */
  pdfStoragePath?: string;
  /** Conversion status for PPTX decks */
  conversionStatus: ConversionStatus;
  /** Storage prefix for slide thumbnails */
  thumbnailPrefix?: string;
  /** Client-side parsed Scene Graph for PPTX decks */
  sceneGraph?: PresentationDocument;
}

// ─── Socket.IO Conversion Status Event ───────────────────────────────────────

export interface ConversionStatusEvent {
  deckId: string;
  status: 'completed' | 'failed';
  pdfStoragePath?: string;
  thumbnailPaths?: string[];
  error?: string;
}

// ─── API Wrapper Types ───────────────────────────────────────────────────────

export interface GetDeckResponse {
  data: UploadDeckResponse;
}
