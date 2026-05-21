import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { DeckRecord } from '../types/deck';

interface DeckState {
  decks: Record<string, DeckRecord>;
  upsertDeck: (deck: DeckRecord) => void;
  getDeck: (deckId: string) => DeckRecord | undefined;
  removeDeck: (deckId: string) => void;
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
    }),
    { name: 'DeckStore' }
  )
);
