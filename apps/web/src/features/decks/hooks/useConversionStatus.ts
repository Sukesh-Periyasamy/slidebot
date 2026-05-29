import { useEffect, useRef } from 'react';

import type { ConversionStatusPayload } from '@slidebot/shared-types';

import { socketManager } from '@/features/collaboration/lib/socketManager';
import { useDeckStore } from '../store/deckStore';
import { useToast } from '@/shared/components/useToast';
import { logger } from '@/lib/logger';

/**
 * Listens for `conversion_status` Socket.IO events on the collaboration socket.
 *
 * When the server completes (or fails) PPTX → PDF conversion, it emits
 * `conversion_status` to the `deck:<deckId>` room on the /collaboration namespace.
 *
 * - On completion: updates the deck store with the PDF path and thumbnail paths.
 * - On failure: shows a notification that high-fidelity rendering is unavailable;
 *   the Scene Graph remains the primary rendering source.
 *
 * @param deckId - The deck ID to listen for conversion updates. Pass null/undefined to disable.
 */
export function useConversionStatus(deckId: string | null | undefined): void {
  const toast = useToast();
  const applyConversionStatus = useDeckStore((s) => s.applyConversionStatus);
  const handlerRef = useRef<((payload: ConversionStatusPayload) => void) | null>(null);
  const statusUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!deckId) return;

    function attachListener(): boolean {
      const socket = socketManager.getCollaborationSocket();
      if (!socket) return false;

      // Remove any previous handler to avoid duplicates
      detachListener();

      const handler = (payload: ConversionStatusPayload) => {
        // Only process events for the deck we're watching
        if (payload.deckId !== deckId) return;

        if (payload.status === 'completed') {
          logger.info(
            `[ConversionStatus] Conversion completed for deck ${payload.deckId}`,
          );

          applyConversionStatus({
            deckId: payload.deckId,
            status: 'completed',
            ...(payload.pdfStoragePath !== undefined && { pdfStoragePath: payload.pdfStoragePath }),
            ...(payload.thumbnailPaths !== undefined && { thumbnailPaths: payload.thumbnailPaths }),
          });

          toast.success(
            'PDF Ready',
            'High-fidelity PDF rendering is now available.',
          );
        } else if (payload.status === 'failed') {
          logger.warn(
            `[ConversionStatus] Conversion failed for deck ${payload.deckId}: ${payload.error ?? 'unknown error'}`,
          );

          applyConversionStatus({
            deckId: payload.deckId,
            status: 'failed',
            ...(payload.error !== undefined && { error: payload.error }),
          });

          toast.warning(
            'PDF Conversion Unavailable',
            'High-fidelity rendering is unavailable. The Scene Graph remains the primary source.',
          );
        }
      };

      handlerRef.current = handler;
      socket.on('conversion_status', handler as any);
      return true;
    }

    function detachListener(): void {
      const socket = socketManager.getCollaborationSocket();
      if (socket && handlerRef.current) {
        socket.off('conversion_status', handlerRef.current as any);
      }
      handlerRef.current = null;
    }

    // Try to attach immediately
    if (!attachListener()) {
      // Socket not ready yet — wait for connection
      const unsub = socketManager.onStatusChange((status) => {
        if (status === 'connected') {
          attachListener();
        }
      });
      statusUnsubRef.current = unsub;
    }

    return () => {
      detachListener();
      if (statusUnsubRef.current) {
        statusUnsubRef.current();
        statusUnsubRef.current = null;
      }
    };
  }, [deckId, toast, applyConversionStatus]);
}
