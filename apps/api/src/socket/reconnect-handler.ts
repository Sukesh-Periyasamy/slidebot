/**
 * ReconnectHandler — manages the full reconnect recovery flow.
 *
 * When a socket reconnects (same userId, new socket ID):
 * 1. Re-join all session rooms the user was in (looked up from Redis)
 * 2. Broadcast presence_restored to room members
 * 3. If user was presenter: cancel grace timer, confirm authority
 * 4. Return full session snapshot in ack
 *
 * The client's session:join ack already handles most of this — this module
 * provides the additional cross-cutting concerns (grace, presence, annotations).
 */

import type { Namespace } from 'socket.io';
import { logger } from '../config/logger';
import { roomManager } from './room-manager';
import { cancelPresenterGrace, startPresenterGrace } from './heartbeat';

export interface ReconnectResult {
  restored: boolean;
  wasPresenter: boolean;
  session: {
    sessionId: string;
    deckId: string;
    currentSlide: number;
    totalSlides: number;
    sequenceNum: number;
    presenterId: string;
    presenterName: string;
    status: string;
  } | null;
  members: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    color: string;
    role: 'presenter' | 'viewer';
    isExploring: boolean;
  }>;
}

export async function handleReconnect(
  ns: Namespace,
  socketId: string,
  userId: string,
  displayName: string,
  avatarUrl: string | null,
  color: string,
  sessionId: string
): Promise<ReconnectResult> {
  const session = await roomManager.getSession(sessionId);

  if (!session || session.status === 'ended') {
    return { restored: false, wasPresenter: false, session: null, members: [] };
  }

  const wasPresenter = session.presenterId === userId;

  // Re-add member (updates joinedAt, preserves exploring state)
  await roomManager.addMember(sessionId, {
    userId,
    displayName,
    avatarUrl,
    color,
    role: wasPresenter ? 'presenter' : 'viewer',
    isExploring: false, // Reset on reconnect — follow presenter
    joinedAt: Date.now(),
  });

  // If presenter reconnected — cancel grace period
  if (wasPresenter) {
    cancelPresenterGrace(sessionId);

    // Notify room that presenter is back
    ns.to(`session:${sessionId}`).emit(
      'presenter:reconnected' as never,
      {
        sessionId,
        presenterId: userId,
        presenterName: displayName,
      } as never
    );

    logger.info({ sessionId, userId }, 'Presenter reconnected — grace cancelled');
  } else {
    // Notify room that viewer reconnected
    ns.to(`session:${sessionId}`).emit(
      'participant:reconnected' as never,
      {
        sessionId,
        userId,
        displayName,
      } as never
    );
  }

  const members = await roomManager.getMembers(sessionId);

  logger.info(
    { sessionId, userId, wasPresenter, memberCount: members.length },
    'Reconnect restore complete'
  );

  return {
    restored: true,
    wasPresenter,
    session: {
      sessionId: session.sessionId,
      deckId: session.deckId,
      currentSlide: session.currentSlide,
      totalSlides: session.totalSlides,
      sequenceNum: session.sequenceNum,
      presenterId: session.presenterId,
      presenterName: session.presenterName,
      status: session.status,
    },
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      color: m.color,
      role: m.role,
      isExploring: m.isExploring,
    })),
  };
}

/**
 * Start the presenter grace period on disconnect.
 * Exported so presenter.ts can call this inside its disconnect handler.
 */
export function initiatePresenterGrace(
  sessionId: string,
  presenterId: string,
  ns: Namespace
): void {
  startPresenterGrace(sessionId, presenterId, ns, async (sid, pid) => {
    // Grace expired — check if we should auto-promote
    const session = await roomManager.getSession(sid);
    if (!session || session.presenterId !== pid) return; // Already handled

    const members = await roomManager.getMembers(sid);
    const others = members.filter((m) => m.userId !== pid && m.role !== 'presenter');

    if (others.length === 0) {
      // Room empty — end session
      await roomManager.endSession(sid);
      ns.to(`session:${sid}`).emit(
        'session:ended' as never,
        {
          sessionId: sid,
          reason: 'presenter_abandoned',
        } as never
      );
      logger.info({ sessionId: sid }, 'Session ended — presenter abandoned, no viewers');
    }
    // If viewers remain: UI shows "Presenter disconnected" — they can wait or handoff
  });
}
