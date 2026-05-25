import { useCallback, useState } from 'react';

import { uploadDeck } from '../api/decksApi';
import { useDeckStore } from '../store/deckStore';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function useDeckUpload() {
  const upsertDeck = useDeckStore((s) => s.upsertDeck);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePdf = useCallback((file: File): string | null => {
    const isPdfMime = file.type === 'application/pdf';
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');

    if (!isPdfMime && !isPdfExt) {
      return 'Please upload a valid PDF file.';
    }
    if (file.size > MAX_PDF_BYTES) {
      return 'File is too large. Maximum size is 50MB.';
    }
    return null;
  }, []);

  const upload = useCallback(
    async (file: File): Promise<{ deckId: string; roomId: string }> => {
      const validationError = validatePdf(file);
      if (validationError) {
        setError(validationError);
        throw new Error(validationError);
      }

      setIsUploading(true);
      setError(null);

      try {
        const payload = await uploadDeck(file);
        if (!payload.roomId) {
          throw new Error('Upload succeeded but room creation failed.');
        }

        upsertDeck({
          deckId: payload.deckId,
          name: payload.name,
          slides: payload.slides,
          storagePath: payload.storagePath,
          signedUrl: payload.signedUrl,
          signedUrlExpiresAt: Date.now() + payload.signedUrlExpiresIn * 1000,
          createdAt: Date.now(),
        });

        setIsUploading(false);
        return { deckId: payload.deckId, roomId: payload.roomId };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload presentation.';
        setError(message);
        setIsUploading(false);
        throw err;
      }
    },
    [upsertDeck, validatePdf]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    upload,
    isUploading,
    error,
    clearError,
  };
}
