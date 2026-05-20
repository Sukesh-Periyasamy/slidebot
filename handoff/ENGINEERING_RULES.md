# SlideBot Engineering Rules & Constraints

This document defines the strict engineering constraints, coding rules, and anti-patterns that **ALL** contributors (human or AI) must follow when developing SlideBot. 
SlideBot is a "Figma for live presentations" platform. Reliability, low latency, and multiplayer synchronization take precedence over feature bloat or complex animations.

## 1. Architecture Rules
- **Decoupled Monorepo:** API (`apps/api`), Frontend (`apps/web`), and Extension (`apps/extension`) must remain strictly decoupled. They can only share code through `packages/shared-*`.
- **Database Access:** Only `apps/api` is allowed to query the Prisma database directly.
- **Namespaces:** Real-time logic MUST be split into `/presenter` (low-frequency state, navigation, lifecycle) and `/collaboration` (high-frequency Yjs, presence, annotations). Do not mix these domains.

## 2. WebSocket Event Conventions
- **Explicit Typing:** All Socket.IO payloads must be strictly typed using Zod schemas and TypeScript interfaces defined in `@slidebot/shared-schemas` and `@slidebot/shared-types`.
- **Naming:** Events must be colon-separated for domains (e.g., `session:join`, `presenter:handoff`) or underscore-separated for raw actions (e.g., `annotation_saved`).
- **Acks:** All client-to-server requests that alter state must use acknowledgments (ACKs) containing `{ ok: boolean, error?: string, data?: any }`.

## 3. React Rendering Rules
- **Minimize Re-renders:** Slide components and canvas layers must be heavily memoized (`React.memo`, `useMemo`, `useCallback`). A multiplayer cursor movement should NEVER re-render the entire slide or toolbars.
- **Component Granularity:** Keep components small. Isolate stateful hooks to the exact component that requires them.

## 4. Zustand State Management Rules
- **Atomic Selectors:** Always use atomic selectors when pulling state from Zustand stores to prevent unnecessary component re-renders (e.g., `useStore(state => state.activeSlide)` instead of `useStore()`).
- **Store Segregation:** Keep UI state (e.g., open modals) separate from Synchronization state (e.g., current presenter, room members).

## 5. TypeScript Strictness Requirements
- **No `any`:** The use of `any` is strictly forbidden unless interacting with a completely untyped third-party library. Use `unknown` and narrow it via Zod instead.
- **Strict Mode:** `tsconfig.json` `strict: true` is non-negotiable. Code must pass `tsc --noEmit` locally and in CI.

## 6. Monorepo Package Boundaries
- Apps cannot import from other apps.
- `shared-utils` cannot import from `shared-schemas` or `shared-types` if it creates circular dependencies.
- Avoid polluting `shared-*` packages with app-specific logic (e.g., don't put Express middlewares in `shared-utils`).

## 7. Extension Isolation Rules
- **Minimal Permissions:** The Chrome Extension must request the absolute minimum permissions in Manifest V3.
- **DOM Isolation:** The extension popup and content scripts must not rely on the host page's CSS. Use Tailwind with strict scoping if injecting UI.
- **Stateless Communication:** Extension-to-Webapp messaging must be stateless and fail gracefully.

## 8. Synchronization Guarantees
- **Event Ordering:** The server is the ultimate source of truth for `slide:goto` and room lifecycle. 
- **CRDTs for Annotations:** Use Yjs for high-frequency collaborative data (like drawing and cursors) to guarantee eventual consistency without server deadlocks.
- **Grace Periods:** Presenter disconnects must trigger a 15-second grace period before auto-promoting or terminating the session.

## 9. Testing Requirements
- **Integration over Unit:** Emphasize integration tests for WebSockets using the custom test harness in `apps/api/src/socket/__tests__/helpers`.
- **E2E Tests:** Critical paths (Join Room -> Change Slide -> Draw) must have Playwright E2E coverage.
- **Vitest Validation:** All tests must pass sequentially and concurrently. Use isolated environments (`node` vs `jsdom`).

## 10. Performance Constraints
- **Bundle Size:** Keep the frontend bundle small. Lazy load heavy libraries (like Konva or Yjs) if they are not needed on the landing page.
- **Event Loop Lag:** Do not block the Node.js event loop in the API. Heavy operations must be offloaded to BullMQ workers or paginated.

## 11. Annotation Engine Constraints
- **Performance First:** The Konva canvas must utilize `listening={false}` on static shapes to optimize hit-graph performance.
- **Debouncing:** High-frequency cursor events must be throttled (e.g., 30-50ms) before broadcasting.
- **Ephemeral vs Persistent:** Differentiate ephemeral actions (laser pointer) from persistent actions (pen drawing). Ephemeral actions bypass the Postgres database and are strictly Pub/Sub.

## 12. Reconnect Recovery Guarantees
- **Client-Side Backoff:** Clients must use exponential backoff when attempting to reconnect.
- **State Reconciliation:** Upon successful `session:join` after a reconnect, the client must reconcile its local state with the server's authoritative ACK payload, discarding local stale data.
- **Ghost Cleanup:** The server's custom heartbeat (`heartbeat.ts`) must forcefully disconnect clients that fail to respond within 10 seconds.

## 13. Code Review Checklist
- [ ] Does this degrade canvas rendering performance?
- [ ] Is the WebSocket payload strictly validated by Zod?
- [ ] Are Zustand selectors atomic?
- [ ] Does this handle network drop-offs gracefully?
- [ ] Is the new code covered by the integration test harness?

## 14. Forbidden Anti-Patterns
- ❌ Putting heavy business logic in React components (move to hooks/services).
- ❌ Using `setTimeout` for synchronization instead of explicit WebSocket ACKs.
- ❌ Passing the entire Zustand state object into a component.
- ❌ Mutating Prisma or Redis state directly without a transaction or lock when race conditions exist.
- ❌ Over-engineering with AI features before the core collaborative loop is stable.

## 15. Git Workflow Rules
- Work in short-lived feature branches (`feature/`, `bugfix/`, `chore/`).
- Never push directly to `main`.
- All PRs must pass the `turbo run lint`, `turbo run typecheck`, and `turbo run test` CI pipeline before merging.

## 16. Commit Message Conventions
- Follow the Conventional Commits specification:
  - `feat: [description]` for new features
  - `fix: [description]` for bug fixes
  - `chore: [description]` for maintenance/dependencies
  - `test: [description]` for adding/updating tests
  - `docs: [description]` for documentation updates
