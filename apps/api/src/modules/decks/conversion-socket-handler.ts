import { onConversionEvent, type ConversionEvent } from './conversion-queue';
import { getIoInstance } from '../../socket/io-instance';
import { logger } from '../../config/logger';

/**
 * Registers a conversion event handler that emits Socket.IO events
 * to the deck owner when conversion completes or fails.
 *
 * The event is emitted to a user-specific room (`user:<ownerId>`) on the
 * default namespace so the client can listen for conversion status updates
 * regardless of which deck/session they're currently viewing.
 */
export function registerConversionSocketHandler(): void {
  onConversionEvent((event: ConversionEvent) => {
    const io = getIoInstance();
    if (!io) {
      logger.warn(
        { deckId: event.deckId },
        'Socket.IO not initialized, cannot emit conversion status',
      );
      return;
    }

    // Emit to a user-specific room so only the deck owner receives the notification.
    // The client should join `user:<userId>` room on connection.
    // As a fallback, also emit to the deck room so anyone viewing the deck gets notified.
    const payload = {
      deckId: event.deckId,
      status: event.status,
      ...(event.pdfStoragePath !== undefined && { pdfStoragePath: event.pdfStoragePath }),
      ...(event.thumbnailPaths !== undefined && { thumbnailPaths: event.thumbnailPaths }),
      ...(event.error !== undefined && { error: event.error }),
    };

    // Emit to the deck-specific room on the /collaboration namespace
    // (clients join deck:<deckId> rooms via join_deck on /collaboration)
    io.of('/collaboration').to(`deck:${event.deckId}`).emit('conversion_status', payload);

    logger.info(
      { deckId: event.deckId, status: event.status },
      'Conversion status emitted via Socket.IO',
    );
  });

  logger.info('Conversion Socket.IO event handler registered');
}
