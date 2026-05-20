import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/features/auth/store/authStore';
import {
  connectSocket,
  getPresenterSocket,
  onStatusChange,
} from '@/features/collaboration/lib/socketClient';
import { useSyncStore } from '../store/syncStore';
import type { SyncSession, SessionMember } from '../store/syncStore';

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
// useSyncEngine — wires the /presenter socket to the SyncStore
// ─────────────────────────────────────────────────────────────────────────────

interface UseSyncEngineOptions {
  deckId: string;
  totalSlides: number;
  /** Called when server confirms current slide (for viewer snap) */
  onSlideChange?: (slideIndex: number) => void;
  /** Called when session ends */
  onSessionEnd?: () => void;
}

export function useSyncEngine({
  deckId,
  totalSlides,
  onSlideChange,
  onSessionEnd,
}: UseSyncEngineOptions) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const store = useSyncStore();
  const sessionIdRef = useRef<string | null>(null);
  const hasJoinedRef = useRef(false);

  // ── Connect and join session on mount ─────────────────────────────────────
  useEffect(() => {
    if (!user || hasJoinedRef.current) return;

    let cleanup: (() => void) | undefined;

    const init = async () => {
      await connectSocket();
      const socket = getPresenterSocket();

      // ── Register all incoming event handlers ─────────────────────────

      // Full session state on join
      const onSessionState = (payload: {
        session: ServerSession;
        members: ServerMember[];
        isPresenter: boolean;
      }) => {
        const { session, members, isPresenter } = payload;
        sessionIdRef.current = session.sessionId;

        store.initSession(
          normaliseSession(session),
          members.map(normaliseMember),
          isPresenter
        );

        store.setConnectionStatus('connected');
      };

      // Slide changed by presenter
      const onSlideChanged = (payload: {
        sessionId: string;
        slideIndex: number;
        sequenceNum: number;
        isSnapback?: boolean;
        serverTimestamp: number;
      }) => {
        store.updateCurrentSlide(payload.slideIndex, payload.sequenceNum);

        // If not exploring, update PDF viewer position
        if (!store.isExploring || payload.isSnapback) {
          onSlideChange?.(payload.slideIndex);
        }
      };

      // Presenter authority transferred
      const onPresenterChanged = (payload: {
        sessionId: string;
        newPresenterId: string;
        newPresenterName: string;
        previousPresenterId: string;
      }) => {
        store.transferPresenter(payload.newPresenterId, payload.newPresenterName);

        const isNowPresenter = payload.newPresenterId === user.id;
        const wasPresenter = payload.previousPresenterId === user.id;

        store.setIsPresenter(isNowPresenter);

        if (isNowPresenter) {
          store.receiveHandoff();
          // Brief UI confirmation, then settle
          setTimeout(() => store.completeHandoff(), 1500);
        } else if (wasPresenter) {
          store.completeHandoff();
          // Former presenter goes to explorer mode briefly then follows
          setTimeout(() => store.setIsExploring(false), 500);
        }
      };

      // Someone joined the session
      const onParticipantJoined = (payload: {
        sessionId: string;
        member: ServerMember;
      }) => {
        store.addMember({
          ...normaliseMember(payload.member),
          isConnected: true,
        });
      };

      // Someone left the session
      const onParticipantLeft = (payload: {
        sessionId: string;
        userId: string;
        displayName: string;
      }) => {
        store.removeMember(payload.userId);
      };

      // Presenter disconnected (grace period starts)
      const onPresenterDisconnected = (payload: {
        sessionId: string;
        presenterId: string;
      }) => {
        if (payload.presenterId === user.id) return; // That's us reconnecting
        store.setPresenterDisconnected(true);
        store.setMemberConnected(payload.presenterId, false);
      };

      // Presenter reconnected within grace period
      const onPresenterReconnected = (payload: { presenterId: string }) => {
        store.setPresenterDisconnected(false);
        store.setMemberConnected(payload.presenterId, true);
      };

      // Viewer entered exploration mode
      const onViewerExploring = (payload: { userId: string }) => {
        store.setMemberExploring(payload.userId, true);
      };

      // Session ended
      const onSessionEnded = () => {
        store.endSession();
        onSessionEnd?.();
        setTimeout(() => navigate('/dashboard'), 2000);
      };

      // Register all listeners
      socket.on('session:state', onSessionState);
      socket.on('slide:changed', onSlideChanged);
      socket.on('presenter:changed', onPresenterChanged);
      socket.on('participant:joined', onParticipantJoined);
      socket.on('participant:left', onParticipantLeft);
      socket.on('presenter:disconnected', onPresenterDisconnected);
      socket.on('presenter:reconnected', onPresenterReconnected);
      socket.on('viewer:exploring', onViewerExploring);
      socket.on('session:ended', onSessionEnded);

      // ── Track socket connection status ────────────────────────────────
      const unsubStatus = onStatusChange((status) => {
        if (status === 'connecting') store.setConnectionStatus('reconnecting');
        else if (status === 'error') store.setConnectionStatus('error');
      });

      socket.on('connect', () => {
        store.setConnectionStatus('connected');
        // Re-join on reconnect to get full state
        if (sessionIdRef.current && hasJoinedRef.current) {
          socket.emit('session:join', { deckId, sessionId: sessionIdRef.current }, () => {});
        }
      });

      socket.on('disconnect', () => {
        store.setConnectionStatus('reconnecting');
      });

      // ── Join or create session ────────────────────────────────────────
      hasJoinedRef.current = true;

      socket.emit(
        'session:join',
        { deckId },
        (res: { ok: boolean; session?: ServerSession; members?: ServerMember[]; isPresenter?: boolean; error?: string }) => {
          if (res.ok && res.session) {
            // Joined existing session
            onSessionState({
              session: res.session,
              members: res.members ?? [],
              isPresenter: res.isPresenter ?? false,
            });
          } else if (res.error === 'No active session found for this deck') {
            // No session — create one (first user becomes presenter)
            socket.emit(
              'session:create',
              { deckId, totalSlides },
              (createRes: { ok: boolean; session?: ServerSession; error?: string }) => {
                if (createRes.ok && createRes.session) {
                  onSessionState({
                    session: createRes.session,
                    members: [],
                    isPresenter: true,
                  });
                }
              }
            );
          }
        }
      );

      cleanup = () => {
        socket.off('session:state', onSessionState);
        socket.off('slide:changed', onSlideChanged);
        socket.off('presenter:changed', onPresenterChanged);
        socket.off('participant:joined', onParticipantJoined);
        socket.off('participant:left', onParticipantLeft);
        socket.off('presenter:disconnected', onPresenterDisconnected);
        socket.off('presenter:reconnected', onPresenterReconnected);
        socket.off('viewer:exploring', onViewerExploring);
        socket.off('session:ended', onSessionEnded);
        unsubStatus();
      };
    };

    void init();

    return () => {
      cleanup?.();
      hasJoinedRef.current = false;
    };
  }, [user?.id, deckId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions exposed to components ─────────────────────────────────────────

  const gotoSlide = useCallback((slideIndex: number) => {
    if (!store.isPresenter || !sessionIdRef.current) return;

    const socket = getPresenterSocket();
    socket.emit('slide:goto', {
      sessionId: sessionIdRef.current,
      slideIndex,
      sequenceNum: store.session?.sequenceNum ?? 0,
    });
  }, [store.isPresenter, store.session?.sequenceNum]);

  const handoffTo = useCallback((toUserId: string, toUserName: string) => {
    if (!store.isPresenter || !sessionIdRef.current) return;

    store.startHandoff(toUserId, toUserName);

    const socket = getPresenterSocket();
    socket.emit('presenter:handoff', {
      sessionId: sessionIdRef.current,
      toUserId,
      toUserName,
    });
  }, [store.isPresenter, store]);

  const enterExploreMode = useCallback(() => {
    if (!sessionIdRef.current) return;
    store.setIsExploring(true);

    const socket = getPresenterSocket();
    socket.emit('viewer:explore', { sessionId: sessionIdRef.current });
  }, [store]);

  const followPresenter = useCallback(() => {
    if (!sessionIdRef.current) return;
    store.setIsExploring(false);

    const socket = getPresenterSocket();
    socket.emit('viewer:follow', { sessionId: sessionIdRef.current });
  }, [store]);

  const endSession = useCallback(() => {
    if (!store.isPresenter || !sessionIdRef.current) return;

    const socket = getPresenterSocket();
    socket.emit('session:end', { sessionId: sessionIdRef.current });
  }, [store.isPresenter]);

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
