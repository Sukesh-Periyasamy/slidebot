# Setup Instructions

## Installation Instructions
Ensure you have Node.js >= 20 and pnpm >= 9.0.0 installed.
```bash
# Clone the repository
git clone https://github.com/Sukesh-Periyasamy/slidebot.git
cd slidebot

# Install all workspace dependencies
pnpm install
```

## Environment Setup
1. Copy example environments (if they exist) or create standard `.env` files in `apps/api` and `apps/web`.
2. Required variables for API:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `JWT_SECRET`
   - `SUPABASE_URL` / `SUPABASE_KEY`

## Run Commands
To run the entire stack concurrently (Web, API, Extension):
```bash
pnpm run dev
```
To run a specific application:
```bash
pnpm run dev:api
pnpm run dev:web
```

## Build Commands
```bash
pnpm run build
```
*(This leverages Turborepo to build all apps and packages in topological order.)*

## Database Management
```bash
cd apps/api
pnpm run db:generate   # Generate Prisma client
pnpm run db:migrate    # Apply migrations
pnpm run db:studio     # Open Prisma GUI
```

## Testing Commands
```bash
# Run all tests across the workspace
pnpm run test

# Run typechecking
pnpm run typecheck

# Run linting
pnpm run lint
```
