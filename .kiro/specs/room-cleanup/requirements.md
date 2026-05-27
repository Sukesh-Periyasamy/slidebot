# Requirements Document

## Introduction

Room Cleanup provides manual and automatic deletion of rooms and their associated uploaded documents (PDFs) in SlideBot. Users can manually delete rooms from the dashboard, and rooms older than 10 days are automatically purged to reclaim database and storage space.

## Glossary

- **Room**: A presentation session entity linking a presenter to a deck, stored in the `rooms` table
- **Deck**: A PDF document uploaded by a user, stored in the `decks` table with its file in Supabase Storage
- **Dashboard**: The main UI view showing "Recent Rooms" with deck names and action buttons
- **Cleanup_Service**: The backend service responsible for automatic deletion of expired rooms
- **Storage_Bucket**: The Supabase Storage bucket holding uploaded PDF files
- **Room_Owner**: The user who created the room (the presenter)
- **TTL**: Time-to-live; the maximum age (10 days) before a room is automatically deleted

## Requirements

### Requirement 1: Manual Room Deletion

**User Story:** As a room owner, I want to delete a room from my dashboard, so that I can remove presentations I no longer need and free up space.

#### Acceptance Criteria

1. WHEN the Room_Owner clicks the delete button on a room, THE Dashboard SHALL display a confirmation dialog that identifies the room by its deck name and warns that deletion is permanent before proceeding with deletion
2. WHEN the Room_Owner confirms deletion, THE API SHALL delete the Room record and all associated RoomParticipant records from the database
3. WHEN a Room is deleted and no other Room references the same Deck, THE API SHALL delete the associated Deck record and its PDF file from the Storage_Bucket
4. IF the deletion of the PDF file from the Storage_Bucket fails, THEN THE API SHALL log the error and still complete the database record deletion
5. WHEN a Room is successfully deleted, THE Dashboard SHALL remove the room from the displayed list without requiring a full page reload
6. WHEN a non-owner user attempts to delete a Room, THE API SHALL return a 403 Forbidden response
7. IF the Room_Owner attempts to delete a Room whose status is "active", THEN THE API SHALL end the room session before performing the deletion

### Requirement 2: Automatic Room Expiration

**User Story:** As a system administrator, I want rooms older than 10 days to be automatically deleted, so that the database does not accumulate stale data and storage costs remain controlled.

#### Acceptance Criteria

1. THE Cleanup_Service SHALL delete all Room records where the `createdAt` timestamp is more than 10 days (240 hours) before the current time in UTC
2. WHEN the Cleanup_Service deletes an expired Room, THE Cleanup_Service SHALL also delete the associated Deck record and its PDF file from the Storage_Bucket
3. WHEN the Cleanup_Service deletes an expired Room, THE Cleanup_Service SHALL also delete all associated RoomParticipant records
4. THE Cleanup_Service SHALL run on a scheduled interval of once per day
5. IF the Cleanup_Service encounters an error deleting a specific room or its associated storage file, THEN THE Cleanup_Service SHALL log the error including the room ID and continue processing remaining expired rooms
6. THE Cleanup_Service SHALL process expired rooms in batches of no more than 100 rooms per batch to avoid database transactions exceeding 30 seconds
7. IF a Room has a status of "active", THEN THE Cleanup_Service SHALL skip that room regardless of its age and log a warning indicating the room was skipped

### Requirement 3: Delete Button UI

**User Story:** As a room owner, I want a clearly visible delete button on each room card in the dashboard, so that I can easily identify and remove rooms.

#### Acceptance Criteria

1. THE Dashboard SHALL display a delete button with a trash icon on each room card for rooms where the current user is the Room_Owner
2. THE Dashboard SHALL hide the delete button on room cards where the current user is not the Room_Owner
3. WHEN the delete button is hovered or receives keyboard focus, THE Dashboard SHALL display a tooltip with the text "Delete room" within 500 milliseconds
4. WHILE a deletion request is in progress, THE Dashboard SHALL disable the delete button and replace the trash icon with a spinner animation
5. THE Dashboard SHALL render the delete button with an accessible label of "Delete room" so that screen readers can identify its purpose

### Requirement 4: Cascade Deletion of Uploaded Documents

**User Story:** As a room owner, I want the uploaded PDF to be deleted when I delete a room, so that orphaned files do not consume storage space.

#### Acceptance Criteria

1. WHEN a Room is deleted (manually or automatically), THE API SHALL remove the Deck's PDF file from the Storage_Bucket using the stored `storagePath`
2. WHEN a Room is deleted, THE API SHALL delete all Slide records associated with the Deck
3. WHEN a Room is deleted, THE API SHALL delete all Annotation and AnnotationSnapshot records associated with the Deck's slides
4. IF a Deck is referenced by multiple Room records, THEN THE API SHALL only delete the Deck and its PDF when the last Room referencing that Deck is deleted
5. WHEN all associated data is successfully deleted, THE API SHALL return a success response to the client
6. THE API SHALL perform cascade deletions in the order: Annotations → AnnotationSnapshots → Slides → Deck storage file → Deck record → RoomParticipants → Room record

### Requirement 5: Deletion API Endpoint

**User Story:** As a frontend developer, I want a REST API endpoint for room deletion, so that the dashboard can trigger deletions programmatically.

#### Acceptance Criteria

1. THE API SHALL expose a `DELETE /api/v1/rooms/:id` endpoint that accepts a UUID path parameter identifying the room to delete
2. WHEN a valid room ID is provided by the Room_Owner, THE API SHALL delete the room and all associated data and return a 204 No Content response with an empty body
3. WHEN the `:id` path parameter is not a valid UUID or does not match an existing room, THE API SHALL return a 404 Not Found response with an error message indicating the room was not found
4. WHEN an unauthenticated request is made (missing or invalid authentication token), THE API SHALL return a 401 Unauthorized response
5. WHEN an authenticated user who is not the Room_Owner requests deletion, THE API SHALL return a 403 Forbidden response
6. THE API SHALL complete the deletion atomically so that either all associated data (Room, RoomParticipant, Deck, and storage file) is removed or none is removed
7. THE API SHALL respond to the deletion request within 5 seconds under normal operating conditions
