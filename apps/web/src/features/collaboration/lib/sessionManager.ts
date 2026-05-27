import type { Socket } from 'socket.io-client';

import { logger } from '@/lib/logger';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { joinRoom, leaveRoom } from '@/features/decks/api/roomsApi';
import { presenceManager } from '@/features/presence/lib/presenceManager';
import { cursorManager } from '@/features/cursors/lib/cursorManager';
import { heartbeatManager } from './heartbeatManager';
import { socketManager } from './socketManager';
import { assertSingleSocketListener } from './socketDebug';
import { RealtimeSchemas } from '@slidebot/shared-types';
import { useUxStore } from '../store/uxStore';
import {
  clearReconnectState,
  persistReconnectState,
  recoverPresenterSession,
} from '@/features/sync/hooks/useReconnectRecovery';
import { replayManager } from './replayManager';

const isDev = import.meta.env.DEV;

interface SessionContext {
  roomId: string;
  deckId: string;
  totalSlides: number;
}

type SessionLifecycleState =
  | 'idle'
  | 'joining'
  | 'active'
  | 'recovering'
  | 'switching'
  | 'leaving';

const allowedTransitions: Record<SessionLifecycleState, SessionLifecycleState[]> = {
  idle: ['switching', 'joining'],
  switching: ['joining', 'idle'],
  joining: ['active', 'idle'],
  active: ['recovering', 'switching', 'leaving'],
  recovering: ['active', 'idle'],
  leaving: ['idle'],
};

interface EnsureSessionInput {
  roomId: string;
  deckId: string;
  userId: string;
}

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

interface SessionStatePayload {
  session: ServerSession;
  members: ServerMember[];
  isPresenter: boolean;
}

class SessionManager {
  private started = false;
  private activeContext: SessionContext | null = null;
  private joinedRooms = new Set<string>();
  private roomJoinPromises = new Map<string, Promise<void>>();
  private roomSwitchPromise: Promise<void> | null = null;
  private sessionJoinPromise: Promise<void> | null = null;
  private recoveringPromise: Promise<void> | null = null;
  private shouldRecoverOnConnect = false;
  private boundPresenterSocket: Socket | null = null;
  private unbindPresenterListeners: (() => void) | null = null;
  private boundCollabSocket: Socket | null = null;
  private unbindCollabListeners: (() => void) | null = null;
  private unsubscribers: Array<() => void> = [];
  private sessionState: SessionLifecycleState = 'idle';
  private lastTransitionAt: number | null = null;
  private transitionInFlight = false;

  private trace(action: string, details: Record<string, unknown> = {}): void {
    if (!isDev) return;
      logger.debug?.('[session]', {
      action,
      state: this.sessionState,
      ...details,
    });
  }

  private setSessionState(next: SessionLifecycleState, details: Record<string, unknown> = {}): void {
    if (this.sessionState === next) return;
    const prev = this.sessionState;
    const allowed = allowedTransitions[prev].includes(next);
    if (!allowed) {
      const message = `[SessionManager] Invalid transition: ${prev} -> ${next}`;
      console.error(message, { prev, next, ...details });
      logger.warn(message, { prev, next, ...details });
      return;
    }

    const now = Date.now();
    const durationMs = this.lastTransitionAt ? now - this.lastTransitionAt : null;
    this.lastTransitionAt = now;
    this.sessionState = next;
    this.trace('state:transition', { prev, next, durationMs, ...details });
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    presenceManager.start();
    cursorManager.start();

    this.unsubscribers.push(
      socketManager.onStatusChange((status) => {
        const store = useSyncStore.getState();

        switch (status) {
          case 'connecting':
            store.setConnectionStatus('connecting');
            break;
          case 'connected':
            store.setConnectionStatus('connected');
            break;
          case 'reconnecting':
            store.setConnectionStatus('reconnecting');
            break;
          case 'disconnected':
            store.setConnectionStatus('disconnected');
            heartbeatManager.markUnhealthy();
            break;
          case 'error':
            store.setConnectionStatus('error');
            heartbeatManager.markUnhealthy();
            break;
        }
      })
    );

    this.unsubscribers.push(
      socketManager.onReconnectAttemptsChange((attempts) => {
        useSyncStore.getState().setReconnectAttempts(attempts);
      })
    );

    this.unsubscribers.push(
      useViewerStore.subscribe((state) => state.currentPage, (currentPage) => {
        this.broadcastPresenterSlide(currentPage);
      })
    );
  }

  private queueStoreUpdate(action: () => void): void {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(action);
      return;
    }

    setTimeout(action, 0);
  }

  async ensureSession(input: EnsureSessionInput): Promise<void> {
    if (!input.roomId || !input.deckId || !input.userId) {
      return;
    }

    if (this.transitionInFlight) {
      this.trace('ensureSession:in_flight', {
        roomId: input.roomId,
        deckId: input.deckId,
      });
      return;
    }

    this.trace('ensureSession', {
      roomId: input.roomId,
      deckId: input.deckId,
      sessionId: useSyncStore.getState().session?.sessionId ?? null,
    });

    this.transitionInFlight = true;

    try {
      const existingSession = useSyncStore.getState().session;
      const alreadyInTargetSession =
        this.activeContext?.roomId === input.roomId &&
        this.activeContext?.deckId === input.deckId &&
        existingSession?.sessionId === input.roomId &&
        existingSession?.deckId === input.deckId;

      if (alreadyInTargetSession) {
        this.setSessionState('active', {
          roomId: input.roomId,
          deckId: input.deckId,
        });
        await socketManager.ensureConnected();
        this.bindPresenterSocketListeners();
        this.bindCollaborationSocketListeners();
        return;
      }

      this.setSessionState('switching', { roomId: input.roomId, deckId: input.deckId });
      await this.switchRoom(input.roomId);

      this.activeContext = {
        roomId: input.roomId,
        deckId: input.deckId,
        totalSlides: this.activeContext?.totalSlides ?? 0,
      };

      this.setSessionState('joining', { roomId: input.roomId, deckId: input.deckId });
      await socketManager.ensureConnected();
      this.bindPresenterSocketListeners();
      this.bindCollaborationSocketListeners();

      try {
        await this.joinPresenterSession(input.roomId, input.deckId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to join session';
        useSyncStore
          .getState()
          .setConnectionStatus('error', message);
        this.setSessionState('idle', { roomId: input.roomId, deckId: input.deckId });
        return;
      }

      this.setSessionState('active', { roomId: input.roomId, deckId: input.deckId });
    } finally {
      this.transitionInFlight = false;
    }
  }

  updateSessionContext(context: SessionContext): void {
    if (!context.roomId || !context.deckId) {
      return;
    }

    if (
      this.activeContext?.roomId === context.roomId &&
      this.activeContext?.deckId === context.deckId &&
      this.activeContext.totalSlides === context.totalSlides
    ) {
      return;
    }

    this.trace('updateSessionContext', {
      roomId: context.roomId,
      deckId: context.deckId,
      totalSlides: context.totalSlides,
    });

    this.activeContext = {
      roomId: context.roomId,
      deckId: context.deckId,
      totalSlides: context.totalSlides,
    };
  }

  updateSlides(totalSlides: number): void {
    if (!this.activeContext || totalSlides <= 0) {
      return;
    }

    if (this.activeContext.totalSlides === totalSlides) {
      return;
    }

    this.trace('updateSlides', {
      roomId: this.activeContext.roomId,
      deckId: this.activeContext.deckId,
      totalSlides,
    });

    this.activeContext = {
      ...this.activeContext,
      totalSlides,
    };
  }

  async switchRoom(nextRoomId: string): Promise<void> {
    if (!nextRoomId) {
      return;
    }

    this.trace('switchRoom', {
      fromRoomId: this.activeContext?.roomId ?? this.getCurrentJoinedRoomId(),
      toRoomId: nextRoomId,
    });

    if (this.roomSwitchPromise) {
      await this.roomSwitchPromise;
    }

    const currentRoomId = this.activeContext?.roomId ?? this.getCurrentJoinedRoomId();
    if (currentRoomId === nextRoomId && this.joinedRooms.has(nextRoomId)) {
      return;
    }

    this.roomSwitchPromise = (async () => {
      if (currentRoomId && currentRoomId !== nextRoomId) {
        await this.leaveRoomMembership(currentRoomId);
      }

      await this.ensureRoomMembership(nextRoomId);

      // Enforce single active room membership to prevent stale accumulation.
      this.joinedRooms.clear();
      this.joinedRooms.add(nextRoomId);
    })()
      .catch((error) => {
        logger.error('[SessionManager] switchRoom failed', error);
        throw error;
      })
      .finally(() => {
        this.roomSwitchPromise = null;
      });

    return this.roomSwitchPromise;
  }

  async leaveActiveRoom(): Promise<void> {
    const roomId = this.activeContext?.roomId;
    if (!roomId) {
      return;
    }

    this.trace('leaveActiveRoom', { roomId });
    this.setSessionState('leaving', { roomId });

    await this.leaveRoomMembership(roomId);
    this.joinedRooms.clear();
    this.activeContext = null;
    this.shouldRecoverOnConnect = false;
    this.setSessionState('idle');
    clearReconnectState();
    presenceManager.reset();
    cursorManager.reset();
    // Clear replay cache on intentional leave — not on transient disconnects
    replayManager.clear();
    this.queueStoreUpdate(() => useSyncStore.getState().reset());
  }

  resetForLogout(): void {
    this.setSessionState('idle');
    this.activeContext = null;
    this.joinedRooms.clear();
    this.roomJoinPromises.clear();
    this.roomSwitchPromise = null;
    this.sessionJoinPromise = null;
    this.recoveringPromise = null;
    this.shouldRecoverOnConnect = false;
    this.boundPresenterSocket = null;
    this.unbindPresenterListeners?.();
    this.unbindPresenterListeners = null;

    this.boundCollabSocket = null;
    this.unbindCollabListeners?.();
    this.unbindCollabListeners = null;

    this.sessionJoinPromise = null;
    clearReconnectState();
    presenceManager.reset();
    cursorManager.reset();
    // Clear replay cache on logout
    replayManager.clear();
    this.queueStoreUpdate(() => useSyncStore.getState().reset());
  }

  async gotoSlide(slideIndex: number): Promise<void> {
    const state = useSyncStore.getState();
    const sessionId = state.session?.sessionId;
    const socket = socketManager.getPresenterSocket();

    if (!socket || !sessionId || !state.isPresenter) {
      return;
    }

    const payload = {
      sessionId,
      slideIndex,
      sequenceNum: state.session?.sequenceNum ?? 0,
    };
    if (!RealtimeSchemas.slideGoto.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid slide:goto payload', payload);
      return;
    }
    socket.emit('slide:goto', payload);
  }

  handoffTo(toUserId: string, toUserName: string): void {
    const state = useSyncStore.getState();
    const sessionId = state.session?.sessionId;
    const socket = socketManager.getPresenterSocket();

    if (!socket || !sessionId || !state.isPresenter) {
      return;
    }

    state.startHandoff(toUserId, toUserName);

    const payload = {
      sessionId,
      toUserId,
      toUserName,
    };
    if (!RealtimeSchemas.presenterHandoff.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid presenter:handoff payload', payload);
      return;
    }
    socket.emit('presenter:handoff', payload);
  }

  enterExploreMode(): void {
    const state = useSyncStore.getState();
    const sessionId = state.session?.sessionId;
    const socket = socketManager.getPresenterSocket();

    if (!socket || !sessionId) {
      return;
    }

    state.setIsExploring(true);

    persistReconnectState({
      sessionId,
      isExploring: true,
      localSlide: useViewerStore.getState().currentPage,
    });

    const payload = { sessionId };
    if (!RealtimeSchemas.sessionScoped.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid viewer:explore payload', payload);
      return;
    }
    socket.emit('viewer:explore', payload);
  }

  followPresenter(): void {
    const state = useSyncStore.getState();
    const sessionId = state.session?.sessionId;
    const socket = socketManager.getPresenterSocket();

    if (!socket || !sessionId) {
      return;
    }

    state.setIsExploring(false);

    persistReconnectState({
      sessionId,
      isExploring: false,
      localSlide: state.session?.currentSlide ?? 0,
    });

    const payload = { sessionId };
    if (!RealtimeSchemas.sessionScoped.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid viewer:follow payload', payload);
      return;
    }
    socket.emit('viewer:follow', payload);
  }

  endSession(): void {
    const state = useSyncStore.getState();
    const sessionId = state.session?.sessionId;
    const socket = socketManager.getPresenterSocket();

    if (!socket || !sessionId || !state.isPresenter) {
      return;
    }

    const payload = { sessionId };
    if (!RealtimeSchemas.sessionScoped.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid session:end payload', payload);
      return;
    }
    socket.emit('session:end', payload);
    clearReconnectState();
  }

  private async ensureRoomMembership(roomId: string): Promise<void> {
    if (this.joinedRooms.has(roomId)) {
      return;
    }

    const inFlight = this.roomJoinPromises.get(roomId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const joinPromise = (async () => {
      await joinRoom(roomId);
      this.joinedRooms.add(roomId);
        logger.debug('[SessionManager] Room membership ensured', { roomId });
    })()
      .catch((error) => {
        logger.error('[SessionManager] joinRoom failed', error);
        throw error;
      })
      .finally(() => {
        this.roomJoinPromises.delete(roomId);
      });

    this.roomJoinPromises.set(roomId, joinPromise);
    await joinPromise;
  }

  private async leaveRoomMembership(roomId: string): Promise<void> {
    try {
      await leaveRoom(roomId);
    } catch (error) {
      logger.warn('[SessionManager] leaveRoom failed', error);
    } finally {
      this.joinedRooms.delete(roomId);
    }
  }

  private getCurrentJoinedRoomId(): string | null {
    const iterator = this.joinedRooms.values().next();
    return iterator.done ? null : iterator.value;
  }

  private async joinPresenterSession(roomId: string, deckId: string): Promise<void> {
    const socket = socketManager.getPresenterSocket();
    if (!socket) {
      return;
    }

    if (this.sessionJoinPromise) {
      return this.sessionJoinPromise;
    }

    this.sessionJoinPromise = (async () => {
      const ack = await new Promise<SessionJoinAck>((resolve) => {
        const joinPayload = { sessionId: roomId, deckId };
        if (!RealtimeSchemas.sessionJoin.safeParse(joinPayload).success) {
          resolve({ ok: false, error: 'Invalid session:join payload' });
          return;
        }
        socket.emit('session:join', joinPayload, (response: SessionJoinAck) => {
          resolve(response);
        });
      });

      if (!ack.ok || !ack.session) {
        useSyncStore.getState().setConnectionStatus('error', ack.error ?? 'session:join failed');
        throw new Error(ack.error ?? 'session:join failed');
      }

      this.applySessionState({
        session: ack.session,
        members: ack.members ?? [],
        isPresenter: ack.isPresenter ?? false,
      });

      this.shouldRecoverOnConnect = true;
    })().finally(() => {
      this.sessionJoinPromise = null;
    });

    return this.sessionJoinPromise;
  }

  private bindCollaborationSocketListeners(): void {
    const socket = socketManager.getCollaborationSocket();
    if (!socket || this.boundCollabSocket === socket) {
      return;
    }

    this.unbindCollabListeners?.();
    this.boundCollabSocket = socket;

    const onReaction = (payload: any) => {
      window.dispatchEvent(new CustomEvent('reaction_received', { detail: payload }));
      useUxStore.getState().addActivity({
        id: Math.random().toString(36).slice(2),
        type: 'reaction',
        userId: payload.userId,
        displayName: payload.displayName,
        timestamp: payload.timestamp,
        metadata: { emoji: payload.emoji }
      });
    };

    const onHandRaised = (payload: any) => {
      useSyncStore.getState().setHandRaised(payload.userId, true);
      useUxStore.getState().addActivity({
        id: Math.random().toString(36).slice(2),
        type: 'hand_raise',
        userId: payload.userId,
        displayName: 'Someone', // Can map via syncStore if needed
        timestamp: payload.timestamp,
      });
    };

    const onHandLowered = (payload: any) => {
      useSyncStore.getState().setHandRaised(payload.userId, false);
    };

    const onCommentCreated = (payload: any) => {
      window.dispatchEvent(new CustomEvent('comment_created', { detail: payload }));
      useUxStore.getState().addActivity({
        id: Math.random().toString(36).slice(2),
        type: 'comment',
        userId: payload.userId,
        displayName: payload.displayName,
        timestamp: payload.createdAt,
      });
    };

    socket.on('reaction_received', onReaction);
    socket.on('hand_raised', onHandRaised);
    socket.on('hand_lowered', onHandLowered);
    socket.on('comment_created', onCommentCreated);

    this.unbindCollabListeners = () => {
      socket.off('reaction_received', onReaction);
      socket.off('hand_raised', onHandRaised);
      socket.off('hand_lowered', onHandLowered);
      socket.off('comment_created', onCommentCreated);
    };
  }

  private bindPresenterSocketListeners(): void {
    const socket = socketManager.getPresenterSocket();
    if (!socket || this.boundPresenterSocket === socket) {
      return;
    }

    this.unbindPresenterListeners?.();

    this.boundPresenterSocket = socket;

    const onSessionState = (payload: SessionStatePayload) => {
      this.applySessionState(payload);
    };

    const onSlideChanged = (payload: {
      slideIndex: number;
      sequenceNum: number;
      isSnapback?: boolean;
    }) => {
      this.queueStoreUpdate(() => {
        const store = useSyncStore.getState();
        store.updateCurrentSlide(payload.slideIndex, payload.sequenceNum);

        if (!store.isExploring || payload.isSnapback) {
          useViewerStore.getState().setCurrentPage(payload.slideIndex + 1);
        }

        const sessionId = store.session?.sessionId;
        if (sessionId) {
          persistReconnectState({
            sessionId,
            isExploring: store.isExploring,
            localSlide: store.isExploring
              ? useViewerStore.getState().currentPage
              : payload.slideIndex + 1,
          });
        }
      });
    };

    const onLightweightSlideChange = (payload: { roomId: string; slide: number }) => {
      this.queueStoreUpdate(() => {
        const store = useSyncStore.getState();
        if (store.isPresenter) {
          return;
        }

        if (payload.roomId !== (store.session?.sessionId ?? '')) {
          return;
        }

        useViewerStore.getState().setCurrentPage(payload.slide);
      });
    };

    const onPresenterChanged = (payload: {
      newPresenterId: string;
      newPresenterName: string;
      previousPresenterId: string;
    }) => {
      this.queueStoreUpdate(() => {
        const store = useSyncStore.getState();
        store.transferPresenter(payload.newPresenterId, payload.newPresenterName);

        const currentUserId = useAuthStore.getState().user?.id;
        const isNowPresenter = payload.newPresenterId === currentUserId;
        const wasPresenter = payload.previousPresenterId === currentUserId;

        store.setIsPresenter(isNowPresenter);

        if (isNowPresenter) {
          store.receiveHandoff();
          window.setTimeout(() => useSyncStore.getState().completeHandoff(), 1500);
        } else if (wasPresenter) {
          store.completeHandoff();
          window.setTimeout(() => useSyncStore.getState().setIsExploring(false), 500);
        }
      });
    };

    const onParticipantJoined = (payload: { member: ServerMember }) => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().addMember({
          ...payload.member,
          isConnected: true,
        });
        useUxStore.getState().addActivity({
          id: Math.random().toString(36).slice(2),
          type: 'join',
          userId: payload.member.userId,
          displayName: payload.member.displayName,
          timestamp: new Date().toISOString()
        });
      });
    };

    const onParticipantReconnected = (payload: { userId: string }) => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setMemberConnected(payload.userId, true);
      });
    };

    const onParticipantLeft = (payload: { userId: string }) => {
      this.queueStoreUpdate(() => {
        cursorManager.removeCursor(payload.userId);
        const member = useSyncStore.getState().members[payload.userId];
        if (member) {
          useUxStore.getState().addActivity({
            id: Math.random().toString(36).slice(2),
            type: 'leave',
            userId: payload.userId,
            displayName: member.displayName,
            timestamp: new Date().toISOString()
          });
        }
        useSyncStore.getState().removeMember(payload.userId);
      });
    };

    const onPresenterDisconnected = (payload: { presenterId: string }) => {
      if (payload.presenterId === useAuthStore.getState().user?.id) {
        return;
      }
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setPresenterDisconnected(true);
        useSyncStore.getState().setMemberConnected(payload.presenterId, false);
      });
    };

    const onPresenterReconnected = (payload: { presenterId: string }) => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setPresenterDisconnected(false);
        useSyncStore.getState().setMemberConnected(payload.presenterId, true);
      });
    };

    const onPresenterGraceExpired = () => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setPresenterDisconnected(true);
      });
    };

    const onViewerExploring = (payload: { userId: string }) => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setMemberExploring(payload.userId, true);
      });
    };

    const onSessionEnded = () => {
      this.queueStoreUpdate(() => {
        useSyncStore.getState().endSession();
      });
      this.shouldRecoverOnConnect = false;
      clearReconnectState();
    };

    const onConnect = () => {
      if (!this.shouldRecoverOnConnect || !this.activeContext) {
        return;
      }

      void this.recoverAfterReconnect();
    };

    const onDisconnect = () => {
      if (!useSyncStore.getState().session?.sessionId) {
        return;
      }

      this.shouldRecoverOnConnect = true;
      this.queueStoreUpdate(() => {
        useSyncStore.getState().setConnectionStatus('reconnecting');
      });
    };

    socket.on('session:state', onSessionState);
    socket.on('slide:changed', onSlideChanged);
    socket.on('slide:change', onLightweightSlideChange);
    socket.on('presenter:changed', onPresenterChanged);
    socket.on('participant:joined', onParticipantJoined);
    socket.on('participant:reconnected', onParticipantReconnected);
    socket.on('participant:left', onParticipantLeft);
    socket.on('presenter:disconnected', onPresenterDisconnected);
    socket.on('presenter:reconnected', onPresenterReconnected);
    socket.on('presenter:grace_expired', onPresenterGraceExpired);
    socket.on('viewer:exploring', onViewerExploring);
    socket.on('session:ended', onSessionEnded);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    assertSingleSocketListener(socket, 'session:state', 'SessionManager');
    assertSingleSocketListener(socket, 'slide:changed', 'SessionManager');
    assertSingleSocketListener(socket, 'presenter:changed', 'SessionManager');

    this.unbindPresenterListeners = () => {
      socket.off('session:state', onSessionState);
      socket.off('slide:changed', onSlideChanged);
      socket.off('slide:change', onLightweightSlideChange);
      socket.off('presenter:changed', onPresenterChanged);
      socket.off('participant:joined', onParticipantJoined);
      socket.off('participant:reconnected', onParticipantReconnected);
      socket.off('participant:left', onParticipantLeft);
      socket.off('presenter:disconnected', onPresenterDisconnected);
      socket.off('presenter:reconnected', onPresenterReconnected);
      socket.off('presenter:grace_expired', onPresenterGraceExpired);
      socket.off('viewer:exploring', onViewerExploring);
      socket.off('session:ended', onSessionEnded);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }

  private async recoverAfterReconnect(): Promise<void> {
    if (!this.activeContext) {
      return;
    }

    if (this.recoveringPromise) {
      return this.recoveringPromise;
    }

    const socket = socketManager.getPresenterSocket();
    if (!socket) {
      return;
    }

    this.recoveringPromise = (async () => {
      this.setSessionState('recovering', {
        roomId: this.activeContext?.roomId,
        deckId: this.activeContext?.deckId,
      });
      const restored = await recoverPresenterSession(
        socket,
        {
          roomId: this.activeContext!.roomId,
          deckId: this.activeContext!.deckId,
          onSlideRestored: (slidePage) => {
            useViewerStore.getState().setCurrentPage(slidePage);
          },
        },
        useSyncStore.getState().session?.sessionId ?? null
      );

      if (!restored) {
        this.queueStoreUpdate(() => {
          useSyncStore.getState().setConnectionStatus('error');
        });
      } else {
        // Replay queued events after successful session recovery
        const presenterSocket = socketManager.getPresenterSocket();
        if (presenterSocket) {
          replayManager.replayAll(presenterSocket).catch((err) => {
            logger.warn('[SessionManager] Replay failed after reconnect', err);
          });
        }
      }
      this.setSessionState('active', {
        roomId: this.activeContext?.roomId,
        deckId: this.activeContext?.deckId,
      });
    })().finally(() => {
      this.recoveringPromise = null;
    });

    return this.recoveringPromise;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Collaboration UX Actions
  // ─────────────────────────────────────────────────────────────────────────────

  sendReaction(reaction: string): void {
    const store = useSyncStore.getState();
    const sessionId = store.session?.sessionId;
    if (!sessionId) return;
    const socket = socketManager.getCollaborationSocket();
    if (!socket) return;
    
    socket.emit('reaction:send', { roomId: sessionId, reaction });
  }

  raiseHand(): void {
    const store = useSyncStore.getState();
    const sessionId = store.session?.sessionId;
    if (!sessionId) return;
    const socket = socketManager.getCollaborationSocket();
    if (!socket) return;
    
    socket.emit('hand:raise', { roomId: sessionId });
  }

  lowerHand(targetUserId?: string): void {
    const store = useSyncStore.getState();
    const sessionId = store.session?.sessionId;
    const user = useAuthStore.getState().user;
    if (!sessionId || !user) return;
    const socket = socketManager.getCollaborationSocket();
    if (!socket) return;
    
    // Presenters can lower anyone's hand, viewers can only lower their own
    const userIdToLower = (store.isPresenter && targetUserId) ? targetUserId : user.id;
    socket.emit('hand:lower', { roomId: sessionId, userId: userIdToLower });
  }

  private applySessionState(payload: SessionStatePayload): void {
    this.queueStoreUpdate(() => {
      const store = useSyncStore.getState();

      store.initSession(
        {
          sessionId: payload.session.sessionId,
          deckId: payload.session.deckId,
          presenterId: payload.session.presenterId,
          presenterName: payload.session.presenterName,
          currentSlide: payload.session.currentSlide,
          totalSlides: payload.session.totalSlides,
          sequenceNum: payload.session.sequenceNum,
          status: payload.session.status as 'active' | 'waiting' | 'ended',
        },
        payload.members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
          color: member.color,
          role: member.role,
          isExploring: member.isExploring,
          isConnected: true,
        })),
        payload.isPresenter
      );

      store.setConnectionStatus('connected');

      persistReconnectState({
        sessionId: payload.session.sessionId,
        isExploring: store.isExploring,
        localSlide: useViewerStore.getState().currentPage,
      });
    });
  }

  private broadcastPresenterSlide(currentPage: number): void {
    const store = useSyncStore.getState();
    const sessionId = store.session?.sessionId;

    if (!store.isPresenter || !sessionId) {
      return;
    }

    const socket = socketManager.getPresenterSocket();
    if (!socket) {
      return;
    }

    const payload = {
      roomId: sessionId,
      slide: currentPage,
    };
    if (!RealtimeSchemas.slideChange.safeParse(payload).success) {
      logger.warn('[SessionManager] Dropped invalid slide:change payload', payload);
      return;
    }
    socket.emit('slide:change', payload);
  }
}

export const sessionManager = new SessionManager();
