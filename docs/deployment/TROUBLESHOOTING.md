# SlideBot Deployment Troubleshooting

## Health Check Fails

- Confirm the Render root directory is `/`.
- Confirm the build command runs from the repository root.
- Confirm `GET /health` returns HTTP 200 and does not depend on Redis or the database.

## Uploads Fail on Render

- Use Supabase Storage for alpha uploads.
- Do not rely on the Render filesystem for persisted PDFs or other user files.
- Verify `SUPABASE_STORAGE_BUCKET` matches the created bucket name (default `presentations`).
- Verify `SUPABASE_SIGNED_URL_EXPIRES_SEC` is set (for example `3600`) so room loads can refresh links before expiry.

## Room Fails After Refresh

- Confirm `GET /api/v1/rooms/:id` returns room + deck metadata with a fresh `signedUrl`.
- Confirm room route uses `/room/:roomId` (not `/room/:deckId`).
- Confirm Prisma migrations are applied so `rooms` and `room_participants` tables exist.

## Prisma Migration Fails

- If `npx prisma migrate deploy` reports missing `DIRECT_URL`, set both `DATABASE_URL` and `DIRECT_URL`.
- Run migration from `apps/api` directory:
  - `npx prisma migrate deploy`
- Verify migration file exists:
  - `apps/api/prisma/migrations/20260522_rooms_and_deck_persistence/migration.sql`

## CORS Errors in Browser

- Confirm backend allowlist includes:
  - `https://slidebot-web.vercel.app`
  - `http://localhost:5173`
- Do not use `origin: '*'` with `credentials: true`.
- Ensure CORS middleware is mounted before `/api/v1/...` routes.

## WebSocket Smoke Test Fails

- Verify the app from the frontend RoomPage rather than using a raw Socket.IO-unaware client.
- Check the browser DevTools Network tab for a live Socket.IO connection.
- Confirm reconnect recovery still works after a temporary disconnect.

## Monitoring Notes

- Better Stack and UptimeRobot should ping `/health` every 5 minutes.
- Keep-alive pings can reduce cold starts, but they do not guarantee persistent websocket uptime on free-tier infrastructure.
