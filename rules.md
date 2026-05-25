# SlideBot Development Rules (`RULES.md`)

## PURPOSE

This file defines the mandatory engineering rules for SlideBot.

All future development MUST follow these rules automatically without requiring repeated prompts.

The project is a production realtime collaborative presentation system built with:

* React 18
* TypeScript
* Zustand
* Socket.IO
* PDF.js
* Supabase Auth
* TanStack Query
* Node.js API

The architecture has already been stabilized after fixing:

* React #185 infinite render loops
* provider remount churn
* unstable Zustand selectors
* duplicate socket/session ownership
* PDF render recursion
* auth invalidation storms
* reconnect/listener duplication

These rules exist to prevent regressions.

---

# CORE ARCHITECTURE

## Ownership Flow (MUST NEVER CHANGE)

Auth
→ Providers
→ SessionProvider
→ sessionManager
→ socketManager
→ stores
→ UI

This ownership direction is STRICTLY one-way.

DO NOT introduce reverse ownership flows.

---

# ABSOLUTE PROHIBITIONS

## NEVER:

### React / Lifecycle

* remount providers unnecessarily
* trigger store writes during render
* create render/store feedback loops
* use unstable useEffect dependencies
* create ResizeObserver render loops
* duplicate startup ownership
* create duplicate reconnect timers

### Zustand

* return object literals from selectors
* return array literals from selectors
* subscribe to entire stores unnecessarily
* create broad rerender surfaces

### Socket.IO

* attach socket listeners inside components
* create duplicate listeners
* create multiple socket ownership paths
* reconnect aggressively without guards
* duplicate room joins

### Query / Data

* invalidate the entire query cache broadly
* refetch aggressively on token refresh
* trigger cascading invalidations
* couple queries to unstable lifecycle state

### Viewer / Canvas

* rerender viewer on cursor movement
* rerender PDF canvas unnecessarily
* update viewer store continuously during rendering
* invalidate viewer lifecycle from overlays

---

# REQUIRED PATTERNS

## Zustand Rules

### ALWAYS prefer split selectors:

```ts
const currentPage = useViewerStore((s) => s.currentPage);
const zoom = useViewerStore((s) => s.zoom);
```

### NEVER do this:

```ts
useViewerStore((s) => ({
  currentPage: s.currentPage,
  zoom: s.zoom,
}));
```

### Arrays MUST use shallow guards:

```ts
const members = useSyncStore(useShallow(selectMembers));
```

### Derived arrays MUST use memoization:

```ts
const topMembers = useMemo(
  () => members.slice(0, 3),
  [members]
);
```

---

# SOCKET OWNERSHIP RULES

## Single ownership only

Socket lifecycle ownership exists ONLY in:

* `SessionProvider`
* `sessionManager`
* `socketManager`

DO NOT:

* connect sockets inside components
* disconnect sockets inside components
* add reconnect timers inside hooks
* attach listeners repeatedly

---

# VIEWER / PDF RULES

## Render-sensitive flows

DO:

* use equality guards before store writes
* use imperative store reads inside render callbacks
* isolate overlays from PDF rendering

DO NOT:

* subscribe render callbacks to changing store values
* update scale repeatedly during render
* trigger rerender loops from ResizeObserver

---

# REALTIME RULES

## Presence / Cursor / Annotation systems MUST:

* use isolated stores
* use throttled networking
* use equality-guarded updates
* avoid RoomPage rerenders
* use requestAnimationFrame for high-frequency motion

Cursor movement MUST NEVER rerender:

* RoomPage
* PDF canvas
* thumbnail viewer

---

# QUERY RULES

## Cache invalidation MUST be scoped

GOOD:

```ts
queryClient.invalidateQueries({
  queryKey: ['rooms'],
});
```

BAD:

```ts
queryClient.invalidateQueries();
```

---

# PERFORMANCE RULES

## High-frequency updates MUST:

* use refs where possible
* avoid React state
* avoid store churn
* avoid rerender storms

Use:

* requestAnimationFrame
* throttling
* debouncing
* interpolation

---

# DEBUGGING RULES

## When a bug appears:

Follow this order:

1. ownership flow
2. render triggers
3. Zustand selector stability
4. socket lifecycle
5. query invalidation
6. reconnect behavior
7. render/store feedback loops

DO NOT immediately rewrite architecture.

---

# DEV INSTRUMENTATION

KEEP enabled during development:

* render counters
* listener assertions
* reconnect tracing
* lifecycle tracing
* store mutation tracing

Examples:

```ts
console.count('ROOM_RENDER');
console.count('SLIDE_CANVAS_RENDER');
```

---

# REQUIRED VALIDATION AFTER EVERY CHANGE

Run:

```bash
pnpm --filter @slidebot/web typecheck
pnpm --filter @slidebot/web test
pnpm --filter @slidebot/web lint

pnpm --filter @slidebot/api typecheck
pnpm --filter @slidebot/api test
pnpm --filter @slidebot/api lint
```

Then manually validate:

* room loading
* dashboard loading
* socket stability
* reconnect behavior
* annotation rendering
* PDF rendering
* auth stability

---

# GIT RULES

After EVERY completed feature or phase:

```bash
git add .
git commit -m "feat(scope): description"
git push origin main
```

Examples:

```bash
git commit -m "feat(realtime): add cursor overlay system"
git commit -m "fix(viewer): prevent pdf render recursion"
```

---

# PHASE DEVELOPMENT RULE

Development MUST proceed phase-by-phase only.

Rules:

1. complete one phase fully
2. validate locally
3. fix all regressions
4. commit
5. push
6. THEN move to next phase

DO NOT mix unfinished phases together.

---

# MOST IMPORTANT RULE

Preserve lifecycle stability at all costs.

Priority order:

1. deterministic behavior
2. ownership correctness
3. render isolation
4. bounded subscriptions
5. reconnect safety
6. performance
7. new features

This is a production realtime collaborative system — not a demo app.
