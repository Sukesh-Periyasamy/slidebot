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
import { gzipSync, unzipSync } from 'zlib';
import { INSTANCE_ID, instanceManager } from './instance-manager';

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
  /** Bounded replay queue for annotation events */
  replayQueue: (deckId: string, slideId: string) => `deck:${deckId}:slide:${slideId}:replay`,
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
    totalSlides: number,
    sessionIdOverride?: string
  ): Promise<SessionState> {
    const sessionId = sessionIdOverride ?? generateId();
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

  // ── Presenter authority lock ────────────────────────────────────────────────

  async acquirePresenterLease(sessionId: string, userId: string): Promise<boolean> {
    const key = `session:${sessionId}:presenter_lease`;
    const result = await this.redis.set(key, `${userId}:${INSTANCE_ID}`, 'EX', 15, 'NX');
    
    if (result !== 'OK') {
      // If the lease already exists but is held by the SAME user, allow renewal
      const current = await this.redis.get(key);
      if (current && current.startsWith(`${userId}:`)) {
        await this.redis.expire(key, 15);
        return true;
      }
      
      // Orphan cleanup check (Failover Recovery)
      if (current) {
        const [, instanceId] = current.split(':');
        if (instanceId) {
          const alive = await instanceManager.isInstanceAlive(instanceId);
          if (!alive) {
            logger.warn({ sessionId, deadInstanceId: instanceId }, 'Stealing lease from dead instance');
            await this.redis.set(key, `${userId}:${INSTANCE_ID}`, 'EX', 15);
            return true;
          }
        }
      }
      return false;
    }
    return true;
  }

  async renewPresenterLease(sessionId: string, userId: string): Promise<boolean> {
    const key = `session:${sessionId}:presenter_lease`;
    const current = await this.redis.get(key);
    if (current && current.startsWith(`${userId}:`)) {
      await this.redis.expire(key, 15);
      return true;
    }
    return false;
  }

  async releasePresenterLease(sessionId: string, userId: string): Promise<void> {
    const key = `session:${sessionId}:presenter_lease`;
    const current = await this.redis.get(key);
    if (current && current.startsWith(`${userId}:`)) {
      await this.redis.del(key);
    }
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

    logger.info({ event: 'audit', action: 'ownership_transfer', sessionId, fromUserId, toUserId }, 'Presenter ownership transferred');
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

  // ── Replay Queue & Compaction ──────────────────────────────────────────────
  
  async compactReplayQueue(deckId: string, slideId: string): Promise<void> {
    const streamKey = keys.replayQueue(deckId, slideId);
    const snapshotKey = `${streamKey}:snapshot`;
    
    // Fetch all current events
    const rawEvents = await this.redis.xrange(streamKey, '-', '+');
    if (rawEvents.length === 0) return;
    
    // Parse them
    const events = rawEvents.map((e) => {
      try {
        const payloadIndex = e[1]?.indexOf('payload') + 1;
        let payloadString = e[1]?.[payloadIndex];
        if (!payloadString) return null;
        if (payloadString.startsWith('gz:')) {
          payloadString = unzipSync(Buffer.from(payloadString.slice(3), 'base64')).toString('utf8');
        }
        return JSON.parse(payloadString);
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    // Fetch previous snapshot
    let snapshotEvents: any[] = [];
    const prevSnapshotRaw = await this.redis.get(snapshotKey);
    if (prevSnapshotRaw) {
      try {
        let prevString = prevSnapshotRaw;
        if (prevString.startsWith('gz:')) {
          prevString = unzipSync(Buffer.from(prevString.slice(3), 'base64')).toString('utf8');
        }
        snapshotEvents = JSON.parse(prevString);
      } catch (err) {
        logger.error({ err, deckId, slideId }, 'Failed to parse previous snapshot');
      }
    }
    
    // Append new events to snapshot
    // In a real delta-merge, we would reconcile points. For now, we just append to a flat array.
    snapshotEvents.push(...events);
    
    // Save new snapshot (compressed)
    const newSnapshotStr = JSON.stringify(snapshotEvents);
    const compressedSnapshot = 'gz:' + gzipSync(newSnapshotStr).toString('base64');
    
    const pipeline = this.redis.pipeline();
    pipeline.set(snapshotKey, compressedSnapshot, 'EX', SESSION_TTL);
    // Trim the stream up to the last ID we just compacted
    const lastEvent = rawEvents[rawEvents.length - 1];
    const lastId = lastEvent ? lastEvent[0] : null;
    if (lastId) {
      pipeline.xtrim(streamKey, 'MINID', lastId);
    }
    await pipeline.exec();
    
    logger.debug({ deckId, slideId, compactedEvents: events.length }, 'Replay queue compacted');
  }

  /**
   * Enqueue a real-time event to the bounded room replay queue.
   * Keeps the last 200 events (or 50 in degraded mode) to prevent memory/Redis bloat.
   */
  async enqueueReplayEvent(deckId: string, slideId: string, eventPayload: any, isDegraded = false): Promise<void> {
    const key = keys.replayQueue(deckId, slideId);
    let serialized = JSON.stringify(eventPayload);
    
    // Adaptive compression threshold: compress if larger than 512 bytes
    if (Buffer.byteLength(serialized, 'utf8') > 512) {
      serialized = 'gz:' + gzipSync(serialized).toString('base64');
    }
    
    const pipeline = this.redis.pipeline();
    // Using Redis Streams: ~ caps the stream efficiently (approximate trimming)
    const maxLen = isDegraded ? 50 : 200;
    pipeline.xadd(key, 'MAXLEN', '~', maxLen, '*', 'payload', serialized);
    pipeline.expire(key, SESSION_TTL);
    await pipeline.exec();
  }

  /**
   * Retrieve the bounded replay queue for a room.
   */
  async getReplayEvents(deckId: string, slideId: string): Promise<any[]> {
    const streamKey = keys.replayQueue(deckId, slideId);
    const snapshotKey = `${streamKey}:snapshot`;
    
    const [snapshotRaw, rawEvents] = await Promise.all([
      this.redis.get(snapshotKey),
      this.redis.xrange(streamKey, '-', '+')
    ]);
    
    let snapshotEvents: any[] = [];
    if (snapshotRaw) {
      try {
        let prevString = snapshotRaw;
        if (prevString.startsWith('gz:')) {
          prevString = unzipSync(Buffer.from(prevString.slice(3), 'base64')).toString('utf8');
        }
        snapshotEvents = JSON.parse(prevString);
      } catch (err) {
        logger.error({ err, deckId, slideId }, 'Failed to parse snapshot');
      }
    }

    const streamEvents = rawEvents.map((e) => {
      try {
        const payloadIndex = (e[1]?.indexOf('payload') ?? -1) + 1;
        let payloadString = e[1]?.[payloadIndex];
        if (!payloadString) return null;
        
        if (payloadString.startsWith('gz:')) {
          payloadString = unzipSync(Buffer.from(payloadString.slice(3), 'base64')).toString('utf8');
        }
        
        return JSON.parse(payloadString);
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    return [...snapshotEvents, ...streamEvents];
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
