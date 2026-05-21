import { apiClient } from '@/lib/apiClient';
import type { UploadDeckResponse } from '../types/deck';

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
