# SlideBot

Realtime collaborative presentation platform built with:

* React + Vite
* TypeScript
* Socket.IO
* Supabase
* PDF.js
* Turborepo

---

# Live URLs

## Frontend

https://slidebot-web.vercel.app

## Backend API

https://slidebot-api-mvb8.onrender.com

---

# Core Features

* Supabase Authentication
* PDF Upload
* Persistent PDF Storage (Supabase Storage)
* Realtime Collaborative Rooms
* Slide Synchronization
* Presenter Controls
* PDF.js Rendering
* Refresh-Resilient Rooms
* Signed URL Security
* Socket.IO Realtime Sync

---

# Routes

## Frontend Routes

```txt
/
/login
/dashboard
/room/:roomId
/settings
/404
```

## Backend API Routes

```txt
GET    /health

POST   /api/v1/decks/upload
GET    /api/v1/decks/:id

POST   /api/v1/rooms
GET    /api/v1/rooms/:id
POST   /api/v1/rooms/:id/join
POST   /api/v1/rooms/:id/leave
```

---

# Environment Variables

## Frontend (`apps/web/.env`)

```env
VITE_API_URL=https://slidebot-api-mvb8.onrender.com
VITE_SOCKET_URL=https://slidebot-api-mvb8.onrender.com

VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

---

## Backend (`apps/api/.env`)

```env
CLIENT_URL=https://slidebot-web.vercel.app

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET=YOUR_JWT_SECRET

SUPABASE_STORAGE_BUCKET=presentations
SUPABASE_SIGNED_URL_EXPIRES_SEC=3600

REDIS_URL=rediss://default:YOUR_TOKEN@desired-grackle-133645.upstash.io:6379
```

---

# Local Development

## Install dependencies

```bash
pnpm install
```

## Run web

```bash
pnpm --filter @slidebot/web dev
```

## Run API

```bash
pnpm --filter @slidebot/api dev
```

---

# Deployment

## Frontend

* Platform: Vercel
* Framework: Vite

## Backend

* Platform: Render

## Storage

* Supabase Storage

## Realtime

* Upstash Redis

---

# Current Architecture

```txt
User
→ Upload PDF
→ API Upload Endpoint
→ Supabase Storage
→ Deck Record (Postgres)
→ Room Record (Postgres)
→ Room Participants (Postgres)
→ PDF.js Rendering
→ Socket.IO Slide Sync
```

---

# Current MVP Status

Implemented:

* Auth
* Upload
* Persistent storage
* Signed URLs
* Persistent deck metadata (DB)
* Persistent room metadata (DB)
* Persistent room participants (DB)
* Room routing
* PDF rendering
* Slide sync
* Refresh resilience

Planned:

* Presenter handoff
* Live annotations
* Multiplayer controls
* Analytics
* AI features

---

# Tech Stack

## Frontend

* React
* Vite
* TypeScript
* Zustand
* TailwindCSS
* TanStack Query
* PDF.js

## Backend

* Node.js
* Express
* Socket.IO
* Supabase
* Redis

## Infra

* Vercel
* Render
* Upstash Redis
* Supabase

---

# License

MIT
