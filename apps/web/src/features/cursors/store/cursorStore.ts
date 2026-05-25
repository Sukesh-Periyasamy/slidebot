import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface CursorState {
  userId: string;
  displayName: string;
  color: string;
  slideId: string | null;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  updatedAt: number;
  lastSeenAt: number;
  cursorPulseAt: number | null;
  isOffscreen: boolean;
}

interface CursorStoreState {
  cursors: Record<string, CursorState>;
  upsertCursor: (cursor: CursorState) => void;
  removeCursor: (userId: string) => void;
  clearForSlide: (slideId: string) => void;
  advanceFrame: (now: number) => void;
  reset: () => void;
}

const initialState = {
  cursors: {} as Record<string, CursorState>,
};

function isEqualCursor(left: CursorState | undefined, right: CursorState): boolean {
  if (!left) return false;

  return (
    left.userId === right.userId &&
    left.displayName === right.displayName &&
    left.color === right.color &&
    left.slideId === right.slideId &&
    left.x === right.x &&
    left.y === right.y &&
    left.targetX === right.targetX &&
    left.targetY === right.targetY &&
    left.velocityX === right.velocityX &&
    left.velocityY === right.velocityY &&
    left.updatedAt === right.updatedAt &&
    left.lastSeenAt === right.lastSeenAt &&
    left.cursorPulseAt === right.cursorPulseAt &&
    left.isOffscreen === right.isOffscreen
  );
}

export const useCursorStore = create<CursorStoreState>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...initialState,

        upsertCursor: (cursor) =>
          set((state) => {
            const current = state.cursors[cursor.userId];
            if (isEqualCursor(current, cursor)) return;
            state.cursors[cursor.userId] = cursor;

            // Bounded cache per slide to avoid unbounded memory growth
            const MAX_PER_SLIDE = 128;
            if (cursor.slideId) {
              const sameSlide = Object.entries(state.cursors)
                .filter(([_, c]) => c.slideId === cursor.slideId)
                .sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt);

              if (sameSlide.length > MAX_PER_SLIDE) {
                const toRemoveCount = sameSlide.length - MAX_PER_SLIDE;
                for (let i = 0; i < toRemoveCount; i++) {
                  const maybeEntry = sameSlide[i];
                  const userIdToRemove = maybeEntry?.[0];
                  if (userIdToRemove) {
                    delete state.cursors[userIdToRemove];
                  }
                }
              }
            }
          }),

        removeCursor: (userId) =>
          set((state) => {
            if (!state.cursors[userId]) return;
            delete state.cursors[userId];
          }),

        clearForSlide: (slideId) =>
          set((state) => {
            Object.entries(state.cursors).forEach(([userId, cursor]) => {
              if (cursor.slideId === slideId) {
                delete state.cursors[userId];
              }
            });
          }),

        advanceFrame: (now) =>
          set((state) => {
            const staleAfterMs = 12_000;
            const lerp = 0.24;

            Object.entries(state.cursors).forEach(([userId, cursor]) => {
              if (now - cursor.lastSeenAt > staleAfterMs) {
                delete state.cursors[userId];
                return;
              }

              const nextX = cursor.x + (cursor.targetX - cursor.x) * lerp;
              const nextY = cursor.y + (cursor.targetY - cursor.y) * lerp;
              const nextOffscreen = nextX < 0 || nextX > 1 || nextY < 0 || nextY > 1;

              if (
                Math.abs(nextX - cursor.x) < 0.0001 &&
                Math.abs(nextY - cursor.y) < 0.0001 &&
                nextOffscreen === cursor.isOffscreen
              ) {
                return;
              }

              state.cursors[userId] = {
                ...cursor,
                x: nextX,
                y: nextY,
                isOffscreen: nextOffscreen,
              };
            });
          }),

        reset: () => set(() => ({ ...initialState })),
      }))
    ),
    { name: 'CursorStore' }
  )
);

export const selectCursors = (state: CursorStoreState) => Object.values(state.cursors);

export const selectCursorsForSlide = (slideId: string) => (state: CursorStoreState) =>
  Object.values(state.cursors).filter((cursor) => cursor.slideId === slideId);
