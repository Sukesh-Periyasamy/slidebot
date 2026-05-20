import { z } from 'zod';
import { requireEnv, getEnv } from '@slidebot/shared-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Environment variable schema (validated at startup)
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Security
  CORS_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim())),
  JWT_SECRET: z.string().min(32),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Optional
  SENTRY_DSN: z.string().optional(),
});

/**
 * Parse and validate all environment variables.
 * Throws on startup if any required variable is missing or invalid.
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    console.error('❌ Invalid environment variables:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
export type Env = typeof env;
