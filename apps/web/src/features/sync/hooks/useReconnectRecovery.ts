import type { Socket } from 'socket.io-client';

import { logger } from '@/lib/logger';
import { RealtimeSchemas } from '@slidebot/shared-types';
import { useSyncStore } from '../store/syncStore';
import type { SyncSession, SessionMember } from '../store/syncStore';

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

export interface ReconnectContext {
  roomId: string;
  deckId: string;
  onSlideRestored?: (slidePage: number) => void;
}

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
    // no-op
  }
}

export function clearReconnectState(): void {
  try {
    sessionStorage.removeItem(PERSIST_KEY_SESSION);
    sessionStorage.removeItem(PERSIST_KEY_EXPLORING);
    sessionStorage.removeItem(PERSIST_KEY_LOCAL_SLIDE);
  } catch {
    // no-op
  }
}

export function loadReconnectState() {
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

export async function recoverPresenterSession(
  socket: Socket,
  context: ReconnectContext,
  explicitSessionId: string | null
): Promise<boolean> {
  const persisted = loadReconnectState();
  const targetSessionId = explicitSessionId ?? persisted.sessionId ?? context.roomId;

  if (!targetSessionId) {
    return false;
  }

  useSyncStore.getState().setConnectionStatus('reconnecting');

  const result = await new Promise<SessionJoinAck>((resolve) => {
    const payload = {
      sessionId: targetSessionId,
      deckId: context.deckId,
    };
    if (!RealtimeSchemas.sessionJoin.safeParse(payload).success) {
      resolve({ ok: false, error: 'Invalid session:join payload during reconnect' });
      return;
    }
    socket.emit(
      'session:join',
      payload,
      (ack: SessionJoinAck) => resolve(ack)
    );
  });

  if (!result.ok || !result.session) {
    logger.warn('[ReconnectRecovery] session:join failed during recovery', result.error);
    useSyncStore.getState().setConnectionStatus('error');
    return false;
  }

  const restoredSession = normaliseSession(result.session);
  const members = (result.members ?? []).map(normaliseMember);
  const isPresenter = result.isPresenter ?? false;

  useSyncStore.getState().initSession(restoredSession, members, isPresenter);
  useSyncStore.getState().setConnectionStatus('connected');

  if (!isPresenter && persisted.isExploring && persisted.localSlide > 0) {
    useSyncStore.getState().setIsExploring(true);
    context.onSlideRestored?.(persisted.localSlide);
  } else {
    useSyncStore.getState().setIsExploring(false);
    context.onSlideRestored?.(restoredSession.currentSlide + 1);
  }

  persistReconnectState({
    sessionId: restoredSession.sessionId,
    isExploring: useSyncStore.getState().isExploring,
    localSlide: useSyncStore.getState().isExploring
      ? persisted.localSlide
      : restoredSession.currentSlide + 1,
  });

  return true;
}

function normaliseSession(session: ServerSession): SyncSession {
  return {
    sessionId: session.sessionId,
    deckId: session.deckId,
    presenterId: session.presenterId,
    presenterName: session.presenterName,
    currentSlide: session.currentSlide,
    totalSlides: session.totalSlides,
    sequenceNum: session.sequenceNum,
    status: session.status as SyncSession['status'],
  };
}

function normaliseMember(member: ServerMember): SessionMember {
  return {
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    color: member.color,
    role: member.role,
    isExploring: member.isExploring,
    isConnected: true,
  };
}
