export interface UploadDeckResponse {
  deckId: string;
  name: string;
  slides: number;
}

export interface DeckRecord {
  deckId: string;
  name: string;
  slides: number;
  pdfUrl: string;
  createdAt: number;
}
