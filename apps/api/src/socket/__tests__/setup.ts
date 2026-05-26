import { vi } from 'vitest';
import Redis from 'ioredis-mock';

// Mock Prisma
vi.mock('../../config/database', () => ({
  prisma: {
    room: {
      findUnique: vi.fn().mockResolvedValue({ id: 'mock-room', deckId: 'mock-deck', ownerId: 'mock-owner' })
    }
  }
}));

// Mock Supabase JS entirely to avoid WebSocket complaints in Node 20
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'invalid-token') {
          return { data: { user: null }, error: new Error('Invalid token') };
        }
        return {
          data: {
            user: {
              id: `user-${token}`,
              email: `${token}@example.com`,
              user_metadata: {
                display_name: `User ${token}`,
                avatar_url: null
              }
            }
          },
          error: null
        };
      })
    }
  }))
}));

// Mock ioredis
vi.mock('ioredis', () => {
  // @socket.io/redis-adapter uses send_command('PUBSUB', ...) for fetchSockets()
  // ioredis-mock doesn't implement send_command natively, so we polyfill it to avoid crashes.
  Redis.prototype.send_command = function (command: string, args: any[], callback?: (err: any, res: any) => void) {
    if (command === 'PUBSUB' && args[0] === 'NUMSUB') {
      if (callback) callback(null, [args[1], 1]); // mock 1 subscriber for tests
      return Promise.resolve([args[1], 1]);
    }
    if (callback) callback(null, []);
    return Promise.resolve([]);
  };

  return {
    Redis: Redis,
    default: Redis
  };
});

// Mock database annotations service to prevent Prisma queries
vi.mock('../../modules/annotations/annotations.service', () => ({
  annotationService: {
    getAnnotationsForSlide: vi.fn().mockResolvedValue([]),
    saveAnnotation: vi.fn().mockImplementation(async (ann) => ({
      ...ann,
      id: ann.id || 'mock-ann-id',
      createdAt: new Date(),
    })),
    deleteAnnotation: vi.fn().mockResolvedValue(true),
    enqueueSaveAnnotation: vi.fn().mockResolvedValue(undefined),
    canClearAnnotations: vi.fn().mockResolvedValue(true),
  }
}));
