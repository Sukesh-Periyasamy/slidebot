import { PrismaClient } from '@prisma/client';

import { logger } from './logger';

// Singleton Prisma client (prevents connection pool exhaustion in dev HMR)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect to the database and verify connectivity.
 * Called once during server bootstrap.
 */
export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  // Verify connection
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connection established');
}
