# Render Deployment Guide for SlideBot (Alpha)

## Overview
This guide provides step‑by‑step instructions to deploy the **SlideBot backend** (Express + Socket.IO) to **Render**. The backend serves REST endpoints and the real‑time WebSocket server required by the web app and Chrome extension.

## Prerequisites
| Tool | Version |
|------|---------|
| Node.js | >= 20.x |
| pnpm | >= 9.x |
| Render account | – |
| Supabase project | – |

## 1. Prepare the Repository
```bash
# Clone and navigate to the monorepo root
git clone https://github.com/your-org/slidebot.git
cd slidebot

# Install all workspace dependencies
pnpm install

# Build the monorepo (produces `dist/` in each app)
pnpm turbo run build
```
The backend will be compiled to `apps/api/dist/`.

## 2. Create a Render Service
1. Log in to **Render** and click **New → Web Service**.
2. **Name**: `slidebot-api`
3. **Region**: Select the closest region to your users.
4. **Branch**: `main` (or the branch you want to auto‑deploy from).
5. **Root Directory**: `apps/api`
6. **Build Command**: `pnpm install && pnpm turbo run build --filter @slidebot/api`
7. **Start Command**: `node dist/index.js`
8. **Environment**: Set **Node Version** to `20.x`.
9. **Instance Type**: `Starter` (1 CPU, 512 MiB) is sufficient for alpha.
10. Click **Create Web Service**.

## 3. Configure Environment Variables
Add the following variables in the Render dashboard under **Environment → Environment Variables**. Values are taken from your Supabase project and secret management system.

| Variable | Description |
|----------|-------------|
| `PORT` | Port Render expects the service to listen on (default `10000`). |
| `DATABASE_URL` | PostgreSQL connection string (Supabase). |
| `REDIS_URL` | Redis instance URL (Render can provision a free Redis add‑on). |
| `SUPABASE_URL` | Supabase API base URL. |
| `SUPABASE_ANON_KEY` | Public anon key (frontend also needs this). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service‑role key – **secret** (backend only). |
| `JWT_SECRET` | Secret for signing session JWTs. |
| `CORS_ORIGINS` | Comma‑separated list of allowed origins, e.g. `https://app.slidebot.app,https://frontend.vercel.app`. |
| `STORAGE_PROVIDER` | `local` or `s3`. For alpha we use `local`. |
| `STORAGE_LOCAL_DIR` | Path where uploaded PDFs are stored, e.g. `./uploads`. |
| `NODE_ENV` | `production` |

## 4. Health Check & WebSocket Settings
- **Health Check Path**: `/health` – Render probes this endpoint every 30 s.
- **Expected response**: `200 OK` with `{ "status": "ok", "uptime": <seconds>, "timestamp": <ms> }`.
- **Monitoring recommendation**: Point Better Stack or UptimeRobot at `/health` and ping every 5 minutes to catch regressions early without adding load.
- **WebSocket Timeout**: Render terminates idle connections after 5 minutes. The SlideBot client automatically reconnects, but you may increase the timeout in the Render service settings under **Advanced → WebSocket Timeout**.
- **Persistent Redis**: Render’s managed Redis add‑on persists data across restarts, satisfying the requirement for session state durability.

> Free-tier hosting providers may suspend idle instances or affect long-lived websocket stability during inactivity periods. SlideBot automatically attempts reconnect recovery when websocket interruption occurs.

## 5. Deploy & Verify
After the service is created Render will start a build. When it finishes:
```bash
# Verify the health endpoint
curl https://slidebot-api.onrender.com/health
# Expected response: { "status": "ok", "uptime": 12.34, "timestamp": 1710000000000 }
```
Open the URL in a browser and ensure the API returns JSON and the WebSocket endpoint is reachable:
```bash
wscat -c wss://slidebot-api.onrender.com
# You should see a successful connection banner.
```

## 6. Deployment Validation Checklist
- [ ] `/health` returns HTTP 200
- [ ] Render health check path is set to `/health`
- [ ] Better Stack or UptimeRobot monitor pings `/health` every 5 minutes
- [ ] WebSocket reconnect behavior works after a brief connection drop

## 7. Auto‑Deploy on Git Push
Render automatically rebuilds on every push to the selected branch. Ensure the **Build Command** and **Start Command** remain unchanged.

---
**Troubleshooting** – See the troubleshooting section in `docs/deployment/TRoubleshooting.md` for common Render issues.
