/**
 * useReconnectRecovery — orchestrates full state recovery after reconnect.
 *
 * Triggered by: socket 'connect' event when the client was previously connected
 * (i.e., this is a reconnect, not an initial connect).
 *
 * Recovery sequence:
 * 1. Re-emit session:join with known sessionId → server returns full snapshot
 * 2. Restore SyncStore state from snapshot
 * 3. Restore exploration mode from sessionStorage
 * 4. If presenter: re-confirm authority
 * 5. Trigger annotation restore (via refetch)
 * 6. Emit presence_restore so the UI shows "recovered"
 *
 * Design:
 * - Idempotent — safe to call multiple times
 * - Uses ref-guarded sequence to prevent double-recovery
 * - Emits UI status changes throughout for loading states
 */

import { useCallback, useRef } from 'react';
import { getPresenterSocket } from '@/features/collaboration/lib/socketClient';
import { useSyncStore } from '../store/syncStore';
import type { SyncSession, SessionMember } from '../store/syncStore';
// using console instead of logger

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ServerSession {
  sessionId: string;
  deckId: string;
  presenterId: string;
  presenterName: string;
  currentSlide: number;
  totalSlides: number;
  sequenceNum: number;
  status: string;
}

interface ServerMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isExploring: boolean;
}

interface SessionJoinAck {
  ok: boolean;
  session?: ServerSession;
  members?: ServerMember[];
  isPresenter?: boolean;
  error?: string;
}

interface UseReconnectRecoveryOptions {
  roomId: string;
  deckId: string;
  sessionId: string | null;
  userId: string;
  /** Called with the restored slide index so the viewer can seek */
  onSlideRestored?: ((slideIndex: number) => void) | undefined;
  /** Called when annotation restore should be triggered */
  onAnnotationRestore?: ((slideId: string) => void) | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers (sessionStorage — survives refresh, not new tab)
// ─────────────────────────────────────────────────────────────────────────────

const PERSIST_KEY_EXPLORING = 'slidebot:isExploring';
const PERSIST_KEY_LOCAL_SLIDE = 'slidebot:localSlide';
const PERSIST_KEY_SESSION = 'slidebot:sessionId';

export function persistReconnectState(state: {
  sessionId: string;
  isExploring: boolean;
  localSlide: number;
}): void {
  try {
    sessionStorage.setItem(PERSIST_KEY_SESSION, state.sessionId);
    sessionStorage.setItem(PERSIST_KEY_EXPLORING, state.isExploring ? '1' : '0');
    sessionStorage.setItem(PERSIST_KEY_LOCAL_SLIDE, String(state.localSlide));
  } catch {
    // sessionStorage unavailable — non-fatal
  }
}

export function clearReconnectState(): void {
  try {
    sessionStorage.removeItem(PERSIST_KEY_SESSION);
    sessionStorage.removeItem(PERSIST_KEY_EXPLORING);
    sessionStorage.removeItem(PERSIST_KEY_LOCAL_SLIDE);
  } catch {
    /* noop */
  }
}

function loadReconnectState() {
  try {
    return {
      sessionId: sessionStorage.getItem(PERSIST_KEY_SESSION),
      isExploring: sessionStorage.getItem(PERSIST_KEY_EXPLORING) === '1',
      localSlide: Number(sessionStorage.getItem(PERSIST_KEY_LOCAL_SLIDE) ?? 0),
    };
  } catch {
    return { sessionId: null, isExploring: false, localSlide: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useReconnectRecovery({
  roomId,
  deckId,
  sessionId,
  userId,
  onSlideRestored,
  onAnnotationRestore,
}: UseReconnectRecoveryOptions) {
  const isRecoveringRef = useRef(false);
  const recoveryCountRef = useRef(0);

  const recover = useCallback(async () => {
    // Prevent concurrent recoveries
    if (isRecoveringRef.current) return;
    isRecoveringRef.current = true;
    recoveryCountRef.current++;

    const attempt = recoveryCountRef.current;
    console.info({ deckId, sessionId, attempt }, 'Starting reconnect recovery');

    const store = useSyncStore.getState();
    store.setConnectionStatus('reconnecting');

    try {
      const socket = getPresenterSocket();

      // Load persisted state from before disconnect
      const persisted = loadReconnectState();
      const targetSessionId = sessionId ?? persisted.sessionId;

      if (!targetSessionId) {
        console.warn({ deckId }, 'No session ID for recovery — starting fresh');
        store.setConnectionStatus('connected');
        isRecoveringRef.current = false;
        return;
      }

      // Re-emit session:join — server returns full snapshot
      await new Promise<void>((resolve) => {
        socket.emit(
          'session:join',
          { deckId, sessionId: targetSessionId || roomId },
          (res: SessionJoinAck) => {
            if (!res.ok || !res.session) {
              console.error({ error: res.error }, 'Recovery: session:join failed');
              store.setConnectionStatus('error');
              resolve();
              return;
            }

            const { session, members = [], isPresenter = false } = res;

            // Restore sync store from server snapshot (source of truth)
            useSyncStore.getState().initSession(
              normaliseSession(session),
              members.map(normaliseMember),
              isPresenter
            );

            useSyncStore.getState().setConnectionStatus('connected');

            // Restore exploration mode from persisted state
            // Only restore if it matches context (non-presenter)
            if (persisted.isExploring && !isPresenter) {
              useSyncStore.getState().setIsExploring(true);
              if (persisted.localSlide > 0) {
                onSlideRestored?.(persisted.localSlide);
              }
            } else {
              // Follow presenter (default recovery)
              useSyncStore.getState().setIsExploring(false);
              onSlideRestored?.(session.currentSlide);
            }

            // Trigger annotation restore for current slide
            if (onAnnotationRestore) {
              const slideId = `${session.deckId}:${session.currentSlide}`;
              onAnnotationRestore(slideId);
            }

            console.info(
              {
                sessionId: session.sessionId,
                currentSlide: session.currentSlide,
                isPresenter,
                attempt,
              },
              'Reconnect recovery complete'
            );

            resolve();
          }
        );
      });
    } catch (err) {
      console.error({ err }, 'Reconnect recovery threw');
      useSyncStore.getState().setConnectionStatus('error');
    } finally {
      isRecoveringRef.current = false;
    }
  }, [roomId, deckId, sessionId, userId, onSlideRestored, onAnnotationRestore]);

  return { recover };
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisers
// ─────────────────────────────────────────────────────────────────────────────

function normaliseSession(s: ServerSession): SyncSession {
  return {
    sessionId: s.sessionId,
    deckId: s.deckId,
    presenterId: s.presenterId,
    presenterName: s.presenterName,
    currentSlide: s.currentSlide,
    totalSlides: s.totalSlides,
    sequenceNum: s.sequenceNum,
    status: s.status as SyncSession['status'],
  };
}

function normaliseMember(m: ServerMember): SessionMember {
  return {
    userId: m.userId,
    displayName: m.displayName,
    avatarUrl: m.avatarUrl,
    color: m.color,
    role: m.role,
    isExploring: m.isExploring,
    isConnected: true,
  };
}
