/**
 * RoomDeletionService — handles cascade deletion of rooms and associated data.
 *
 * Deletion order (when deck is not shared):
 *   1. Annotations (where slideId in deck's slides)
 *   2. AnnotationSnapshots (where slideId in deck's slides)
 *   3. Slides (where deckId = deck.id)
 *   4. Supabase Storage file (deck.storagePath)
 *   5. Deck record
 *   6. RoomParticipants (where roomId = room.id)
 *   7. Room record
 *
 * Key behaviors:
 * - Shared deck protection: deck/storage only deleted when no other rooms reference it
 * - Active room sessions are ended before deletion
 * - Storage errors are soft-failed (logged, DB deletion continues)
 * - All DB operations wrapped in a Prisma transaction for atomicity
 */

import type { PrismaClient } from '@prisma/client';
import type { SupabaseClient } from '@supabase/supabase-js';

import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { supabaseAdmin } from '../../config/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DeletionResult {
  roomId: string;
  deckDeleted: boolean;
  storageDeleted: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class RoomDeletionService {
  private db: PrismaClient;
  private storage: SupabaseClient;
  private storageBucket: string;

  constructor(
    db: PrismaClient = prisma,
    storage: SupabaseClient = supabaseAdmin,
    storageBucket: string = env.SUPABASE_STORAGE_BUCKET,
  ) {
    this.db = db;
    this.storage = storage;
    this.storageBucket = storageBucket;
  }

  /**
   * Delete a single room and cascade to associated data.
   * If the room is active, ends the session first.
   * Only deletes the deck/storage if no other rooms reference the same deck.
   */
  async deleteRoom(roomId: string, requesterId: string): Promise<DeletionResult> {
    const room = await this.db.room.findUnique({
      where: { id: roomId },
      include: {
        deck: {
          select: { id: true, storagePath: true },
        },
      },
    });

    if (!room) {
      return { roomId, deckDeleted: false, storageDeleted: false, error: 'Room not found' };
    }

    // End active room session before deletion
    if (room.status === 'active') {
      await this.db.room.update({
        where: { id: roomId },
        data: { status: 'ended', endedAt: new Date() },
      });
    }

    // Check if the deck is shared with other rooms
    const otherRoomsCount = await this.db.room.count({
      where: { deckId: room.deckId, id: { not: roomId } },
    });

    const isDeckShared = otherRoomsCount > 0;
    let storageDeleted = false;
    let deckDeleted = false;

    // Attempt storage file deletion before the transaction (soft-fail)
    if (!isDeckShared && room.deck.storagePath) {
      storageDeleted = await this.deleteStorageFile(room.deck.storagePath);
    }

    // Perform all DB deletions in a single transaction for atomicity
    await this.db.$transaction(async (tx) => {
      if (!isDeckShared) {
        // Get all slide IDs for this deck
        const slides = await tx.slide.findMany({
          where: { deckId: room.deckId },
          select: { id: true },
        });
        const slideIds = slides.map((s) => s.id);

        if (slideIds.length > 0) {
          // 1. Delete Annotations
          await tx.annotation.deleteMany({
            where: { slideId: { in: slideIds } },
          });

          // 2. Delete AnnotationSnapshots
          await tx.annotationSnapshot.deleteMany({
            where: { slideId: { in: slideIds } },
          });
        }

        // 3. Delete Slides
        await tx.slide.deleteMany({
          where: { deckId: room.deckId },
        });

        // 4. Storage file already handled above (soft-fail)

        // 5. Delete Deck record
        await tx.deck.delete({
          where: { id: room.deckId },
        });

        deckDeleted = true;
      }

      // 6. Delete RoomParticipants
      await tx.roomParticipant.deleteMany({
        where: { roomId },
      });

      // 7. Delete Room record
      await tx.room.delete({
        where: { id: roomId },
      });
    });

    return { roomId, deckDeleted, storageDeleted };
  }

  /**
   * Find and delete all expired rooms (createdAt > 10 days ago).
   * Skips active rooms and logs a warning for each. Processes in batches of 100.
   * Returns results for each room processed.
   */
  async deleteExpiredRooms(): Promise<DeletionResult[]> {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const results: DeletionResult[] = [];

    // Log warnings for active rooms that would otherwise be expired
    const skippedActiveRooms = await this.db.room.findMany({
      where: {
        createdAt: { lt: tenDaysAgo },
        status: 'active',
      },
      select: { id: true },
    });

    for (const room of skippedActiveRooms) {
      logger.warn(
        { roomId: room.id },
        'Skipping active room during expired room cleanup',
      );
    }

    // Process expired (non-active) rooms in batches of 100
    let hasMore = true;
    while (hasMore) {
      const expiredRooms = await this.db.room.findMany({
        where: {
          createdAt: { lt: tenDaysAgo },
          status: { not: 'active' },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: { id: true, presenterId: true },
      });

      if (expiredRooms.length === 0) {
        hasMore = false;
        break;
      }

      for (const room of expiredRooms) {
        try {
          const result = await this.deleteRoom(room.id, room.presenterId);
          results.push(result);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          logger.error(
            { roomId: room.id, error: errorMessage },
            'Failed to delete expired room',
          );
          results.push({
            roomId: room.id,
            deckDeleted: false,
            storageDeleted: false,
            error: errorMessage,
          });
        }
      }

      // If we got fewer than 100, we've processed all expired rooms
      if (expiredRooms.length < 100) {
        hasMore = false;
      }
    }

    return results;
  }

  /**
   * Delete a file from Supabase Storage.
   * Returns true if successful, false on failure (soft-fail).
   */
  private async deleteStorageFile(storagePath: string): Promise<boolean> {
    try {
      const { error } = await this.storage.storage
        .from(this.storageBucket)
        .remove([storagePath]);

      if (error) {
        logger.warn(
          { storagePath, error: error.message },
          'Failed to delete storage file, continuing with DB deletion',
        );
        return false;
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.warn(
        { storagePath, error: errorMessage },
        'Storage file deletion threw an exception, continuing with DB deletion',
      );
      return false;
    }
  }
}

// Export a singleton instance for use across the application
export const roomDeletionService = new RoomDeletionService();
