export interface DeckMemoryRecord {
  deckId: string;
  ownerId: string;
  name: string;
  storagePath: string;
  slides: number;
  createdAt: number;
}

const deckMap = new Map<string, DeckMemoryRecord>();

export function upsertDeckRecord(record: DeckMemoryRecord): void {
  deckMap.set(record.deckId, record);
}

export function getDeckRecord(deckId: string): DeckMemoryRecord | undefined {
  return deckMap.get(deckId);
}
