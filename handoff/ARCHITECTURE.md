# Architecture

## System Architecture
SlideBot uses a decoupled client-server architecture hosted within a monorepo. 
- The **Frontend** (`apps/web`) is a React SPA built with Vite.
- The **Extension** (`apps/extension`) is a Chrome Manifest V3 extension providing quick access to meetings.
- The **Backend API** (`apps/api`) is an Express.js server providing REST endpoints and a Socket.IO WebSocket server.
- The **Database** is PostgreSQL managed by Prisma ORM.
- **Redis** is used as a caching layer, job queue (BullMQ), and Pub/Sub mechanism for Socket.IO.

## Frontend/Backend Flow
1. User authenticates (via Supabase) and requests to join a presentation deck.
2. The Web client opens connections to two Socket.IO namespaces:
   - `/presenter`: Handles who has authority, slide navigation, and room lifecycle.
   - `/collaboration`: Syncs Yjs awareness (cursors) and canvas annotations.
3. The API validates tokens and manages room membership in memory/Redis.

## Database Structure (Prisma)
- **Users**: Core identities.
- **Decks/Slides**: Static presentation assets.
- **Sessions**: Active live presentations.
- **Annotations**: Persistent collaborative markings on slides (stored per slide/session).

## API Flow
- REST API handles CRUD for Decks, Slides, and historical Sessions.
- WebSockets handle real-time synchronization, emitting events like `slide:goto`, `presenter:handoff`, and `annotation_saved`.

## Caching Layer
- Redis stores active session metadata, connected members, and handles heartbeat tracking across horizontally scaled instances.

## Deployment Architecture
- Prepared to be containerized (Docker) with separate services for the API, Redis, and Postgres. The Web frontend can be statically exported and served via CDN (Vercel/Cloudflare).
