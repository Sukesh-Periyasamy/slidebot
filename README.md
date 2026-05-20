<div align="center">

<!-- ═══════════════════════ HERO ═══════════════════════ -->

<img src="docs/assets/slidebot-logo.png" alt="SlideBot Logo" width="96" height="96" style="border-radius:20px;" />

<h1>
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=700&size=38&pause=1200&color=6173F2&center=true&vCenter=true&width=600&lines=SlideBot;Multiplayer+Presentations;Real%E2%80%91Time+Collaboration;Sync.+Present.+Collaborate." alt="SlideBot typing banner" />
</h1>

**Transforming passive screen sharing into synchronized real-time collaborative presentations.**

<br/>

[![CI](https://github.com/your-org/slidebot/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/slidebot/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-6173F2?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)
[![Stars](https://img.shields.io/github/stars/your-org/slidebot?style=flat-square&color=6173F2)](https://github.com/your-org/slidebot/stargazers)

<br/>

[**Live Demo**](https://app.slidebot.app) · [**Docs**](https://docs.slidebot.app) · [**Discord**](https://discord.gg/slidebot) · [**Report Bug**](https://github.com/your-org/slidebot/issues) · [**Request Feature**](https://github.com/your-org/slidebot/discussions)

<br/>

<!-- Screenshot placeholder — replace with actual screenshot -->
<img src="docs/assets/hero-screenshot.png" alt="SlideBot dashboard preview" width="860" style="border-radius:16px; box-shadow: 0 24px 80px rgba(0,0,0,0.4);" />

</div>

---

## 📖 Table of Contents

<details>
<summary>Click to expand</summary>

- [🌟 What is SlideBot?](#-what-is-slidebot)
- [✨ Key Features](#-key-features)
- [🔄 Product Workflow](#-product-workflow)
- [🏗️ System Architecture](#️-system-architecture)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Folder Structure](#-folder-structure)
- [🚀 Getting Started](#-getting-started)
- [🔐 Environment Variables](#-environment-variables)
- [🧩 Chrome Extension Setup](#-chrome-extension-setup)
- [📡 WebSocket Event Model](#-websocket-event-model)
- [💡 Product Philosophy](#-product-philosophy)
- [🗺️ Roadmap](#️-roadmap)
- [📸 Screenshots](#-screenshots)
- [🤝 Contributing](#-contributing)
- [☁️ Deployment](#️-deployment)
- [🔭 Scalability Vision](#-scalability-vision)
- [📄 License](#-license)

</details>

---

## 🌟 What is SlideBot?

> **"Figma for live presentations."**

Traditional online presentations are broken. One person shares their screen, everyone else watches a pixelated video stream, and collaboration is non-existent.

**SlideBot replaces video-based screen sharing with a synchronized presentation engine** — every participant sees the same slides, in real-time, with pixel-perfect fidelity, annotations, and collaborative controls.

<br/>

<table>
<tr>
<td width="50%">

### 😞 The Old Way

```
Presenter → Share Screen
Everyone  → Watch blurry video
Viewer    → Can't control anything
Presenter → Read chat for questions
Session   → No annotation possible
Handoff   → Impossible mid-session
```

**Result:** Passive, disengaging, broken

</td>
<td width="50%">

### 🚀 The SlideBot Way

```
Presenter → Upload PDF to SlideBot
Everyone  → Joins a sync room
Viewer    → Gets live slide updates
Anyone    → Annotates collaboratively
Presenter → Hands off seamlessly
Explorer  → Navigates independently
```

**Result:** Active, synchronized, collaborative

</td>
</tr>
</table>

<br/>

Instead of streaming pixels, SlideBot synchronizes **state** — making presentations a first-class collaborative experience like Google Docs, but for live presentations.

---

## ✨ Key Features

<details open>
<summary><strong>🔄 Synchronized Real-Time Presentations</strong></summary>

<br/>

Every slide change is broadcast to all participants via WebSocket with **sequence-numbered events** to handle out-of-order delivery. Reconnection recovery ensures no one gets lost.

- Sub-100ms slide synchronization latency
- Sequence number tracking (no missed events)
- Room-based session management via Redis
- Automatic reconnection with state recovery

</details>

<details>
<summary><strong>✏️ Collaborative Annotation Engine</strong></summary>

<br/>

Draw, highlight, add arrows and text — all synced in real-time across all participants via Konva.js canvas layers over the slide viewer.

| Tool         | Description                               |
| ------------ | ----------------------------------------- |
| ✏️ Freehand  | Smooth Catmull-Rom spline drawing         |
| 🖊️ Highlight | Semi-transparent rectangular highlights   |
| ➡️ Arrow     | Directional arrow annotations             |
| 🔤 Text      | Text labels anywhere on the slide         |
| ⚡ Laser     | Ephemeral laser pointer with fading trail |
| 🧹 Eraser    | Remove annotations selectively            |

</details>

<details>
<summary><strong>👑 Presenter Handoff</strong></summary>

<br/>

Transfer presenter authority **instantly** to any participant with zero presentation interruption.

- Server-authoritative transfer (validated, not optimistic)
- All clients update simultaneously on `presenter:changed`
- Former presenter enters explore mode automatically
- 30-second grace period if presenter disconnects (auto-restore on reconnect)
- Atomic Redis state update preserves current slide

</details>

<details>
<summary><strong>🔭 Exploration Mode</strong></summary>

<br/>

Viewers can break away from the presenter and navigate slides independently — then snap back with one click.

- **Auto-enter:** Navigation while following → auto-enter explore mode
- **Presenter position pill:** Always shows where presenter is
- **Snap-back banner:** Animated call-to-action to return
- **Zero interruption:** Exploring users don't disrupt the presentation

</details>

<details>
<summary><strong>👥 Multiplayer Collaboration</strong></summary>

<br/>

Real-time collaborative cursors, presence awareness, and participant management.

- Live cursor positions (30fps throttle, normalised coordinates)
- Per-user presence colour
- Participant list with connection status
- Exploration / following status per user

</details>

<details>
<summary><strong>🧩 Chrome Extension — Meet Overlay</strong></summary>

<br/>

A lightweight Chrome Extension (Manifest V3) injects a floating SlideBot toolbar into Google Meet — no tab switching required.

- Shadow DOM isolation (zero CSS conflict with Meet)
- Meet session auto-detection via URL + DOM observation
- FAB (Floating Action Button) → expands to control panel
- Session code entry and live slide navigation
- Presenter controls without leaving Meet

</details>

---

## 🔄 Product Workflow

### End-to-End Session Flow

```mermaid
sequenceDiagram
  actor Presenter
  actor Viewer
  participant Web as SlideBot Web App
  participant API as REST API
  participant WS as WebSocket Server
  participant DB as PostgreSQL / Redis

  Presenter->>Web: Upload PDF
  Web->>API: POST /api/v1/decks (multipart)
  API->>DB: Store deck + extract slides
  API-->>Web: Deck ID + slide metadata

  Presenter->>WS: socket.emit('session:create', { deckId })
  WS->>DB: Create session in Redis
  WS-->>Presenter: session:state { sessionId, presenterId }

  Viewer->>WS: socket.emit('session:join', { deckId })
  WS->>DB: Add viewer to room
  WS-->>Viewer: session:state (full snapshot)
  WS-->>Presenter: participant:joined

  Presenter->>WS: socket.emit('slide:goto', { slideIndex })
  WS->>DB: Update currentSlide + increment sequenceNum
  WS-->>Viewer: slide:changed { slideIndex, sequenceNum }
  Note over Viewer: Auto-renders new slide

  Presenter->>WS: annotation_start + annotation_draw
  WS-->>Viewer: annotation_started + annotation_drew (realtime)

  Presenter->>WS: socket.emit('presenter:handoff', { toUserId })
  WS->>DB: Atomically transfer presenter
  WS-->>Presenter: presenter:changed (now viewer)
  WS-->>Viewer: presenter:changed (now presenter)
```

### Exploration Mode State Machine

```mermaid
stateDiagram-v2
  [*] --> FOLLOWING: Join session

  FOLLOWING --> EXPLORING: User navigates independently
  FOLLOWING --> FOLLOWING: Presenter changes slide

  EXPLORING --> FOLLOWING: Snap back to presenter
  EXPLORING --> FOLLOWING: User catches up to presenter slide
  EXPLORING --> EXPLORING: User navigates locally

  FOLLOWING --> [*]: Leave session
  EXPLORING --> [*]: Leave session
```

### Presenter Handoff Flow

```mermaid
flowchart LR
  A([Presenter clicks\nHand Off]) --> B{Select\nParticipant}
  B --> C[emit presenter:handoff]
  C --> D{Server validates\ncurrent presenter}
  D -->|Invalid| E[Error: Not authorized]
  D -->|Valid| F[Atomic Redis update\nnew presenterId]
  F --> G[Broadcast presenter:changed\nto ALL clients]
  G --> H([New presenter\ngets controls])
  G --> I([Former presenter\ngoes to explore mode])
  G --> J([Viewers: see\nnew presenter badge])
```

---

## 🏗️ System Architecture

### High-Level Overview

```mermaid
graph TB
  subgraph Client["🌐 Client Layer"]
    WEB["SlideBot Web App\nReact + Vite + Tailwind"]
    EXT["Chrome Extension\nManifest V3 + Shadow DOM"]
  end

  subgraph Backend["⚙️ Backend Layer"]
    API["REST API\nExpress + TypeScript"]
    WS["WebSocket Server\nSocket.IO Multi-Namespace"]
  end

  subgraph Data["🗄️ Data Layer"]
    PG[(PostgreSQL\nPrisma ORM)]
    REDIS[(Redis\nSession State + Pub/Sub)]
    S3[(Object Storage\nPDF + Assets)]
  end

  subgraph Infra["☁️ Infrastructure"]
    CDN["CDN\nCloudflare"]
    AUTH["Auth\nSupabase"]
  end

  WEB -->|REST| API
  WEB -->|WebSocket| WS
  EXT -->|Messages| WEB
  EXT -->|REST| API
  API --> PG
  API --> S3
  WS --> REDIS
  WS --> PG
  AUTH -->|JWT| API
  AUTH -->|JWT| WS
  CDN --> WEB
```

### WebSocket Namespace Architecture

```mermaid
graph LR
  subgraph Namespaces["Socket.IO Namespaces"]
    NS1["/presenter\nSlide sync + session management"]
    NS2["/collaboration\nAnnotations + cursors + laser"]
    NS3["/ (default)\nPresence + connection health"]
  end

  subgraph Redis["Redis Adapter"]
    PUB["Publisher\nBroadcast to room"]
    SUB["Subscriber\nReceive from other instances"]
    STATE["Room State\nSession snapshot"]
  end

  NS1 <--> PUB
  NS2 <--> PUB
  PUB --> SUB
  NS1 --> STATE
```

### Data Flow — Slide Synchronization

```mermaid
flowchart TD
  P([Presenter\nchanges slide]) --> CS[Client emits\nslide:goto event]
  CS --> SV{Socket.IO\nServer}
  SV --> RM[RoomManager\nRedis update]
  RM --> SEQ[Increment\nsequenceNum]
  SEQ --> BC[Broadcast\nslide:changed to room]
  BC --> V1([Viewer 1\nauto-render])
  BC --> V2([Viewer 2\nif not exploring])
  BC --> V3([Viewer 3\nexploring → ignores])
  V3 -.->|Snap back| BC
```

---

## 🛠️ Tech Stack

<div align="center">

### Frontend

[![React](https://img.shields.io/badge/React_18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Zustand](https://img.shields.io/badge/Zustand-000000?style=for-the-badge&logo=react&logoColor=white)](https://zustand-demo.pmnd.rs)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white)](https://framer.com/motion)
[![Konva.js](https://img.shields.io/badge/Konva.js-Canvas-0D9488?style=for-the-badge)](https://konvajs.org)

### Backend

[![Node.js](https://img.shields.io/badge/Node.js_20-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO_4-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://socket.io)
[![Prisma](https://img.shields.io/badge/Prisma_5-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)

### Infrastructure

[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build)

### Extension

[![Chrome MV3](https://img.shields.io/badge/Chrome_Extension_MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Vite CRX](https://img.shields.io/badge/@crxjs/vite--plugin-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://crxjs.dev)

</div>

---

## 📁 Folder Structure

```
slidebot/                          # Turborepo monorepo root
├── 📄 package.json                # Workspace root — scripts, engines
├── 📄 pnpm-workspace.yaml         # pnpm workspace definition
├── 📄 turbo.json                  # Turborepo pipeline config
├── 📄 .env.example                # Root environment variables template
│
├── apps/
│   ├── web/                       # 🌐 Frontend React app (Vite)
│   │   ├── src/
│   │   │   ├── app/               # App root, router, providers
│   │   │   ├── features/
│   │   │   │   ├── auth/          # Supabase auth (store, hooks, guard)
│   │   │   │   ├── annotation/    # Konva.js annotation engine
│   │   │   │   │   ├── types/     # Discriminated union types
│   │   │   │   │   ├── store/     # Zustand annotation store
│   │   │   │   │   ├── hooks/     # useDrawing, useLaserPointer, useAnnotationSync
│   │   │   │   │   └── components/# AnnotationCanvas, AnnotationToolbar
│   │   │   │   ├── sync/          # Sync engine (presenter handoff, exploration)
│   │   │   │   │   ├── store/     # SyncStore (session, members, handoff state)
│   │   │   │   │   ├── hooks/     # useSyncEngine, useExplorationMode, useHandoff
│   │   │   │   │   └── components/# PresenterControls, HandoffModal, SnapBackBanner
│   │   │   │   ├── viewer/        # PDF viewer (PDF.js + canvas)
│   │   │   │   │   ├── store/     # viewerStore (page, zoom, fullscreen)
│   │   │   │   │   └── hooks/     # usePdfRenderer, usePdfLoader, useNavigation
│   │   │   │   ├── collaboration/ # Socket client singleton
│   │   │   │   ├── dashboard/     # Dashboard page
│   │   │   │   ├── upload/        # PDF upload flow
│   │   │   │   └── landing/       # Landing page
│   │   │   ├── lib/               # Shared utilities (supabase, apiClient, pdfWorker)
│   │   │   └── shared/            # Shared components, layouts
│   │   └── vite.config.ts
│   │
│   ├── api/                       # ⚙️ Express REST API
│   │   ├── src/
│   │   │   ├── app.ts             # Express app factory
│   │   │   ├── server.ts          # HTTP server entry
│   │   │   ├── middleware/        # Auth, error, rate-limit, CORS
│   │   │   ├── modules/
│   │   │   │   ├── auth/          # Auth routes + Supabase JWT validation
│   │   │   │   ├── decks/         # PDF upload + deck management
│   │   │   │   ├── slides/        # Slide metadata + thumbnail
│   │   │   │   ├── sessions/      # Session REST endpoints
│   │   │   │   └── annotations/   # Annotation persistence
│   │   │   ├── socket/
│   │   │   │   ├── index.ts       # Socket.IO init + Redis adapter
│   │   │   │   ├── room-manager.ts# Redis-backed session state
│   │   │   │   └── namespaces/
│   │   │   │       ├── presenter.ts      # Slide sync + handoff
│   │   │   │       └── collaboration.ts  # Annotations + cursors
│   │   │   └── prisma/
│   │   │       └── schema.prisma  # Full database schema
│   │   └── Dockerfile
│   │
│   └── extension/                 # 🧩 Chrome Extension (MV3)
│       ├── manifest.json          # MV3 manifest
│       ├── src/
│       │   ├── background/
│       │   │   └── service-worker.ts    # Message routing, tab tracking
│       │   ├── content/
│       │   │   ├── index.ts             # Content script entry
│       │   │   ├── meet/
│       │   │   │   └── detector.ts      # Meet SPA navigation detection
│       │   │   └── overlay/
│       │   │       ├── mount.ts         # Shadow DOM + React mount
│       │   │       ├── Overlay.tsx      # React root (draggable panel)
│       │   │       └── components/      # FloatingButton, SlideBotPanel, SlideControls
│       │   ├── popup/             # Extension popup UI
│       │   └── shared/
│       │       ├── messages.ts    # Typed message contracts
│       │       ├── storage.ts     # chrome.storage helpers
│       │       └── constants.ts   # Meet URL regex, IDs, alarm names
│       └── vite.config.ts
│
├── packages/
│   ├── shared-types/              # 📦 TypeScript types shared across apps
│   ├── shared-utils/              # 📦 Pure utility functions
│   ├── shared-ui/                 # 📦 Shared React UI components
│   └── eslint-config/             # 📦 Shared ESLint config
│
├── tooling/
│   └── tsconfig/                  # Shared TypeScript base configs
│
├── docker/
│   └── docker-compose.yml         # Local dev: Postgres + Redis
│
└── .github/
    └── workflows/
        ├── ci.yml                 # Lint, typecheck, test on PR
        └── deploy.yml             # Deploy on main push
```

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have:

| Tool    | Version   | Install                            |
| ------- | --------- | ---------------------------------- |
| Node.js | `>= 20.x` | [nodejs.org](https://nodejs.org)   |
| pnpm    | `>= 9.x`  | `npm i -g pnpm`                    |
| Docker  | Latest    | [docker.com](https://docker.com)   |
| Git     | Latest    | [git-scm.com](https://git-scm.com) |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-org/slidebot.git
cd slidebot
```

### Step 2 — Install Dependencies

```bash
pnpm install
```

> pnpm workspaces automatically installs all packages across the monorepo.

### Step 3 — Start Infrastructure (Postgres + Redis)

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:

- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`

### Step 4 — Configure Environment Variables

```bash
# Copy all .env examples
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Edit with your values (see Environment Variables section below)
```

### Step 5 — Set Up the Database

```bash
# Run Prisma migrations
pnpm --filter @slidebot/api db:push

# (Optional) Seed with test data
pnpm --filter @slidebot/api db:seed
```

### Step 6 — Start All Apps

```bash
# Start everything in parallel (recommended)
pnpm dev
```

Or run individually:

```bash
# Terminal 1 — Backend API + WebSocket
pnpm --filter @slidebot/api dev

# Terminal 2 — Frontend Web App
pnpm --filter @slidebot/web dev
```

### Step 7 — Open the App

| Service       | URL                          |
| ------------- | ---------------------------- |
| 🌐 Web App    | http://localhost:3000        |
| ⚙️ API        | http://localhost:4000        |
| 📊 API Health | http://localhost:4000/health |

---

## 🔐 Environment Variables

### Backend (`apps/api/.env`)

```bash
# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL="postgresql://slidebot:slidebot@localhost:5432/slidebot_dev"

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL="redis://localhost:6379"

# ── Supabase Auth ─────────────────────────────────────────────────────────────
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"      # Server-side only
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"

# ── Server ────────────────────────────────────────────────────────────────────
PORT=4000
NODE_ENV="development"
CORS_ORIGINS="http://localhost:3000,https://app.slidebot.app"

# ── Storage (for PDF uploads) ─────────────────────────────────────────────────
STORAGE_PROVIDER="local"                                        # "local" | "s3"
STORAGE_LOCAL_DIR="./uploads"
# AWS_S3_BUCKET="your-bucket"                                   # Uncomment for S3
# AWS_ACCESS_KEY_ID="..."
# AWS_SECRET_ACCESS_KEY="..."
# AWS_REGION="us-east-1"

# ── JWT ───────────────────────────────────────────────────────────────────────
JWT_SECRET="super-secret-jwt-key-change-in-production"
```

### Frontend (`apps/web/.env`)

```bash
# ── API ───────────────────────────────────────────────────────────────────────
VITE_API_URL="http://localhost:4000"

# ── Supabase ──────────────────────────────────────────────────────────────────
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"

# ── Feature Flags ─────────────────────────────────────────────────────────────
VITE_ENABLE_ANALYTICS="false"
```

> ⚠️ **Never commit `.env` files.** They are gitignored by default.

---

## 🧩 Chrome Extension Setup

### Development Build

```bash
# Build extension in watch mode
pnpm --filter @slidebot/extension dev
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select `apps/extension/dist/`

The SlideBot icon will appear in your Chrome toolbar.

### Test Meet Integration

1. Open [meet.google.com](https://meet.google.com) and join a meeting
2. The SlideBot FAB (💜 button) will appear in the bottom-right corner
3. Click it to open the SlideBot panel
4. Sign in and enter a session code from the web app

### Production Build

```bash
pnpm --filter @slidebot/extension build
# Creates a zip at apps/extension/dist/slidebot-extension.zip
```

---

## 📡 WebSocket Event Model

### `/presenter` Namespace — Session & Slide Sync

| Direction | Event                    | Payload                                   | Description                            |
| --------- | ------------------------ | ----------------------------------------- | -------------------------------------- |
| `emit`    | `session:join`           | `{ deckId }`                              | Join or create session                 |
| `emit`    | `session:create`         | `{ deckId, totalSlides }`                 | Create new session (becomes presenter) |
| `emit`    | `slide:goto`             | `{ sessionId, slideIndex, sequenceNum }`  | Navigate to slide (presenter only)     |
| `emit`    | `presenter:handoff`      | `{ sessionId, toUserId }`                 | Transfer presenter authority           |
| `emit`    | `viewer:explore`         | `{ sessionId }`                           | Enter exploration mode                 |
| `emit`    | `viewer:follow`          | `{ sessionId }`                           | Return to following presenter          |
| `emit`    | `session:end`            | `{ sessionId }`                           | End session (presenter only)           |
| `on`      | `session:state`          | Full session snapshot                     | Received on join (idempotent sync)     |
| `on`      | `slide:changed`          | `{ slideIndex, sequenceNum }`             | Presenter navigated                    |
| `on`      | `presenter:changed`      | `{ newPresenterId, previousPresenterId }` | Authority transferred                  |
| `on`      | `presenter:disconnected` | `{ presenterId }`                         | Presenter lost connection              |
| `on`      | `presenter:reconnected`  | `{ presenterId }`                         | Presenter back within grace period     |
| `on`      | `participant:joined`     | `{ member }`                              | New user joined                        |
| `on`      | `participant:left`       | `{ userId }`                              | User left                              |
| `on`      | `session:ended`          | —                                         | Presenter ended session                |

---

### `/collaboration` Namespace — Annotations & Cursors

| Direction | Event                | Payload                                                | Description                   |
| --------- | -------------------- | ------------------------------------------------------ | ----------------------------- |
| `emit`    | `annotation_start`   | `{ annotationId, tool, color, slideId, initialPoint }` | Start drawing                 |
| `emit`    | `annotation_draw`    | `{ slideId, points[] }`                                | Stream incremental points     |
| `emit`    | `annotation_end`     | `{ slideId, annotation }`                              | Commit completed annotation   |
| `emit`    | `annotation_delete`  | `{ slideId, annotationId }`                            | Delete annotation             |
| `emit`    | `cursor_move`        | `{ sessionId, slideId, position }`                     | Broadcast cursor (30fps)      |
| `emit`    | `laser_move`         | `{ sessionId, slideId, trail[] }`                      | Broadcast laser trail (60fps) |
| `emit`    | `laser_end`          | `{ sessionId, slideId }`                               | Laser pointer released        |
| `on`      | `annotation_started` | Remote user's annotation start                         | Render live stroke            |
| `on`      | `annotation_drew`    | Remote user's points                                   | Append to live stroke         |
| `on`      | `annotation_ended`   | Committed annotation                                   | Commit to store               |
| `on`      | `annotation_deleted` | `{ annotationId }`                                     | Remove annotation             |
| `on`      | `cursor_update`      | `{ userId, position }`                                 | Update remote cursor          |
| `on`      | `laser_update`       | `{ userId, trail[] }`                                  | Update laser trail            |
| `on`      | `laser_ended`        | `{ userId }`                                           | Remove laser pointer          |

---

### Reconnection & Recovery Model

```
Client disconnects
    │
    ├─── Reconnect within 30s ──► Server restores session state
    │                              Client receives session:state snapshot
    │                              Sequence number catches up missed events
    │
    └─── Reconnect after 30s ───► New participant flow
                                   Full session:state on join
```

---

## 💡 Product Philosophy

### 🔁 State, Not Pixels

SlideBot synchronizes **presentation state** (slide index, annotations, presenter), not video pixels. This enables:

- **10× lower bandwidth** than screen share
- **Perfect fidelity** on any screen resolution
- **Accessible** to participants with slow connections

### ⚡ Low-Latency First

Every architectural decision is made with latency in mind:

- Redis for session state (sub-millisecond reads)
- Cursor positions throttled at 30fps (not 60fps) to balance smoothness vs bandwidth
- Sequence numbers prevent stale event processing
- Optimistic local updates before server confirmation

### 🤝 Presenter Authority Model

The presenter is the **single source of truth** for the current slide. This prevents desynchronization and maintains a coherent presentation experience. Exploration mode explicitly separates the viewer's local state from the presenter's authoritative state.

### 🛡️ Reliability Over Features

SlideBot is built to be reliable. Reconnection recovery, grace periods for presenter disconnection, and idempotent session joins mean presentations don't break when network conditions vary.

---

## 🗺️ Roadmap

### Phase 1 — Foundation ✅ (Current)

- [x] Monorepo setup with Turborepo + pnpm
- [x] Express API with Socket.IO multi-namespace
- [x] Supabase Auth (Google OAuth + JWT)
- [x] PDF upload + slide extraction
- [x] PDF.js slide viewer with DPR-aware canvas rendering
- [x] Synchronized slide navigation (`/presenter` namespace)
- [x] Redis-backed `RoomManager` for session state
- [x] Presenter handoff with 30-second grace period recovery
- [x] Exploration mode with snap-back
- [x] Annotation engine (freehand, highlight, arrow, text, laser, eraser)
- [x] Collaborative cursors + laser pointer
- [x] Chrome Extension MV3 (Shadow DOM, Meet detector, overlay)

### Phase 2 — Polish 🔧 (Next)

- [ ] Annotation persistence to PostgreSQL
- [ ] Slide thumbnail strip in sidebar
- [ ] Fullscreen presentation mode
- [ ] Keyboard shortcuts (←, →, F, L for laser)
- [ ] Export annotated slides as PDF
- [ ] Session recording playback
- [ ] Zoom + Teams extension support
- [ ] Mobile-responsive viewer
- [ ] Dark/light theme system

### Phase 3 — Scale 🚀

- [ ] Yjs CRDT integration for conflict-free annotation merging
- [ ] Horizontal scaling with Redis pub/sub adapter
- [ ] Kubernetes deployment manifests
- [ ] Multi-region WebSocket deployment
- [ ] WebRTC data channels (ultra-low latency P2P mode)
- [ ] Real-time transcript overlay (Speech-to-Text)
- [ ] Analytics dashboard for presentations

### Future — AI Features 🤖

- [ ] AI slide summarization during sessions
- [ ] Auto-generated Q&A from session annotations
- [ ] Smart slide transition suggestions
- [ ] Presenter coaching (pacing, engagement score)
- [ ] Meeting notes auto-generated from session

---

## 📸 Screenshots

> 🖼️ Screenshots will be added as features are completed. Run locally to see the full UI.

<table>
<tr>
<td align="center" width="50%">
<img src="docs/assets/screenshot-dashboard.png" alt="Dashboard" width="100%" style="border-radius:8px"/>
<br/><strong>Dashboard</strong>
</td>
<td align="center" width="50%">
<img src="docs/assets/screenshot-room.png" alt="Presentation Room" width="100%" style="border-radius:8px"/>
<br/><strong>Presentation Room</strong>
</td>
</tr>
<tr>
<td align="center" width="50%">
<img src="docs/assets/screenshot-annotations.png" alt="Annotation Mode" width="100%" style="border-radius:8px"/>
<br/><strong>Collaborative Annotations</strong>
</td>
<td align="center" width="50%">
<img src="docs/assets/screenshot-extension.png" alt="Meet Overlay" width="100%" style="border-radius:8px"/>
<br/><strong>Google Meet Overlay</strong>
</td>
</tr>
</table>

---

## 🤝 Contributing

We welcome contributions of all kinds — bug fixes, new features, docs, design, or ideas!

### Development Workflow

```bash
# 1. Fork the repository
# 2. Clone your fork
git clone https://github.com/<your-username>/slidebot.git

# 3. Create a feature branch
git checkout -b feat/annotation-undo-redo

# 4. Make your changes

# 5. Run checks before committing
pnpm lint
pnpm typecheck
pnpm test

# 6. Commit using Conventional Commits
git commit -m "feat(annotation): add undo/redo with history stack"

# 7. Push and open a PR
git push origin feat/annotation-undo-redo
```

### Branch Naming

| Prefix      | Use Case      | Example                       |
| ----------- | ------------- | ----------------------------- |
| `feat/`     | New feature   | `feat/presenter-timer`        |
| `fix/`      | Bug fix       | `fix/cursor-drift-on-resize`  |
| `docs/`     | Documentation | `docs/websocket-events`       |
| `refactor/` | Code refactor | `refactor/room-manager-types` |
| `chore/`    | Tooling, deps | `chore/bump-socket-io-4.8`    |
| `test/`     | Tests         | `test/annotation-store-unit`  |

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Examples:**

```
feat(sync): add sequence number deduplication on reconnect
fix(extension): prevent double overlay mount on Meet SPA navigation
docs(readme): add WebSocket event model tables
chore(deps): upgrade socket.io to 4.8.1
```

### Pull Request Guidelines

- ✅ Reference the issue (e.g. `Closes #42`)
- ✅ Add a clear description of what changed and why
- ✅ Keep PRs focused — one feature/fix per PR
- ✅ Add tests for new behaviour where applicable
- ✅ All CI checks must pass before merging
- ✅ Request a review from a maintainer

### Code Standards

- **TypeScript strict mode** — no `any`, no implicit returns
- **No magic numbers** — use named constants
- **Functional components only** — no class components
- **Zustand for state** — no prop drilling
- **Named exports** — no default exports for components

---

## ☁️ Deployment

### Frontend (Vercel)

```bash
# Connect GitHub repo to Vercel
# Set build command:
pnpm --filter @slidebot/web build

# Set output directory:
apps/web/dist

# Set environment variables in Vercel dashboard
```

### Backend + WebSocket (Railway / Fly.io)

```bash
# Build the API image
docker build -f apps/api/Dockerfile -t slidebot-api .

# Deploy to Railway
railway up

# Or deploy to Fly.io
fly deploy --config apps/api/fly.toml
```

### Scaling WebSocket Servers

SlideBot uses the **Socket.IO Redis Adapter** for horizontal scaling. Multiple WebSocket server instances communicate through Redis pub/sub, so clients on different instances are in the same rooms.

```bash
# Scale to 3 WebSocket instances
# All share the same Redis and communicate via pub/sub
WS_INSTANCE_COUNT=3 railway up
```

### Database Migrations

```bash
# Run migrations in production
pnpm --filter @slidebot/api db:migrate:deploy
```

---

## 🔭 Scalability Vision

### Current Architecture (MVP)

Single WebSocket server + Redis adapter handles **~10,000 concurrent connections** per instance.

### Phase 2 — Horizontal Scaling

```
                    ┌─────────────────────────────┐
                    │       Load Balancer           │
                    │   (sticky sessions / IP hash) │
                    └────────────┬────────────────┘
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        WS Instance 1    WS Instance 2    WS Instance 3
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                          Redis Pub/Sub
                      (broadcast across instances)
```

### Phase 3 — CRDT Integration (Yjs)

Annotations will migrate from **operational transforms** (current: server-authoritative event broadcast) to **CRDTs via Yjs** for conflict-free merging without a central authority.

```
Current:   Client → Server → Broadcast → All clients
Future:    Client → Yjs CRDT merge → Broadcast diff → All clients
```

This enables:

- **Offline-first** annotation editing
- **P2P sync** via WebRTC data channels
- **Conflict-free concurrent editing** (no presenter authority needed for annotations)

### Enterprise Scalability Targets

| Metric                         | MVP         | Phase 3        |
| ------------------------------ | ----------- | -------------- |
| Concurrent users/session       | 50          | 500            |
| Sessions per server            | 200         | 2,000          |
| Annotation latency             | <100ms      | <30ms          |
| Reconnect recovery             | 30s         | Instant (CRDT) |
| Annotation conflict resolution | Server-wins | CRDT-merge     |

---

## 📄 License

```
MIT License

Copyright (c) 2026 SlideBot Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

## 🙏 Built by the Community, for the Community

<br/>

SlideBot is a passion project born from the frustration of every bad screen-sharing experience.<br/>
We believe **collaboration should be a first-class citizen** in every meeting.

<br/>

**If SlideBot has helped you, please give it a ⭐ on GitHub.**

<br/>

[![Star History](https://api.star-history.com/svg?repos=your-org/slidebot&type=Date&theme=dark)](https://star-history.com/#your-org/slidebot)

<br/>

---

<p>
  Made with ❤️ by contributors worldwide
  <br/>
  <sub>
    <a href="https://github.com/your-org/slidebot/graphs/contributors">See all contributors →</a>
  </sub>
</p>

<br/>

```
The future of presentations is collaborative.
Not a single person presenting to a passive audience —
but a room of people building understanding together.

That's what SlideBot is building.
```

<br/>

[![Discord](https://img.shields.io/badge/Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/slidebot)
[![Twitter](https://img.shields.io/badge/Follow_@slidebotapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/slidebotapp)
[![Email](https://img.shields.io/badge/hello@slidebot.app-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hello@slidebot.app)

</div>
