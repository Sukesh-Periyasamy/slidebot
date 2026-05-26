#!/bin/bash

# Exit on error
set -e

echo "Starting Deployment Verification..."

# 1. Check Node/pnpm
echo "Checking dependencies..."
pnpm --version > /dev/null || { echo "pnpm is not installed"; exit 1; }

# 2. Lint
echo "Running Linter..."
pnpm lint

# 3. Typecheck
echo "Running Typecheck..."
pnpm typecheck

# 4. Build
echo "Building all packages and apps..."
pnpm build

# 5. Verify Build outputs
echo "Verifying build outputs..."
if [ ! -d "apps/web/dist" ]; then
  echo "Web build failed: dist directory not found"
  exit 1
fi

if [ ! -d "apps/api/dist" ]; then
  echo "API build failed: dist directory not found"
  exit 1
fi

echo "✅ All verification checks passed!"
exit 0
