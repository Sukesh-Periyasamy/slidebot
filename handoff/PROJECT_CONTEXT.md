# Project Context

## Project Overview
SlideBot — "Figma for live presentations". A collaborative multiplayer presentation platform that enables presenters to share slides and collaborate seamlessly with viewers in real-time.

## Purpose
To provide a highly reliable, low-latency, and interactive live presentation experience with robust reconnect recovery, collaborative annotations, and presenter handoff features.

## Features
- Real-time slide synchronization between presenters and viewers
- Collaborative annotations on slides via canvas
- Presenter handoff capability
- Viewer exploration mode
- Robust session recovery and grace periods for reconnecting presenters

## Current Status
- Phase 1 (Core Pipeline & Static Analysis) is complete.
- Phase 2 (Integration Testing & Hardening) for WebSocket infrastructure is complete.
- Basic API, Web, and Extension scaffolding is complete.
- Advanced WebSocket integration test harness is built and 100% passing.

## Tech Stack
- **Monorepo Manager:** Turborepo
- **Package Manager:** pnpm (>=9.0.0)
- **Runtime:** Node.js (>=20.0.0)
- **Frontend (`@slidebot/web`):** React, Vite, Zustand, Tailwind CSS, Radix UI, Framer Motion, Konva (Canvas), Yjs
- **Backend (`@slidebot/api`):** Express, Socket.IO, Prisma (PostgreSQL), Redis (ioredis, BullMQ), Pino
- **Extension (`@slidebot/extension`):** Vite, CRXJS, React
- **Shared (`packages/*`):** Zod (Schemas), TypeScript
- **Testing:** Vitest, Testing Library, JSDOM

## Folder Structure
```
slidebot/
├── apps/
│   ├── api/          # Express + Socket.IO backend
│   ├── extension/    # Chrome extension
│   └── web/          # React + Vite frontend
├── packages/
│   ├── eslint-config/
│   ├── prettier-config/
│   ├── shared-schemas/
│   ├── shared-types/
│   ├── shared-utils/
│   └── tsconfig/
├── prisma/           # Database schema and migrations
└── handoff/          # Documentation and AI handoff files
```

## Environment Variables Used
- `DATABASE_URL`: PostgreSQL connection string for Prisma.
- `REDIS_URL`: Redis connection string for Socket.IO adapter and BullMQ.
- `JWT_SECRET`: Secret for signing authentication tokens.
- `SUPABASE_URL` / `SUPABASE_KEY`: Supabase integration keys.
- `PORT`: API server port.
- `FRONTEND_URL`: CORS origin for the frontend.

## APIs/Services Integrated
- PostgreSQL (Database)
- Redis (Pub/Sub & Caching)
- Supabase (Auth/Storage)

## Architecture Summary
A modular turborepo where the frontend communicates with the backend via REST for standard operations and Socket.IO for real-time collaboration. The Socket.IO server is split into namespaces (`/presenter` for session lifecycle and navigation, `/collaboration` for Yjs awareness and annotations). A Redis adapter scales WebSocket connections.
