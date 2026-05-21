/**
 * RoomManager — Redis-backed session state for the sync engine.
 *
 * All session state lives in Redis (not in-memory) so that:
 * - Multiple API server instances share the same truth
 * - State survives server restarts (Redis persistence)
 * - Reconnecting clients receive correct state immediately
 *
 * Redis key structure:
 *   session:{sessionId}          → HASH  (session metadata)
 *   session:{sessionId}:members  → SET   (active participant userIds)
 *
 * Sequence numbers prevent out-of-order event processing.
 */
import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';
import { generateId } from '@slidebot/shared-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = 'waiting' | 'active' | 'ended';

export interface SessionState {
  sessionId: string;
  deckId: string;
  presenterId: string;
  presenterName: string;
  currentSlide: number;
  totalSlides: number;
  sequenceNum: number;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isExploring: boolean;
  joinedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Keys
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds

const keys = {
  session: (id: string) => `session:${id}`,
  members: (id: string) => `session:${id}:members`,
  memberInfo: (id: string, userId: string) => `session:${id}:member:${userId}`,
  /** Maps deckId → active sessionId for quick lookup */
  deckSession: (deckId: string) => `deck:${deckId}:activeSession`,
};

// ─────────────────────────────────────────────────────────────────────────────
// RoomManager
// ─────────────────────────────────────────────────────────────────────────────

export class RoomManager {
  private redis = getRedisClient();

  // ── Session lifecycle ─────────────────────────────────────────────────────

  async createSession(
    deckId: string,
    presenter: { userId: string; displayName: string },
    totalSlides: number
  ): Promise<SessionState> {
    const sessionId = generateId();
    const now = Date.now();

    const session: SessionState = {
      sessionId,
      deckId,
      presenterId: presenter.userId,
      presenterName: presenter.displayName,
      currentSlide: 0,
      totalSlides,
      sequenceNum: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const pipeline = this.redis.pipeline();

    // Store session hash
    pipeline.hset(keys.session(sessionId), this.sessionToHash(session));
    pipeline.expire(keys.session(sessionId), SESSION_TTL);

    // Map deck → session
    pipeline.set(keys.deckSession(deckId), sessionId, 'EX', SESSION_TTL);

    await pipeline.exec();

    logger.info({ sessionId, deckId, presenterId: presenter.userId }, 'Session created');
    return session;
  }

  async getSession(sessionId: string): Promise<SessionState | null> {
    const data = await this.redis.hgetall(keys.session(sessionId));
    if (!data || Object.keys(data).length === 0) return null;
    return this.hashToSession(data);
  }

  async getActiveSessionForDeck(deckId: string): Promise<SessionState | null> {
    const sessionId = await this.redis.get(keys.deckSession(deckId));
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    const pipeline = this.redis.pipeline();
    pipeline.hset(keys.session(sessionId), 'status', 'ended', 'updatedAt', Date.now());
    pipeline.expire(keys.session(sessionId), 3600); // Keep for 1hr after end
    pipeline.del(keys.deckSession(session.deckId));
    await pipeline.exec();

    logger.info({ sessionId }, 'Session ended');
  }

  // ── Slide navigation ──────────────────────────────────────────────────────

  /**
   * Atomically advance slide and increment sequence number.
   * Returns the new state, or null if validation fails.
   */
  async changeSlide(
    sessionId: string,
    requestingUserId: string,
    targetSlide: number
  ): Promise<{ session: SessionState; sequenceNum: number } | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    if (session.status !== 'active') return null;

    // Only the presenter can change slides
    if (session.presenterId !== requestingUserId) {
      logger.warn(
        { sessionId, requestingUserId, presenterId: session.presenterId },
        'Unauthorized slide change attempt'
      );
      return null;
    }

    // Clamp to valid range
    const newSlide = Math.max(0, Math.min(targetSlide, session.totalSlides - 1));
    const now = Date.now();

    // Increment the sequence number atomically so rapid slide changes cannot reuse a stale value.
    const newSeq = await this.redis.hincrby(keys.session(sessionId), 'sequenceNum', 1);

    await this.redis.hset(keys.session(sessionId), {
      currentSlide: newSlide,
      sequenceNum: newSeq,
      updatedAt: now,
    });

    // Extend TTL on activity
    await this.redis.expire(keys.session(sessionId), SESSION_TTL);

    return {
      session: { ...session, currentSlide: newSlide, sequenceNum: newSeq, updatedAt: now },
      sequenceNum: newSeq,
    };
  }

  // ── Presenter handoff ─────────────────────────────────────────────────────

  async handoffPresenter(
    sessionId: string,
    fromUserId: string,
    toUserId: string,
    toUserName: string
  ): Promise<SessionState | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    // Only current presenter can hand off
    if (session.presenterId !== fromUserId) return null;

    // Verify target user is in the session
    const isMember = await this.redis.sismember(keys.members(sessionId), toUserId);
    if (!isMember) {
      logger.warn({ sessionId, toUserId }, 'Handoff target not in session');
      return null;
    }

    const now = Date.now();
    await this.redis.hset(keys.session(sessionId), {
      presenterId: toUserId,
      presenterName: toUserName,
      updatedAt: now,
    });

    logger.info({ sessionId, fromUserId, toUserId }, 'Presenter handoff');
    return { ...session, presenterId: toUserId, presenterName: toUserName, updatedAt: now };
  }

  // ── Member management ─────────────────────────────────────────────────────

  async addMember(sessionId: string, member: SessionMember): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.sadd(keys.members(sessionId), member.userId);
    pipeline.hset(keys.memberInfo(sessionId, member.userId), {
      ...member,
      joinedAt: member.joinedAt,
      isExploring: member.isExploring ? 1 : 0,
    });
    pipeline.expire(keys.memberInfo(sessionId, member.userId), SESSION_TTL);
    await pipeline.exec();
  }

  async removeMember(sessionId: string, userId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.srem(keys.members(sessionId), userId);
    pipeline.del(keys.memberInfo(sessionId, userId));
    await pipeline.exec();
  }

  async getMembers(sessionId: string): Promise<SessionMember[]> {
    const userIds = await this.redis.smembers(keys.members(sessionId));
    if (userIds.length === 0) return [];

    const members = await Promise.all(
      userIds.map(async (userId) => {
        const data = await this.redis.hgetall(keys.memberInfo(sessionId, userId));
        if (!data || Object.keys(data).length === 0) return null;
        return {
          userId: data['userId'] ?? userId,
          displayName: data['displayName'] ?? 'Unknown',
          avatarUrl: data['avatarUrl'] ?? null,
          color: data['color'] ?? '#6173F2',
          role: (data['role'] ?? 'viewer') as SessionMember['role'],
          isExploring: data['isExploring'] === '1',
          joinedAt: Number(data['joinedAt'] ?? 0),
        } satisfies SessionMember;
      })
    );

    return members.filter((m): m is SessionMember => m !== null);
  }

  async setExplorationMode(sessionId: string, userId: string, isExploring: boolean): Promise<void> {
    await this.redis.hset(keys.memberInfo(sessionId, userId), 'isExploring', isExploring ? 1 : 0);
  }

  async getMemberCount(sessionId: string): Promise<number> {
    return this.redis.scard(keys.members(sessionId));
  }

  // ── Serialization helpers ─────────────────────────────────────────────────

  private sessionToHash(s: SessionState): Record<string, string | number> {
    return {
      sessionId: s.sessionId,
      deckId: s.deckId,
      presenterId: s.presenterId,
      presenterName: s.presenterName,
      currentSlide: s.currentSlide,
      totalSlides: s.totalSlides,
      sequenceNum: s.sequenceNum,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private hashToSession(data: Record<string, string>): SessionState {
    return {
      sessionId: data['sessionId'] ?? '',
      deckId: data['deckId'] ?? '',
      presenterId: data['presenterId'] ?? '',
      presenterName: data['presenterName'] ?? '',
      currentSlide: Number(data['currentSlide'] ?? 0),
      totalSlides: Number(data['totalSlides'] ?? 0),
      sequenceNum: Number(data['sequenceNum'] ?? 0),
      status: (data['status'] ?? 'active') as SessionStatus,
      createdAt: Number(data['createdAt'] ?? 0),
      updatedAt: Number(data['updatedAt'] ?? 0),
    };
  }
}

// Singleton instance
export const roomManager = new RoomManager();
