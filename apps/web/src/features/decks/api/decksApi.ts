import { apiClient, extractData } from '@/lib/apiClient';
import type { DeckRecord, UploadDeckResponse } from '../types/deck';

export async function uploadDeck(file: File): Promise<UploadDeckResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<UploadDeckResponse>('/decks/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
}

export async function getDeckById(deckId: string): Promise<UploadDeckResponse> {
  const response = await apiClient.get<{ data: UploadDeckResponse }>(`/decks/${deckId}`);
  return extractData(response);
}

/**
 * Maps an UploadDeckResponse to a DeckRecord suitable for the deck store.
 * Handles the new PPTX-specific fields (sourceType, author, conversionStatus).
 */
export function toDeckRecord(payload: UploadDeckResponse): DeckRecord {
  const record: DeckRecord = {
    deckId: payload.deckId,
    name: payload.name,
    slides: payload.slides,
    storagePath: payload.storagePath,
    signedUrl: payload.signedUrl,
    signedUrlExpiresAt: Date.now() + payload.signedUrlExpiresIn * 1000,
    createdAt: Date.now(),
    sourceType: payload.sourceType ?? 'pdf',
    conversionStatus: payload.conversionStatus ?? 'none',
  };

  if (payload.author !== undefined) {
    record.author = payload.author;
  }

  return record;
}
