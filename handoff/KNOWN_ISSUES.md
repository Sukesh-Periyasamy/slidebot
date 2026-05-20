# Known Issues & Technical Debt

## Existing Bugs
- None currently affecting the `main` branch. The test suites pass 100%.

## Technical Debt
- **Testing Architecture:** While the WebSocket test harness is highly effective, scaling it to test hundreds of simultaneous connections might trigger local event loop bottlenecks in Node. The current tests are capped at ~20 simulated clients to prevent arbitrary timeout failures.
- **REST API Coverage:** The test coverage is heavily biased towards WebSockets at the moment. Standard REST endpoints require additional unit tests.

## Performance Issues
- **Canvas Rendering (Anticipated):** As annotation persistence is developed, rendering thousands of collaborative strokes in Konva may require path simplification or batching optimizations. We must ensure this does not block the React main thread.

## Temporary Workarounds
- **Socket Disconnect Room Resolution:** Socket.io drops the contents of `socket.rooms` instantly upon a transport close (`engine.close()`), making it hard to broadcast `participant:left` in the `disconnect` hook. 
  - *Workaround:* We store `currentSessionId` and `currentDeckId` inside `socket.data` upon joining a room. If `socket.rooms` is empty on disconnect, we fallback to reconstructing the room string manually using `socket.data`.
- **Vitest Mock Hoisting:** `vi.mock()` for the `annotationService` was causing test timeouts because module loaders processed it incorrectly when imported dynamically via `setup.ts`. 
  - *Workaround:* `setup.ts` is strictly injected via `vitest.config.ts` (`setupFiles`) to guarantee correct hoisting execution order before the API server initializes.
