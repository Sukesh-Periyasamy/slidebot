import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { DeckRecord } from '../types/deck';

interface DeckState {
  decks: Record<string, DeckRecord>;
  upsertDeck: (deck: DeckRecord) => void;
  removeDeck: (deckId: string) => void;
}

export const useDeckStore = create<DeckState>()(
  devtools(
    (set) => ({
      decks: {},
      upsertDeck: (deck) =>
        set((state) => ({
          decks: {
            ...state.decks,
            [deck.deckId]: deck,
          },
        })),
      removeDeck: (deckId) =>
        set((state) => {
          const next = { ...state.decks };
          const target = next[deckId];
          if (target?.pdfUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(target.pdfUrl);
          }
          delete next[deckId];
          return { decks: next };
        }),
    }),
    { name: 'DeckStore' }
  )
);
