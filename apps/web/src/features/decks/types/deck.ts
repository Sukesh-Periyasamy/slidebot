export interface UploadDeckResponse {
  deckId: string;
  name: string;
  slides: number;
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresIn: number;
}

export interface DeckRecord {
  deckId: string;
  name: string;
  slides: number;
  storagePath: string;
  signedUrl: string;
  signedUrlExpiresAt: number;
  createdAt: number;
}

export interface GetDeckResponse {
  data: UploadDeckResponse;
}
