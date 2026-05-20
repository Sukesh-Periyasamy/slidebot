import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/socket/__tests__/setup.ts'],
    env: {
      DATABASE_URL: 'postgres://mock',
      SUPABASE_URL: 'http://mock',
      SUPABASE_SERVICE_ROLE_KEY: 'mock',
      SUPABASE_JWT_SECRET: 'mockmockmockmockmockmockmockmockmock',
      CORS_ORIGINS: '*',
      JWT_SECRET: 'mockmockmockmockmockmockmockmockmock',
      REDIS_URL: 'redis://mock',
    },
  },
});
