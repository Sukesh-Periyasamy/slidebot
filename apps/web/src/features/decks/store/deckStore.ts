import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { PresentationDocument } from '@slidebot/shared-types/scene-graph';
import type { ConversionStatus, ConversionStatusEvent, DeckRecord } from '../types/deck';

interface DeckState {
  decks: Record<string, DeckRecord>;
  upsertDeck: (deck: DeckRecord) => void;
  getDeck: (deckId: string) => DeckRecord | undefined;
  removeDeck: (deckId: string) => void;
  /** Store the client-side parsed Scene Graph for a PPTX deck */
  setSceneGraph: (deckId: string, sceneGraph: PresentationDocument) => void;
  /** Update conversion status and related fields from a Socket.IO event */
  applyConversionStatus: (event: ConversionStatusEvent) => void;
  /** Update just the conversion status field */
  setConversionStatus: (deckId: string, status: ConversionStatus) => void;
}

export const useDeckStore = create<DeckState>()(
  devtools(
    (set, get) => ({
      decks: {},

      upsertDeck: (deck) =>
        set((state) => ({
          decks: {
            ...state.decks,
            [deck.deckId]: deck,
          },
        })),

      getDeck: (deckId) => get().decks[deckId],

      removeDeck: (deckId) =>
        set((state) => {
          const next = { ...state.decks };
          delete next[deckId];
          return { decks: next };
        }),

      setSceneGraph: (deckId, sceneGraph) =>
        set((state) => {
          const existing = state.decks[deckId];
          if (!existing) return state;
          return {
            decks: {
              ...state.decks,
              [deckId]: { ...existing, sceneGraph },
            },
          };
        }),

      applyConversionStatus: (event) =>
        set((state) => {
          const existing = state.decks[event.deckId];
          if (!existing) return state;

          const updated: DeckRecord = {
            ...existing,
            conversionStatus: event.status,
          };

          if (event.status === 'completed') {
            if (event.pdfStoragePath) {
              updated.pdfStoragePath = event.pdfStoragePath;
            }
            if (event.thumbnailPaths && event.thumbnailPaths.length > 0) {
              // Derive the thumbnail prefix from the first path
              // e.g. "decks/abc123/thumbnails/slide-1.png" → "decks/abc123/thumbnails/"
              const firstPath = event.thumbnailPaths[0]!;
              const lastSlash = firstPath.lastIndexOf('/');
              updated.thumbnailPrefix = lastSlash >= 0 ? firstPath.substring(0, lastSlash + 1) : firstPath;
            }
          }

          return {
            decks: {
              ...state.decks,
              [event.deckId]: updated,
            },
          };
        }),

      setConversionStatus: (deckId, status) =>
        set((state) => {
          const existing = state.decks[deckId];
          if (!existing) return state;
          return {
            decks: {
              ...state.decks,
              [deckId]: { ...existing, conversionStatus: status },
            },
          };
        }),
    }),
    { name: 'DeckStore' }
  )
);
