# SlideBot System Invariants

This document outlines the absolute critical synchronization and collaboration guarantees that must NEVER be violated in the SlideBot system. These invariants form the backbone of trust in our "Figma for live presentations" philosophy. They ensure that what one user sees is deterministically consistent with what everyone else sees.

---

## 1. Presenter Authority Invariants
- **Definition:** Only the active presenter can emit global slide change events (`slide:goto`).
- **Why it matters:** Ensures a cohesive guided experience.
- **Failure consequences:** Viewers could hijack the presentation or accidentally trigger slide changes that disrupt the entire room.
- **Protection:** The server validates the `userId` attached to the socket against the session's current `presenterId` in Redis before broadcasting the event.
- **Testing strategy:** Multi-client integration tests where viewer sockets attempt to emit `slide:goto` and assert that the server rejects or ignores the payload.

## 2. Room State Invariants
- **Definition:** The server is the absolute source of truth for the room's current slide, member list, and status.
- **Why it matters:** Clients joining mid-session must receive the exact current state.
- **Failure consequences:** Split-brain scenarios where users in the same room are out of sync.
- **Protection:** All state-mutating requests (e.g., slide changes) must receive a positive ACK from the server. Upon connection (`session:join`), the server returns a complete state snapshot in the ACK.
- **Testing strategy:** Spin up N clients, trigger rapid state changes, connect an N+1 client, and assert its initial snapshot matches the authoritative server state.

## 3. Annotation Synchronization Invariants
- **Definition:** Annotations are bound strictly to a specific slide ID and session ID.
- **Why it matters:** Prevents drawings from bleeding over to adjacent slides.
- **Failure consequences:** A drawing made on slide 1 appears when navigating to slide 2, ruining the presentation.
- **Protection:** Yjs fragments and Postgres rows include `slideId` as part of the primary key/identifier scheme. The frontend strictly filters rendered objects by the active slide.
- **Testing strategy:** Integration tests that simulate concurrent annotations while changing slides, verifying that annotations only persist to the originally targeted slide.

## 4. Reconnect Recovery Invariants
- **Definition:** A temporary disconnect (<15s) must not cause the presenter to lose authority, and the client must silently reconcile state upon reconnection.
- **Why it matters:** Real-world networks are flaky (train rides, Wi-Fi drops).
- **Failure consequences:** Presenters are kicked out of their own meetings, disrupting the flow.
- **Protection:** The `heartbeat.ts` grace period timer delays auto-promotion/abandonment. `session:join` automatically cancels the timer if the presenter returns and forces local state reconciliation via the server's snapshot.
- **Testing strategy:** `reconnect-recovery.test.ts` drops the engine transport, reconnects, and asserts that the grace period is cancelled and authority is retained.

## 5. WebSocket Ordering Guarantees
- **Definition:** Events emitted from the server must be processed in the exact order they were received by the client.
- **Why it matters:** Ensures sequential consistency of actions (e.g., delete shape X *after* creating shape X).
- **Failure consequences:** Phantom shapes or invalid states if a deletion is processed before creation.
- **Protection:** Socket.IO guarantees TCP-like FIFO ordering on a single connection. SlideBot avoids parallel HTTP overrides for real-time actions.
- **Testing strategy:** `event-recorder.ts` harness tracks timestamps of emitted vs. received payloads to assert strict FIFO execution during simulated bursts.

## 6. Exploration Mode Isolation Guarantees
- **Definition:** When a viewer enters "Exploration Mode" (navigating slides independently), they stop receiving presenter `slide:goto` forced changes until they explicitly "Snap to Presenter".
- **Why it matters:** Gives viewers freedom to review previous slides without being forcibly jerked around.
- **Failure consequences:** Frustrating UX where viewers cannot read past slides.
- **Protection:** The frontend Zustand store disables the listener for `slide:goto` when `isExploring` is true, while still tracking the `presenterSlide` silently in the background.
- **Testing strategy:** Playwright E2E tests verifying that firing global `slide:goto` events does not update the active view for clients in exploration mode.

## 7. Multiplayer Consistency Guarantees
- **Definition:** Simultaneous, conflicting actions (e.g., two users modifying the same shape) must eventually converge to the identical state for all users.
- **Why it matters:** Fundamental requirement for a collaborative canvas.
- **Failure consequences:** Desynchronized canvases requiring a hard page refresh.
- **Protection:** Using Yjs CRDTs (Conflict-Free Replicated Data Types), which mathematically guarantee eventual consistency for concurrent edits without centralized locking.
- **Testing strategy:** `collaboration-sync.test.ts` concurrently fires conflicting Yjs mutations and validates that all clients eventually compute the exact same hash for the canvas state.

## 8. Extension Synchronization Guarantees
- **Definition:** The Chrome Extension popup must perfectly mirror the state of the active SlideBot tab if one exists.
- **Why it matters:** Prevents conflicting actions between the extension and the main web app.
- **Failure consequences:** The extension shows "Join Room" while the tab is already actively presenting, leading to duplicate sessions or confused users.
- **Protection:** Stateless, message-passing architecture (`chrome.runtime.sendMessage`) ensures the extension always queries the active tab for the source of truth upon opening.
- **Testing strategy:** Extension unit tests asserting that mock tabs correctly relay their Zustand state to the popup script.

## 9. Database Persistence Guarantees
- **Definition:** Ephemeral actions (e.g., laser pointers) are never written to the DB. Persistent actions (e.g., shapes) must be reliably saved without blocking real-time collaboration.
- **Why it matters:** Flooding Postgres with 60fps cursor movements would crash the DB.
- **Failure consequences:** Complete backend outage due to connection pool exhaustion.
- **Protection:** Ephemeral data uses volatile Pub/Sub. Persistent data is debounced and synced to Postgres asynchronously.
- **Testing strategy:** Load tests asserting that 20 users moving cursors for 5 minutes results in 0 database writes, while drawing shapes results in bulk upserts.

## 10. State Ownership Rules
- **Definition:** The client owns optimistic UI state; the server owns authoritative verified state.
- **Why it matters:** Required for a snappy UX while preventing malicious exploits.
- **Failure consequences:** Sluggish UI if waiting for round-trips, or exploited state if trusting the client implicitly.
- **Protection:** Clients update Zustand immediately (optimistic). If the server ACK returns an error, the client rolls back to the previous snapshot.
- **Testing strategy:** Simulating latency, firing an invalid action, and verifying the UI snaps back to the correct state upon rejection.

## 11. Eventual Consistency Assumptions
- **Definition:** It is acceptable for clients to temporarily drift by a few milliseconds, but they must converge.
- **Why it matters:** Network latency is physically unavoidable.
- **Failure consequences:** Over-engineering strict locks that freeze the UI.
- **Protection:** Relying on CRDTs and stateless reconciliation on reconnects.
- **Testing strategy:** Network throttling profiles in Playwright tests to ensure the UI remains interactive under 500ms ping.

## 12. Stale Connection Cleanup Guarantees
- **Definition:** Connections that drop silently (e.g., sleep mode) must be detected and removed to prevent "ghost" users in the participant list.
- **Why it matters:** Maintains trust in the "Who is here?" UI.
- **Failure consequences:** Rooms appear full of users who left hours ago.
- **Protection:** The `heartbeat.ts` module uses application-level ping/pongs. 3 missed pongs = immediate eviction and room notification.
- **Testing strategy:** Force-killing a client process and asserting that the server emits a `participant:left` event exactly 30 seconds later.

## 13. Event Idempotency Rules
- **Definition:** Applying the same state-mutating event multiple times must yield the same result as applying it once.
- **Why it matters:** Network retries or duplicated packets (e.g., from BullMQ retries or Socket.IO reconnects) are common.
- **Failure consequences:** Duplicate shapes on the canvas or erratic slide skipping.
- **Protection:** CRDTs natively handle idempotent inserts. Database upserts rely on unique IDs rather than auto-incrementing inserts.
- **Testing strategy:** Firing identical `annotation_saved` payloads sequentially and verifying the Postgres row count does not increase.

## 14. Room Teardown Guarantees
- **Definition:** When the last user leaves a session, all in-memory Redis state for that session must be purged.
- **Why it matters:** Prevents memory leaks in Redis.
- **Failure consequences:** Redis runs out of RAM, crashing the Socket.IO cluster.
- **Protection:** The `roomManager.removeMember` function checks the remaining member count and triggers a cleanup routine if `count === 0`.
- **Testing strategy:** Creating 100 rooms, having all users leave, and asserting that `redis.keys('session:*')` returns an empty array.

## 15. Synchronization Conflict Rules
- **Definition:** If two users edit the exact same property (e.g., shape color) simultaneously, the system must resolve it deterministically without throwing an error.
- **Why it matters:** Prevents app crashes during intense collaboration.
- **Failure consequences:** "An error occurred" modals interrupting the presentation.
- **Protection:** Yjs handles timestamp-based or clientID-based conflict resolution natively.
- **Testing strategy:** E2E concurrent modification tests.

## 16. Frontend/Backend Consistency Guarantees
- **Definition:** Shared types and schemas must be strictly enforced across the network boundary.
- **Why it matters:** Prevents silent runtime failures when the API and Web app drift.
- **Failure consequences:** Frontend expects a string, backend sends a number, React crashes.
- **Protection:** Turborepo enforces `@slidebot/shared-schemas` as a dependency for both. Zod parses all incoming WebSocket payloads at runtime on both ends.
- **Testing strategy:** CI type-checking (`tsc --noEmit`) ensures that a change in a shared schema instantly fails the build if either app doesn't adapt to it.
