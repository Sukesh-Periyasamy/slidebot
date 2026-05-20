# Tasks

## Completed Tasks
- [x] Monorepo workspace configuration (Turborepo, pnpm).
- [x] Shared package creation (Zod schemas, types, utils).
- [x] Testing infrastructure setup (Vitest workspaces, JSDOM/Node).
- [x] Continuous Integration setup (GitHub Actions, Dependabot).
- [x] WebSocket testing harness creation (`room-simulator`, `reconnect-simulator`).
- [x] WebSocket reliability hardening (reconnects, ghost connection cleanup, handoffs).
- [x] Hardened Playwright E2E suite with deterministic sync assertions and real auth persistence.
- [x] Build Chrome Extension Popup UI (Meet detection, authentication flows, and session controls).
- [x] Assemble RoomPage experience and ThumbnailSidebar navigation.
- [x] Production Hardening Phase:
  - [x] Resolved WebSocket listener memory leaks in React hooks (`useSyncEngine.ts` and `useAnnotationSync.ts`).
  - [x] Added backend annotation flood rate-limiting (120 events/s/socket token bucket).
  - [x] Guarded extension background worker and UI overlay shadow DOM against double-registration/mounting.
  - [x] Created stability, reconnect storm, memory, and scalability testing suites.

## Pending Tasks
- [ ] Implement robust annotation persistence (Prisma + Yjs reconciliation).
- [ ] Optimize canvas performance for heavy annotation loads.

## Priority Levels
- **High**: Annotation persistence & Prisma synchronization.
- **Medium**: E2E Testing of annotation canvas and persistence.
- **Low**: Advanced AI features.

## TODO Items
- Audit frontend canvas component re-renders to ensure high-frequency annotations do not degrade frame rates.
- Expand Vitest coverage for standard REST API endpoints once built out.

## Future Improvements
- Refine the grace period auto-promotion algorithm for abandoned rooms.
- Improve Redis heartbeat cleanup timing for edge cases with severe network jitter.
