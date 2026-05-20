# Project Memory

## Core Philosophy
- **"Figma for live presentations."** The experience should feel premium, deeply collaborative, and highly responsive.
- **Reliability over Animations.** While a modern UI is desired, under no circumstances should animations compromise canvas performance, socket synchronization, or layout stability.
- **Do NOT overbuild AI/Enterprise features.** Focus strictly on the core collaborative presentation loop first.

## Coding Patterns Used
- **Type-Safety:** Heavy usage of `zod` for payload validation at boundaries. Shared schemas in `packages/shared-schemas`.
- **Event-Driven WebSockets:** Explicitly typed Socket.IO payloads using shared interfaces.
- **Graceful Degradation:** Simulating disconnects, grace periods, and state reconciliation (e.g., reconnects send the full snapshot in the `session:join` ACK to self-heal).

## Naming Conventions
- Sockets use colon-separated event names (e.g., `session:join`, `presenter:disconnected`, `slide:goto`).
- Shared packages use the `@slidebot/` prefix.

## Important Assumptions
- **Node Environment:** The backend and testing scripts MUST run on Node >= 20.
- **Socket Disconnects:** Assume transport drops can clear internal Socket.IO states (like `socket.rooms`). Always attach vital identifiers to `socket.data` to persist context through disconnect hooks.

## Development Preferences
- Write strict TypeScript (`tsc --noEmit` should always pass).
- Use `vitest` for all testing. Ensure imports in test files account for variable hoisting (e.g., configure `setupFiles` in `vitest.config.ts` rather than importing inline).
- Keep Turborepo scripts consistent across apps (`dev`, `build`, `lint`, `test`).

## Important Project Knowledge
- **Test Harness:** A specialized multi-user simulation framework exists in `apps/api/src/socket/__tests__/helpers/`. It manages simulated clients, namespace connections, and event recording. Use this for testing any new real-time features.
- **Vitest Environment Validation:** Tests will fail if `.env` mocks are missing. They are globally provided in `apps/api/vitest.config.ts`.
