# Tasks

## Completed Tasks
- [x] Monorepo workspace configuration (Turborepo, pnpm).
- [x] Shared package creation (Zod schemas, types, utils).
- [x] Testing infrastructure setup (Vitest workspaces, JSDOM/Node).
- [x] Continuous Integration setup (GitHub Actions, Dependabot).
- [x] WebSocket testing harness creation (`room-simulator`, `reconnect-simulator`).
- [x] WebSocket reliability hardening (reconnects, ghost connection cleanup, handoffs).

## Pending Tasks
- [ ] Implement Playwright End-to-End (E2E) Testing.
- [ ] Build Chrome Extension Popup UI.
- [ ] Build Thumbnail Sidebar Navigation (virtualized).
- [ ] Assemble the complete RoomPage experience (slide viewer, annotation canvas, toolbars).
- [ ] Implement robust annotation persistence (Prisma + Yjs reconciliation).
- [ ] Optimize canvas performance for heavy annotation loads.

## Priority Levels
- **High**: Chrome Extension Popup UI, Thumbnail Sidebar Navigation.
- **Medium**: Complete RoomPage assembly, E2E Testing.
- **Low**: Advanced AI features (prioritize reliability over AI).

## TODO Items
- Audit frontend component re-renders to ensure multiplayer synchronization does not degrade canvas performance.
- Expand Vitest coverage for standard REST API endpoints once built out.

## Future Improvements
- Refine the grace period auto-promotion algorithm for abandoned rooms.
- Improve Redis heartbeat cleanup timing for edge cases with severe network jitter.
