# Implementation Plan: Room Cleanup

## Overview

Implement manual and automatic room deletion for SlideBot. This includes a backend `RoomDeletionService` with cascade logic, a `DELETE /api/v1/rooms/:id` endpoint, a BullMQ scheduled cleanup job, and frontend UI components (delete button, confirmation dialog, optimistic removal). The implementation uses TypeScript across the monorepo with Prisma, Express, BullMQ, React, and Zustand.

## Tasks

- [x] 1. Implement RoomDeletionService
  - [x] 1.1 Create `RoomDeletionService` in `apps/api/src/modules/rooms/room-deletion.service.ts`
    - Implement `deleteRoom(roomId, requesterId)` method with cascade deletion logic
    - Implement shared deck check: only delete deck/storage when no other rooms reference the same deck
    - Implement deletion order: Annotations → AnnotationSnapshots → Slides → Storage file → Deck → RoomParticipants → Room
    - End active room sessions before deletion (set status to "ended", set endedAt)
    - Wrap database operations in a Prisma transaction for atomicity
    - Soft-fail on Supabase Storage errors: log and continue with DB deletion
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 4.1, 4.2, 4.3, 4.4, 4.6, 5.6_

  - [x] 1.2 Implement `deleteExpiredRooms()` method in `RoomDeletionService`
    - Query rooms where `createdAt < NOW() - 10 days` and `status != 'active'`
    - Process in batches of 100 rooms
    - Skip active rooms and log a warning for each skipped room
    - Continue processing on individual room deletion failure, log error with room ID
    - Delegate each room deletion to `deleteRoom()`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7_

  - [ ]* 1.3 Write property tests for RoomDeletionService
    - Add `fast-check` as a dev dependency to `apps/api`
    - Create `apps/api/src/modules/rooms/__tests__/room-deletion.property.test.ts`
    - **Property 1: Complete cascade deletion**
    - **Property 2: Shared deck protection**
    - **Property 4: Expiration selection**
    - **Property 5: Error resilience in batch processing**
    - **Property 6: Batch size constraint**
    - **Property 7: Deletion order invariant**
    - **Property 8: Transaction atomicity**
    - **Validates: Requirements 1.2, 1.3, 2.1, 2.3, 2.5, 2.6, 2.7, 4.1, 4.2, 4.3, 4.4, 4.6, 5.6**

  - [ ]* 1.4 Write unit tests for RoomDeletionService
    - Create `apps/api/src/modules/rooms/__tests__/room-deletion.test.ts`
    - Test: active room is ended before deletion
    - Test: storage failure doesn't block DB deletion
    - Test: shared deck is preserved when other rooms reference it
    - Test: all cascade records are deleted for non-shared deck
    - Test: expired rooms query excludes active rooms
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 2.1, 2.7_

- [x] 2. Implement DELETE API endpoint
  - [x] 2.1 Add `DELETE /api/v1/rooms/:id` route to `apps/api/src/modules/rooms/rooms.router.ts`
    - Validate `:id` is a valid UUID, return 404 if not
    - Require authentication via `authenticate` middleware, return 401 if missing/invalid
    - Check requester is the room's presenter (owner), return 403 if not
    - Call `RoomDeletionService.deleteRoom()` and return 204 No Content on success
    - Return 404 if room not found
    - Return 500 with error details on unexpected failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [ ]* 2.2 Write property test for authorization enforcement
    - Create `apps/api/src/modules/rooms/__tests__/rooms-delete.property.test.ts`
    - **Property 3: Authorization enforcement**
    - **Property 9: Invalid ID rejection**
    - **Validates: Requirements 1.6, 5.3, 5.5**

  - [ ]* 2.3 Write unit tests for DELETE endpoint
    - Create `apps/api/src/modules/rooms/__tests__/rooms-delete.test.ts`
    - Test: successful deletion returns 204 with empty body
    - Test: unauthenticated request returns 401
    - Test: non-owner request returns 403
    - Test: invalid UUID returns 404
    - Test: non-existent room returns 404
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 3. Checkpoint - Backend service and endpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement RoomCleanupJob with BullMQ
  - [x] 4.1 Create `RoomCleanupJob` in `apps/api/src/modules/rooms/room-cleanup.job.ts`
    - Define a BullMQ repeatable job with a daily cron schedule
    - On trigger, call `RoomDeletionService.deleteExpiredRooms()`
    - Log results: number of rooms processed, number of failures
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 4.2 Register the cleanup job in the application startup
    - Add job queue initialization and scheduler registration in the app bootstrap
    - Ensure the job is registered with BullMQ's repeat mechanism (cron pattern for daily execution)
    - _Requirements: 2.4_

  - [ ]* 4.3 Write unit tests for RoomCleanupJob
    - Create `apps/api/src/modules/rooms/__tests__/room-cleanup.job.test.ts`
    - Test: job calls deleteExpiredRooms on execution
    - Test: job logs results correctly
    - Test: BullMQ cron schedule is configured for daily execution
    - _Requirements: 2.4, 2.5_

- [x] 5. Implement frontend API client and hook
  - [x] 5.1 Add `deleteRoom` function to `apps/web/src/features/decks/api/roomsApi.ts`
    - Implement `deleteRoom(roomId: string): Promise<void>` calling `DELETE /api/v1/rooms/:id`
    - _Requirements: 5.1_

  - [x] 5.2 Create `useDeleteRoom` hook in `apps/web/src/features/decks/hooks/useDeleteRoom.ts`
    - Implement mutation hook that calls `deleteRoom` API function
    - On success: optimistically remove the room from the local rooms list
    - On error: show appropriate toast message based on status code (403, 404, 500, network error)
    - Track loading state for spinner UI
    - _Requirements: 1.5, 1.6_

- [x] 6. Implement frontend UI components
  - [x] 6.1 Create `DeleteRoomButton` component in `apps/web/src/features/decks/components/DeleteRoomButton.tsx`
    - Render a trash icon button (using `lucide-react` Trash2 icon)
    - Show tooltip "Delete room" on hover/focus within 500ms (using Radix Tooltip)
    - Show spinner (Loader2) while deletion is in progress
    - Disable button during deletion
    - Include `aria-label="Delete room"` for accessibility
    - Only render when current user is the room owner (presenter)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 6.2 Create `DeleteRoomDialog` component in `apps/web/src/features/decks/components/DeleteRoomDialog.tsx`
    - Use Radix Dialog for the confirmation modal
    - Display the deck name in the dialog to identify the room
    - Warn that deletion is permanent
    - Provide "Cancel" and "Delete" action buttons
    - On confirm: trigger deletion via `useDeleteRoom` hook
    - _Requirements: 1.1_

  - [x] 6.3 Integrate delete button and dialog into `DashboardPage`
    - Add `DeleteRoomButton` to each room card in the "Recent Rooms" list
    - Conditionally render based on whether current user is the room presenter
    - Wire up `DeleteRoomDialog` to open on button click
    - On successful deletion, remove room from local state without page reload
    - _Requirements: 1.1, 1.5, 3.1, 3.2_

  - [ ]* 6.4 Write unit tests for DeleteRoomButton and DeleteRoomDialog
    - Create `apps/web/src/features/decks/__tests__/DeleteRoomButton.test.tsx`
    - Test: delete button visible only for room owner
    - Test: tooltip displays on hover/focus
    - Test: spinner shown during deletion
    - Test: accessible label present
    - Test: confirmation dialog shows correct deck name
    - Test: optimistic UI removal on success
    - _Requirements: 1.1, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The API project uses Vitest for testing; `fast-check` needs to be added as a dev dependency
- The web project already has `fast-check` available as a dev dependency
- Existing Prisma `onDelete: Cascade` relations on Slide and Annotation models may simplify some cascade logic, but explicit deletion is preferred for the defined deletion order

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.2", "2.3", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.2"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3"] },
    { "id": 6, "tasks": ["6.4"] }
  ]
}
```
