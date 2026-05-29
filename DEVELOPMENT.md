# SlideBot — Development & Manual Testing Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20.x | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9.0 | `npm install -g pnpm` |
| PostgreSQL | 14+ | [postgresql.org](https://www.postgresql.org/download/) or use Supabase |
| Redis | 6+ | [redis.io](https://redis.io/download) or use Upstash |
| Git | latest | [git-scm.com](https://git-scm.com) |

---

## 1. Clone & Install

```bash
git clone https://github.com/Sukesh-Periyasamy/slidebot.git
cd slidebot
pnpm install
```

---

## 2. Environment Setup

### Backend (`apps/api/.env`)

Copy the example and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
```

Required variables:

```env
NODE_ENV=development
PORT=4000
HOST=0.0.0.0

# Database — use your local PostgreSQL or Supabase connection string
DATABASE_URL=postgresql://postgres:password@localhost:5432/slidebot
DIRECT_URL=postgresql://postgres:password@localhost:5432/slidebot

# Supabase (from Supabase Dashboard > Settings > API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_STORAGE_BUCKET=presentations

# Redis
REDIS_URL=redis://localhost:6379

# CORS
CORS_ORIGINS=http://localhost:3000

# JWT
JWT_SECRET=change-me-to-at-least-32-char-secret

# Enable BullMQ workers in dev (optional — needed for room cleanup job)
ENABLE_WORKERS=true
```

### Frontend (`apps/web/.env`)

```bash
cp .env.example apps/web/.env
```

Required variables:

```env
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## 3. Database Setup

```bash
# Generate Prisma client
pnpm --filter @slidebot/api db:generate

# Run migrations (creates all tables)
pnpm --filter @slidebot/api db:migrate

# (Optional) Open Prisma Studio to inspect data
pnpm --filter @slidebot/api db:studio
```

---

## 4. Running the App

### Start both frontend and backend (Turborepo)

```bash
pnpm dev
```

### Start individually

```bash
# API server (port 4000)
pnpm dev:api

# Web frontend (port 3000)
pnpm dev:web
```

### Access the app

- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **Health check**: http://localhost:4000/health

---

## 5. Build & Type Check

```bash
# Full build (all packages)
pnpm build

# Type check only
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format
```

---

## 6. Running Tests

```bash
# Run all tests (API + Web)
pnpm test

# Run API tests only
pnpm --filter @slidebot/api test

# Run Web tests only
pnpm --filter @slidebot/web test

# Watch mode (useful during development)
pnpm --filter @slidebot/web test:watch
```

---

## 7. Manual Testing Guide

### 7.1 Authentication

1. Open http://localhost:3000
2. Click "Login" — you'll be redirected to Supabase Auth
3. Sign up with email/password or use a social provider
4. After login, you should land on the Dashboard

### 7.2 Upload a PDF

1. On the Dashboard, click **"Upload Presentation"**
2. Select a PDF file (max 50MB)
3. Wait for the upload spinner to complete
4. You'll be automatically redirected to the room

### 7.3 Room Features

1. After upload, you're in a live room as the **presenter**
2. Use arrow keys or click to navigate slides
3. Open a second browser tab/incognito window, log in as a different user
4. Navigate to the same room URL — you join as a **viewer**
5. Verify slide sync: when the presenter changes slides, viewers see it in real-time

### 7.4 Room Cleanup — Manual Deletion

1. Go to the **Dashboard** (http://localhost:3000/dashboard)
2. In the "Recent Rooms" section, find a room you own
3. Hover over the room card — a **trash icon** button should appear
4. Click the trash icon
5. A **confirmation dialog** appears showing the deck name and a warning
6. Click **"Delete"** to confirm
7. Verify:
   - The room disappears from the list immediately (no page reload)
   - A success state is shown (no error toast)
   - Refreshing the page confirms the room is gone
   - In Prisma Studio, verify the Room, RoomParticipant, and (if not shared) Deck/Slide/Annotation records are deleted

### 7.5 Room Cleanup — Authorization Check

1. Log in as **User A**, create a room (upload a PDF)
2. Log in as **User B** in a different browser/incognito
3. On User B's dashboard, verify:
   - The delete button is **not visible** on rooms owned by User A
4. (API test) Send a DELETE request as User B to User A's room:
   ```bash
   curl -X DELETE http://localhost:4000/api/v1/rooms/<room-id> \
     -H "Authorization: Bearer <user-b-token>"
   ```
5. Verify you get a **403 Forbidden** response

### 7.6 Room Cleanup — API Endpoint Testing

Use curl or any HTTP client (Postman, Insomnia, HTTPie):

```bash
# Get your auth token (from browser DevTools > Application > Local Storage > sb-*-auth-token)

# Delete a room (as owner)
curl -X DELETE http://localhost:4000/api/v1/rooms/<room-id> \
  -H "Authorization: Bearer <your-token>" \
  -v

# Expected: 204 No Content (empty body)

# Delete with invalid UUID
curl -X DELETE http://localhost:4000/api/v1/rooms/not-a-uuid \
  -H "Authorization: Bearer <your-token>" \
  -v

# Expected: 404 Not Found

# Delete without auth
curl -X DELETE http://localhost:4000/api/v1/rooms/<room-id> -v

# Expected: 401 Unauthorized

# Delete non-existent room
curl -X DELETE http://localhost:4000/api/v1/rooms/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer <your-token>" \
  -v

# Expected: 404 Not Found
```

### 7.7 Room Cleanup — Automatic Expiration

The cleanup job runs daily at 03:00 UTC. To test manually:

1. Set `ENABLE_WORKERS=true` in `apps/api/.env`
2. Start the API server
3. Create a room, then manually backdate its `createdAt` in the database:
   ```sql
   UPDATE rooms SET "createdAt" = NOW() - INTERVAL '11 days' WHERE id = '<room-id>';
   ```
4. Trigger the job manually via BullMQ (or wait for the cron):
   ```bash
   # In a Node REPL or script:
   # const { roomCleanupQueue } = require('./dist/modules/rooms/room-cleanup.job');
   # await roomCleanupQueue.add('room-cleanup', {});
   ```
5. Check the API logs — you should see:
   ```
   Room cleanup job started
   Room cleanup job completed: 1 deleted, 0 failed out of 1 processed
   ```
6. Verify the room and its associated data are deleted from the database

### 7.8 Shared Deck Protection

1. Upload a PDF as User A → creates Room 1 with Deck X
2. Create another room using the same deck (if the app supports it), or manually insert a second Room referencing the same `deckId`
3. Delete Room 1
4. Verify:
   - Room 1 is deleted
   - Deck X and its PDF **still exist** (because Room 2 still references it)
5. Delete Room 2
6. Verify:
   - Room 2 is deleted
   - Deck X and its PDF are **now deleted** (last reference removed)

### 7.9 Active Room Protection

1. Create a room and keep it in "active" status (don't end the session)
2. Backdate its `createdAt` to > 10 days ago
3. Trigger the cleanup job
4. Verify:
   - The active room is **skipped** (not deleted)
   - A warning is logged: "Skipping active room during expired room cleanup"

---

## 8. Useful Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start all apps in dev mode |
| `pnpm dev:api` | Start API only |
| `pnpm dev:web` | Start frontend only |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run all test suites |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without fixing |
| `pnpm clean` | Remove all build artifacts and node_modules |
| `pnpm --filter @slidebot/api db:generate` | Regenerate Prisma client |
| `pnpm --filter @slidebot/api db:migrate` | Run database migrations |
| `pnpm --filter @slidebot/api db:studio` | Open Prisma Studio (DB GUI) |

---

## 9. Troubleshooting

### "Cannot find module '@prisma/client'"

Run `pnpm --filter @slidebot/api db:generate` to regenerate the Prisma client.

### Redis connection refused

Make sure Redis is running locally (`redis-server`) or update `REDIS_URL` to point to your Upstash instance. The app will still start without Redis but real-time features and BullMQ workers will be degraded.

### Port already in use

Kill the process on port 4000/3000 or change the `PORT` in your `.env`.

### BullMQ workers not running in dev

Set `ENABLE_WORKERS=true` in `apps/api/.env`. By default, workers are disabled in development to save Redis quota.

### Prisma migration issues

If you get migration drift errors, reset the database:
```bash
pnpm --filter @slidebot/api db:migrate -- --reset
```
⚠️ This drops all data.

---

## 10. Project Structure

```
slidebot/
├── apps/
│   ├── api/              # Express + Socket.IO backend
│   │   ├── prisma/       # Database schema & migrations
│   │   └── src/
│   │       ├── config/   # Database, Redis, env, logger
│   │       ├── middleware/
│   │       ├── modules/  # Feature modules (rooms, decks, annotations, etc.)
│   │       └── socket/   # Socket.IO handlers
│   ├── web/              # React + Vite frontend
│   │   └── src/
│   │       ├── features/ # Feature-based modules (auth, decks, etc.)
│   │       ├── shared/   # Shared components, hooks, utils
│   │       └── pages/    # Route pages
│   └── extension/        # Chrome extension
├── packages/             # Shared packages (schemas, types, utils, configs)
├── turbo.json            # Turborepo pipeline config
└── package.json          # Root workspace config
```
