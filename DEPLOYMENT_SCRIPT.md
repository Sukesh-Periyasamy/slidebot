# SlideBot Deployment Script

This runbook keeps deployment low-maintenance and production-safe.

## Live Services

- Frontend: `https://slidebot-web.vercel.app`
- Backend API: `https://slidebot-api-mvb8.onrender.com`

## Health Monitoring

Use `GET /health` for Render health checks, Better Stack monitoring, UptimeRobot keepalive pings, deployment smoke tests, and CI validation.

The endpoint response is intentionally minimal:

```json
{
  "status": "ok",
  "uptime": 0,
  "timestamp": 0
}
```

It must stay lightweight and must not query the database, Redis, or any external service.

Recommended monitoring interval: every 5 minutes.

Free-tier hosting providers may suspend idle instances or affect long-lived websocket stability during inactivity periods. SlideBot automatically attempts reconnect recovery when websocket interruption occurs, but keep-alive pings only reduce cold starts and do not guarantee persistent websocket uptime.

## Deployment Steps

```bash
pnpm install --frozen-lockfile
pnpm turbo build --filter=@slidebot/api
pnpm turbo run typecheck
pnpm turbo run lint
```

Before starting the API in production, apply Prisma migrations:

```bash
cd apps/api
npx prisma migrate deploy
```

Use `/` as the Render root directory and `pnpm --filter @slidebot/api start` as the backend start command in production.

## Validation Checklist

- [ ] Auth login works
- [ ] RoomPage loads
- [ ] WebSocket connected
- [ ] Presenter sync works
- [ ] Reconnect recovery works
- [ ] Annotations sync
- [ ] Extension detects Meet
- [ ] Uploads work
- [ ] Uploaded deck remains available after hard refresh on `/room/:roomId`
- [ ] `/api/v1/rooms` list/get/join/leave endpoints respond correctly
- [ ] No console errors
- [ ] Mobile layout is acceptable
- [ ] `/health` returns HTTP 200
- [ ] `/health` returns `{ "status": "ok", "uptime": <number>, "timestamp": <number> }`
- [ ] Render health check path is `/health`
- [ ] Better Stack or UptimeRobot pings `/health` every 5 minutes
- [ ] WebSocket reconnect recovery works after a brief interruption

## Operational Note

Free-tier hosting providers may suspend idle instances or affect long-lived websocket stability during inactivity periods. SlideBot automatically attempts reconnect recovery when websocket interruption occurs.

## Storage Configuration (Required)

SlideBot now expects Supabase Storage for persisted presentation PDFs:

- Bucket name: `presentations`
- Bucket visibility: private (recommended)
- Backend signs access URLs per request

Required API environment variables:

- `SUPABASE_STORAGE_BUCKET=presentations`
- `SUPABASE_SIGNED_URL_EXPIRES_SEC=3600`
- `DATABASE_URL=<postgres-connection-string>`
- `DIRECT_URL=<direct-postgres-connection-string>`
