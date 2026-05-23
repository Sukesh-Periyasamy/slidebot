# Project Context

## Project Overview
SlideBot is a collaborative multiplayer presentation platform focused on synchronized slide delivery, real-time collaboration, and resilient websocket-based session continuity.

## Current Status
- Repo validation stabilized (`pnpm lint`, `pnpm typecheck`, `pnpm test` passing).
- Alpha deployment infrastructure completed.
- Production hardening completed.
- WebSocket scalability testing completed.
- Render deployment documentation completed.
- Observability strategy finalized.
- Extension popup stabilized.
- RoomPage stabilized.
- Persistent deck storage implemented (Supabase Storage + signed URL retrieval).
- Room hard-refresh recovery for uploaded decks implemented.
- Persistent relational room/deck storage implemented (decks, rooms, room_participants).
- Room URLs decoupled from deck IDs (`/room/:roomId`).
- CI/CD stabilization complete.
- ESLint 9 migration complete.

## Deployment and Operations
- Render is the documented alpha backend deployment target.
- `GET /health` is the canonical health monitoring endpoint.
- Supabase Storage is the alpha upload persistence strategy.
- External uptime monitoring is standardized on periodic health checks.

## Final Repository Status Summary
- Current architecture maturity: stable alpha collaboration platform.
- Current scalability target: ~10,000 concurrent websocket connections per server instance (architecture target).
- Known alpha limitations:
  - annotation persistence/reconciliation remains next-phase work
  - higher concurrency load testing still needed
  - browser extension store publishing not finalized
- Next recommended milestone: **Real Alpha User Testing**

## Next Recommended Work
- real-user feedback collection
- production telemetry integration
- beta onboarding polish
- deployment automation improvements
- load testing at higher concurrency
- browser extension publishing
