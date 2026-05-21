# SlideBot Alpha Deployment Script

This short runbook keeps the alpha deployment path low-maintenance and production-safe.

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

## Deployment Steps

```bash
pnpm install
pnpm turbo run build --filter @slidebot/api
pnpm turbo run typecheck
pnpm turbo run lint
```

Use `node dist/index.js` as the backend start command in production.

## Validation Checklist

- [ ] `/health` returns HTTP 200
- [ ] `/health` returns `{ "status": "ok", "uptime": <number>, "timestamp": <number> }`
- [ ] Render health check path is `/health`
- [ ] Better Stack or UptimeRobot pings `/health` every 5 minutes
- [ ] WebSocket reconnect recovery works after a brief interruption

## Operational Note

Free-tier hosting providers may suspend idle instances or affect long-lived websocket stability during inactivity periods. SlideBot automatically attempts reconnect recovery when websocket interruption occurs.