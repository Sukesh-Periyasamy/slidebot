/**
 * useSyncEngine — wires the /presenter socket to the SyncStore.
 *
 * Enhanced with:
 * - Full reconnect recovery via useReconnectRecovery
 * - Session state persistence to sessionStorage (survives refresh)
 * - Heartbeat via useHeartbeat
 * - Exploration mode persistence across disconnects
 * - Sequence-number-based conflict resolution
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/store/authStore';
import {
  connectSocket,
  getPresenterSocket,
  onStatusChange,
  isReconnect,
} from '@/features/collaboration/lib/socketClient';
import { useSyncStore } from '../store/syncStore';
import type { SyncSession, SessionMember } from '../store/syncStore';
import {
  useReconnectRecovery,
  persistReconnectState,
  clearReconnectState,
} from './useReconnectRecovery';

// ─────────────────────────────────────────────────────────────────────────────
// Types matching server payloads
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

// ─────────────────────────────────────────────────────────────────────────────
// useSyncEngine
// ─────────────────────────────────────────────────────────────────────────────

interface UseSyncEngineOptions {
  roomId: string;
  deckId: string;
  totalSlides: number;
  /** Called when server confirms current slide (for viewer snap) */
  onSlideChange?: (slideIndex: number) => void;
  /** Called when session ends */
  onSessionEnd?: () => void;
  /** Called when annotation restore should trigger */
  onAnnotationRestore?: (slideId: string) => void;
}

export function useSyncEngine({
  roomId,
  deckId,
  totalSlides,
  onSlideChange,
  onSessionEnd,
  onAnnotationRestore,
}: UseSyncEngineOptions) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  // NOTE: Do NOT use `useSyncStore()` directly in this hook's effect deps.
  // Use `useSyncStore.getState()` inside callbacks to avoid re-registering
  // all socket listeners on every Zustand state update.
  const sessionIdRef = useRef<string | null>(null);
  const hasJoinedRef = useRef(false);

  // ── Reconnect recovery hook ───────────────────────────────────────────────

  const { recover } = useReconnectRecovery({
    roomId,
    deckId,
    sessionId: sessionIdRef.current,
    userId: user?.id ?? '',
    onSlideRestored: onSlideChange,
    onAnnotationRestore,
  });

  // ── Connect and join session on mount ─────────────────────────────────────

  useEffect(() => {
    if (!user || hasJoinedRef.current || !roomId) return;

    let cleanup: (() => void) | undefined;
    let sessionEndRedirectTimer: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        await connectSocket();
      } catch {
        useSyncStore.getState().setConnectionStatus('error');
        return;
      }

      let socket;
      try {
        socket = getPresenterSocket();
      } catch {
        useSyncStore.getState().setConnectionStatus('error');
        return;
      }

      // ── Register all incoming event handlers ──────────────────────────

      // Full session state — sent on join ack AND can be re-sent by server
      const onSessionState = (payload: {
        session: ServerSession;
        members: ServerMember[];
        isPresenter: boolean;
      }) => {
        const { session, members, isPresenter } = payload;
        sessionIdRef.current = session.sessionId;

        const s = useSyncStore.getState();
        s.initSession(normaliseSession(session), members.map(normaliseMember), isPresenter);
        s.setConnectionStatus('connected');

        // Persist session state for reconnect recovery
        persistReconnectState({
          sessionId: session.sessionId,
          isExploring: s.isExploring,
          localSlide: session.currentSlide,
        });
      };

      // Slide changed by presenter
      const onSlideChanged = (payload: {
        sessionId: string;
        slideIndex: number;
        sequenceNum: number;
        isSnapback?: boolean;
        serverTimestamp: number;
      }) => {
        const s = useSyncStore.getState();
        s.updateCurrentSlide(payload.slideIndex, payload.sequenceNum);

        // If not exploring (or snapback forced), update PDF viewer position
        if (!s.isExploring || payload.isSnapback) {
          onSlideChange?.(payload.slideIndex);
        }

        // Keep sessionStorage in sync for reconnect restore
        if (sessionIdRef.current) {
          persistReconnectState({
            sessionId: sessionIdRef.current,
            isExploring: s.isExploring,
            localSlide: s.isExploring
              ? (s.session?.currentSlide ?? payload.slideIndex)
              : payload.slideIndex,
          });
        }
      };

      // Presenter authority transferred
      const onPresenterChanged = (payload: {
        sessionId: string;
        newPresenterId: string;
        newPresenterName: string;
        previousPresenterId: string;
      }) => {
        const s = useSyncStore.getState();
        s.transferPresenter(payload.newPresenterId, payload.newPresenterName);

        const isNowPresenter = payload.newPresenterId === user.id;
        const wasPresenter = payload.previousPresenterId === user.id;

        s.setIsPresenter(isNowPresenter);

        if (isNowPresenter) {
          s.receiveHandoff();
          setTimeout(() => useSyncStore.getState().completeHandoff(), 1500);
        } else if (wasPresenter) {
          s.completeHandoff();
          setTimeout(() => useSyncStore.getState().setIsExploring(false), 500);
        }
      };

      // Someone joined or reconnected
      const onParticipantJoined = (payload: { sessionId: string; member: ServerMember }) => {
        useSyncStore.getState().addMember({
          ...normaliseMember(payload.member),
          isConnected: true,
        });
      };

      const onParticipantReconnected = (payload: {
        sessionId: string;
        userId: string;
        displayName: string;
      }) => {
        useSyncStore.getState().setMemberConnected(payload.userId, true);
      };

      // Someone left
      const onParticipantLeft = (payload: {
        sessionId: string;
        userId: string;
        displayName: string;
      }) => {
        useSyncStore.getState().removeMember(payload.userId);
      };

      // Presenter disconnected (grace period starts)
      const onPresenterDisconnected = (payload: { sessionId: string; presenterId: string }) => {
        if (payload.presenterId === user.id) return; // That's us reconnecting
        useSyncStore.getState().setPresenterDisconnected(true);
        useSyncStore.getState().setMemberConnected(payload.presenterId, false);
      };

      // Presenter reconnected within grace period
      const onPresenterReconnected = (payload: { presenterId: string; presenterName: string }) => {
        useSyncStore.getState().setPresenterDisconnected(false);
        useSyncStore.getState().setMemberConnected(payload.presenterId, true);
      };

      // Grace period expired — presenter didn't return
      const onPresenterGraceExpired = (_payload: { sessionId: string; presenterId: string }) => {
        // UI should now show "Take over" or "Waiting" options
        useSyncStore.getState().setPresenterDisconnected(true);
      };

      // Viewer entered exploration mode
      const onViewerExploring = (payload: { userId: string }) => {
        useSyncStore.getState().setMemberExploring(payload.userId, true);
      };

      // Session ended
      const onSessionEnded = (_payload: { sessionId: string; reason?: string }) => {
        useSyncStore.getState().endSession();
        clearReconnectState();
        onSessionEnd?.();
        sessionEndRedirectTimer = setTimeout(() => navigate('/dashboard'), 2000);
      };

      // Register all listeners
      socket.on('session:state', onSessionState);
      socket.on('slide:changed', onSlideChanged as never);
      socket.on('presenter:changed', onPresenterChanged as never);
      socket.on('participant:joined', onParticipantJoined as never);
      socket.on('participant:reconnected', onParticipantReconnected as never);
      socket.on('participant:left', onParticipantLeft as never);
      socket.on('presenter:disconnected', onPresenterDisconnected as never);
      socket.on('presenter:reconnected', onPresenterReconnected as never);
      socket.on('presenter:grace_expired', onPresenterGraceExpired as never);
      socket.on('viewer:exploring', onViewerExploring as never);
      socket.on('session:ended', onSessionEnded as never);

      // ── Track socket connection status ─────────────────────────────────

      const unsubStatus = onStatusChange((status) => {
        if (status === 'connecting' || status === 'reconnecting') {
          useSyncStore.getState().setConnectionStatus('reconnecting');
        } else if (status === 'error') {
          useSyncStore.getState().setConnectionStatus('error');
        }
      });

      socket.on('connect', async () => {
        useSyncStore.getState().setConnectionStatus('connected');

        // If this is a reconnect (not initial connect), run full recovery
        if (sessionIdRef.current && hasJoinedRef.current && isReconnect()) {
          await recover();
        }
      });

      socket.on('disconnect', () => {
        useSyncStore.getState().setConnectionStatus('reconnecting');
      });

      // ── Join or create session ─────────────────────────────────────────
      hasJoinedRef.current = true;

      socket.emit(
        'session:join',
        { sessionId: roomId, deckId },
        (res: {
          ok: boolean;
          session?: ServerSession;
          members?: ServerMember[];
          isPresenter?: boolean;
          error?: string;
        }) => {
          if (res.ok && res.session) {
            onSessionState({
              session: res.session,
              members: res.members ?? [],
              isPresenter: res.isPresenter ?? false,
            });
          }
        }
      );

      cleanup = () => {
        socket.off('session:state', onSessionState);
        socket.off('slide:changed', onSlideChanged as never);
        socket.off('presenter:changed', onPresenterChanged as never);
        socket.off('participant:joined', onParticipantJoined as never);
        socket.off('participant:reconnected', onParticipantReconnected as never);
        socket.off('participant:left', onParticipantLeft as never);
        socket.off('presenter:disconnected', onPresenterDisconnected as never);
        socket.off('presenter:reconnected', onPresenterReconnected as never);
        socket.off('presenter:grace_expired', onPresenterGraceExpired as never);
        socket.off('viewer:exploring', onViewerExploring as never);
        socket.off('session:ended', onSessionEnded as never);
        unsubStatus();
      };
    };

    void init();

    return () => {
      if (sessionEndRedirectTimer) clearTimeout(sessionEndRedirectTimer);
      cleanup?.();
      hasJoinedRef.current = false;
    };
    // IMPORTANT: `useSyncStore.getState()` is used inside callbacks (not the reactive
    // store proxy) so this effect only re-runs when user/deck changes — not on every
    // state update. This is intentional and correct.
  }, [user?.id, roomId, deckId, recover, navigate, onSlideChange, onSessionEnd, onAnnotationRestore]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions exposed to components ─────────────────────────────────────────

  const isPresenter = useSyncStore((s) => s.isPresenter);
  const sequenceNum = useSyncStore((s) => s.session?.sequenceNum ?? 0);

  const gotoSlide = useCallback(
    (slideIndex: number) => {
      if (!isPresenter || !sessionIdRef.current) return;

      const socket = getPresenterSocket();
      socket.emit('slide:goto', {
        sessionId: sessionIdRef.current,
        slideIndex,
        sequenceNum,
      });
    },
    [isPresenter, sequenceNum]
  );

  const handoffTo = useCallback(
    (toUserId: string, toUserName: string) => {
      if (!isPresenter || !sessionIdRef.current) return;

      useSyncStore.getState().startHandoff(toUserId, toUserName);

      const socket = getPresenterSocket();
      socket.emit('presenter:handoff', {
        sessionId: sessionIdRef.current,
        toUserId,
        toUserName,
      });
    },
    [isPresenter]
  );

  const enterExploreMode = useCallback(() => {
    if (!sessionIdRef.current) return;
    const s = useSyncStore.getState();
    s.setIsExploring(true);

    persistReconnectState({
      sessionId: sessionIdRef.current,
      isExploring: true,
      localSlide: s.session?.currentSlide ?? 0,
    });

    const socket = getPresenterSocket();
    socket.emit('viewer:explore', { sessionId: sessionIdRef.current });
  }, []);

  const followPresenter = useCallback(() => {
    if (!sessionIdRef.current) return;
    const s = useSyncStore.getState();
    s.setIsExploring(false);

    persistReconnectState({
      sessionId: sessionIdRef.current,
      isExploring: false,
      localSlide: s.session?.currentSlide ?? 0,
    });

    const socket = getPresenterSocket();
    socket.emit('viewer:follow', { sessionId: sessionIdRef.current });
  }, []);

  const endSession = useCallback(() => {
    if (!isPresenter || !sessionIdRef.current) return;

    const socket = getPresenterSocket();
    socket.emit('session:end', { sessionId: sessionIdRef.current });
    clearReconnectState();
  }, [isPresenter]);


  return {
    gotoSlide,
    handoffTo,
    enterExploreMode,
    followPresenter,
    endSession,
    sessionId: sessionIdRef.current,
  };
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
