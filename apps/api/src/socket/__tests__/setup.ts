import { vi } from 'vitest';
import Redis from 'ioredis-mock';

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
