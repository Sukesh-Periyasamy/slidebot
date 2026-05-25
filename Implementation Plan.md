# SlideBot — Phase-by-Phase Production Upgrade Implementation Plan

## CURRENT FOUNDATION (DO NOT REWRITE)

The app is now stabilized after fixing:

* React #185 update-depth crashes
* provider remount loops
* socket/session duplication
* Zustand selector instability
* PDF render recursion
* auth invalidation storms

The current stable ownership model is:

Auth
→ Providers
→ SessionProvider
→ sessionManager
→ socketManager
→ stores
→ UI

This ownership flow MUST remain intact.

DO NOT:

* reintroduce provider remount churn
* add component-local socket ownership
* create broad invalidation patterns
* use object/array Zustand selectors without shallow guards
* trigger store writes from render-sensitive flows
* create duplicate reconnect timers/listeners

Build incrementally only.

---

# PHASE 1 — PLATFORM PRIMITIVES (HIGHEST PRIORITY)

Goal:
Add production-grade realtime infrastructure without destabilizing the current lifecycle.

---

## 1. Presence System

### Create

* `presenceStore.ts`
* `presenceManager.ts`
* `usePresence.ts`

### Features

* online/offline
* idle state
* reconnecting state
* presenter active
* speaking indicator
* last seen timestamps
* cursor active pulse

### Architecture

* ownership in `presenceManager`
* single socket listener attachment
* equality-guarded store writes
* derived UI selectors only

### Requirements

* batch updates
* debounce presence writes
* no per-component listeners
* no array/object literal selectors

### UI

* participant pills
* reconnect indicator
* presenter badge
* idle dimming

---

## 2. Cursor Overlay System

### Create

* `cursorStore.ts`
* `cursorManager.ts`
* `CursorOverlay.tsx`

### Requirements

* isolated overlay layer
* no viewer rerenders from cursor movement
* rAF interpolation
* 20 fps network emission
* 60 fps local interpolation

### Cursor Data

```ts
type CursorState = {
  userId: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  color: string;
  name: string;
  updatedAt: number;
};
```

### Networking

* normalized coordinates
* ephemeral events
* prediction/interpolation
* automatic stale cleanup

### Important

DO NOT:

* store cursor motion in viewer store
* rerender RoomPage on cursor updates
* attach socket listeners in components

---

## 3. Debug + Diagnostics Layer

### Create

* `/debug` route
* `debugStore.ts`
* `socketInspector.ts`
* `renderInspector.ts`
* `listenerInspector.ts`

### Features

* active sockets
* listener counts
* room membership
* reconnect attempts
* render counters
* store mutation tracing
* slow render warnings

### Requirements

* DEV only
* centralized instrumentation
* no production overhead

### Add

```ts
console.count('ROOM_RENDER');
console.count('SLIDE_CANVAS_RENDER');
```

and:

* listener duplication assertions
* reconnect loop detection
* render waterfall logging

---

# PHASE 2 — RECONNECT + OFFLINE HARDENING

Goal:
Make realtime collaboration resilient under network instability.

---

## 4. Offline Queue + Replay

### Create

* `offlineQueue.ts`
* `replayManager.ts`

### Queue Actions

* annotations
* cursor events
* presenter actions
* room joins
* slide changes

### Requirements

* idempotent replay
* deduplicated joins
* optimistic local updates
* sequence IDs
* reconnect reconciliation

### Recovery Flow

```text
disconnect
→ queue actions
→ reconnect
→ snapshot sync
→ replay missing deltas
→ reconcile state
```

---

## 5. Heartbeat + Reconnect Analytics

### Add

* reconnect reason tracking
* RTT measurement
* heartbeat visualization
* reconnect quality scoring

### Metrics

* reconnect duration
* dropped event count
* listener duplication count
* socket reconnect count

---

# PHASE 3 — ADVANCED ANNOTATION ENGINE

Goal:
Turn annotations into a production collaborative drawing system.

---

## 6. Stroke Engine Rewrite (Incremental)

### Create

* `strokeEngine.ts`
* `annotationProtocol.ts`

### Features

* smoothing
* pressure-ready schema
* chunked stroke sync
* per-user layers
* undo/redo
* eraser
* laser trails
* locking

### Payload

```ts
type StrokeChunk = {
  strokeId: string;
  seq: number;
  points: number[];
  tool: ToolType;
  color: string;
  width: number;
};
```

### Requirements

* optimistic rendering
* reconnect replay
* delta sync only
* no full-canvas rebroadcasts

---

## 7. Annotation Persistence

### Create

* `annotationPersistenceManager.ts`

### Features

* snapshot compression
* schema versioning
* lazy restore
* incremental saves

### Important

Restore MUST:

* avoid render loops
* avoid whole-store replacement
* avoid canvas invalidation storms

---

# PHASE 4 — PERFORMANCE MODE

Goal:
Support large decks and low-powered devices.

---

## 8. Viewer Performance Controller

### Create

* `performanceController.ts`

### Features

* adaptive render resolution
* memory-aware cleanup
* page eviction
* thumbnail virtualization
* render prioritization

### Metrics

* render duration
* memory pressure
* active canvases
* dropped frames

### Important

Viewer metrics must NOT:

* trigger rerender storms
* live inside RoomPage state
* invalidate viewer lifecycle

---

## 9. Render Queue System

### Create

* `renderQueue.ts`

### Features

* prioritized rendering
* background pre-render
* cancellation
* render deduplication

### Priorities

1. current slide
2. adjacent slides
3. thumbnails
4. background cache

---

# PHASE 5 — MULTI-ROOM SCALABILITY

Goal:
Support scalable room switching and room caching.

---

## 10. Room Snapshot System

### Create

* `roomSnapshotManager.ts`

### Features

* room resume
* lazy hydration
* inactive room freezing
* bounded memory cache

### Requirements

* no live socket duplication
* single active room ownership
* snapshot-only inactive rooms

---

## 11. Room Prefetching

### Features

* preload room metadata
* preload thumbnails
* preload participant snapshots

### Important

Prefetch MUST:

* avoid socket connections
* avoid session startup
* avoid PDF render bootstraps

---

# PHASE 6 — AI FEATURES

Goal:
Add AI assistance without coupling to viewer lifecycle.

---

## 12. AI Assistant Service Layer

### Create

* `aiService.ts`
* `aiTaskManager.ts`

### Features

* slide summaries
* speaker notes
* flashcards
* agenda generation
* Q&A assistant

### Requirements

* streaming responses
* cancellable tasks
* retry support
* optimistic UI

### Important

AI MUST:

* consume snapshots
* run outside render lifecycle
* avoid blocking viewer

---

# PHASE 7 — TESTING + REGRESSION PROTECTION

Goal:
Prevent lifecycle regressions permanently.

---

## 13. Lifecycle Integration Tests

### Add Tests For

* single session startup
* single socket connect
* single room join
* bounded render counts
* reconnect replay correctness
* StrictMode stability

### Add Assertions

```ts
expect(socketConnectCount).toBe(1);
expect(sessionStartCount).toBe(1);
expect(listenerCount).toBeLessThan(MAX);
```

---

## 14. Zustand Stability Rules

### Add ESLint Rule / Utility

Disallow:

```ts
useStore((s) => ({
  a: s.a
}));
```

Require:

* split selectors
* `useShallow`
* memoized derived arrays

---

# FINAL CONSTRAINTS

NEVER REINTRODUCE:

* provider remount ownership
* render-driven store writes
* duplicate session startup
* duplicate listeners
* socket ownership inside components
* broad query invalidation
* unstable selectors

KEEP:

* one-way ownership
* singleton managers
* isolated overlays
* equality-guarded writes
* render isolation
* bounded subscriptions

This is now a production collaborative realtime system.
All future work must preserve lifecycle stability first.
