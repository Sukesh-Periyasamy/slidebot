# Decisions

## Technical Decisions Made
- **Monorepo (Turborepo):** Selected to allow seamless sharing of Zod schemas and TypeScript types between the API, Web Frontend, and Chrome Extension. This ensures end-to-end type safety.
- **Vitest Workspaces:** Chosen over Jest for native ESM support, out-of-the-box Vite compatibility, and significantly faster execution times. Environments are isolated per app (Node for API, JSDOM for Web/Extension).
- **Socket.IO Namespaces:** Real-time logic is split into `/presenter` (session lifecycle, slide navigation) and `/collaboration` (high-frequency Yjs annotations and cursor movements). This prevents heavy canvas data from blocking critical presentation events.
- **Custom WebSocket Test Harness:** Instead of standard Supertest, a custom harness using actual `socket.io-client` pools was built to properly test concurrency, race conditions, and disconnects.
- **Socket.IO Redis Adapter:** Pre-configured for horizontal scalability, allowing multiple Node.js instances to coordinate rooms.

## Why technologies were selected
- **Zustand:** Picked for frontend state management due to its minimal boilerplate and high performance (avoiding unnecessary re-renders).
- **Yjs:** Chosen for CRDT-based collaborative annotations to automatically handle conflict resolution without central server bottlenecks.
- **Konva:** Used for the annotation canvas for optimized 2D rendering performance.

## Tradeoffs
- **Custom Test Simulators vs Cypress/Playwright:** We invested heavily in custom Node.js-based socket simulators for integration testing rather than relying solely on E2E browser tests. *Tradeoff*: Requires more upfront harness code, but yields much faster, less flaky tests for network edge cases (like simulated TCP drops).

## Architecture Decisions
- Disconnect handlers in Socket.IO rely on `socket.data.currentSessionId` instead of `socket.rooms`, as `socket.rooms` is immediately cleared by the adapter upon unexpected transport drops.
- A manual `heartbeat.ts` ping/pong system is layered on top of Socket.IO to reliably detect stale connections and manage presenter grace periods (15 seconds before auto-promotion/abandonment).
