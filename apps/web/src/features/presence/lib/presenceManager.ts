import { heartbeatManager } from '@/features/collaboration/lib/heartbeatManager';
import { socketManager } from '@/features/collaboration/lib/socketManager';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { logger } from '@/lib/logger';

import { usePresenceStore, type PresenceConnectionState, type PresenceParticipant } from '../store/presenceStore';

const IDLE_TIMEOUT_MS = 45_000;
const SPEAKING_TIMEOUT_MS = 2_000;

function mapConnectionState(status: string): PresenceConnectionState {
  switch (status) {
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'reconnecting':
      return 'reconnecting';
    case 'disconnected':
    case 'error':
      return 'offline';
    default:
      return 'idle';
  }
}

function buildParticipant(
  localUserId: string | null,
  member: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    color: string;
    role: 'presenter' | 'viewer';
    isExploring: boolean;
    isConnected: boolean;
  },
  existing?: PresenceParticipant,
  connectionState?: PresenceConnectionState
): PresenceParticipant {
  const now = Date.now();
  const isPresenter = member.role === 'presenter';
  const isOnline = member.isConnected && connectionState !== 'offline';

  return {
    userId: member.userId,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    color: member.color,
    role: member.role,
    isPresenter,
    isConnected: member.isConnected,
    isReconnecting: connectionState === 'reconnecting' || (!member.isConnected && member.userId !== localUserId),
    isOnline,
    isIdle: existing?.isIdle ?? false,
    isSpeaking: existing?.isSpeaking ?? false,
    cursorPulseAt: existing?.cursorPulseAt ?? null,
    lastSeenAt: existing?.lastSeenAt ?? now,
    slideId: existing?.slideId ?? null,
    isActive: isOnline && !(existing?.isIdle ?? false),
  };
}

class PresenceManager {
  private started = false;
  private unsubscribers: Array<() => void> = [];
  private idleTimer: number | null = null;
  private speakingTimer: number | null = null;
  private localActivityListener = () => this.markLocalActivity('activity');

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers.push(
      socketManager.onStatusChange((status) => {
        this.syncConnectionState(mapConnectionState(status));
        this.syncFromSyncState();
      })
    );

    this.unsubscribers.push(
      socketManager.onReconnectAttemptsChange((attempts) => {
        usePresenceStore.getState().setReconnectAttempts(attempts);
      })
    );

    this.unsubscribers.push(
      heartbeatManager.subscribe((state) => {
        if (!state.isHealthy && usePresenceStore.getState().connectionState === 'connected') {
          this.syncConnectionState('offline');
        } else if (state.isHealthy) {
          this.syncFromSyncState();
        }
      })
    );

    this.unsubscribers.push(
      useSyncStore.subscribe(
        (state) => state.session?.sessionId ?? null,
        (sessionId) => {
          usePresenceStore.getState().setSessionId(sessionId);
          this.syncFromSyncState();
        }
      )
    );

    this.unsubscribers.push(
      useSyncStore.subscribe(
        (state) => state.members,
        () => {
          this.syncFromSyncState();
        }
      )
    );

    this.unsubscribers.push(
      useSyncStore.subscribe(
        (state) => state.connectionStatus,
        (status) => {
          this.syncConnectionState(mapConnectionState(status));
        }
      )
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.localActivityListener, { passive: true });
      window.addEventListener('pointermove', this.localActivityListener, { passive: true });
      window.addEventListener('keydown', this.localActivityListener);
      window.addEventListener('focus', this.localActivityListener);
      document.addEventListener('visibilitychange', this.localActivityListener);

      this.unsubscribers.push(() => {
        window.removeEventListener('pointerdown', this.localActivityListener);
        window.removeEventListener('pointermove', this.localActivityListener);
        window.removeEventListener('keydown', this.localActivityListener);
        window.removeEventListener('focus', this.localActivityListener);
        document.removeEventListener('visibilitychange', this.localActivityListener);
      });
    }

    if (typeof window !== 'undefined') {
      this.idleTimer = window.setInterval(() => this.reconcileIdleState(), 5_000);
    }

    this.syncFromSyncState();
    logger.debug('[PresenceManager] Started');
  }

  reset(): void {
    this.clearTimers();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.started = false;
    usePresenceStore.getState().reset();
  }

  markLocalActivity(kind: 'activity' | 'cursor' | 'speaking' = 'activity'): void {
    const localUserId = usePresenceStore.getState().localUserId ?? useAuthStore.getState().user?.id ?? null;
    if (!localUserId) return;

    usePresenceStore.getState().setLocalUserId(localUserId);
    usePresenceStore.getState().touchParticipant(localUserId, {
      lastSeenAt: Date.now(),
      isIdle: false,
      isSpeaking: kind !== 'activity' ? true : usePresenceStore.getState().participants[localUserId]?.isSpeaking ?? true,
      cursorPulseAt: kind === 'cursor' ? Date.now() : usePresenceStore.getState().participants[localUserId]?.cursorPulseAt ?? null,
    });

    this.clearSpeakingTimer();
    if (typeof window !== 'undefined') {
      this.speakingTimer = window.setTimeout(() => {
        const participant = usePresenceStore.getState().participants[localUserId];
        if (!participant) return;
        usePresenceStore.getState().updateParticipant(localUserId, { isSpeaking: false });
      }, SPEAKING_TIMEOUT_MS);
    }
  }

  touchParticipant(userId: string, updates: Partial<PresenceParticipant> = {}): void {
    if (!userId) return;
    usePresenceStore.getState().touchParticipant(userId, {
      ...updates,
      lastSeenAt: updates.lastSeenAt ?? Date.now(),
    });
  }

  setParticipantReconnecting(userId: string, reconnecting: boolean): void {
    const current = usePresenceStore.getState().participants[userId];
    if (!current) return;

    usePresenceStore.getState().updateParticipant(userId, {
      isReconnecting: reconnecting,
      isConnected: reconnecting ? false : current.isConnected,
      isOnline: reconnecting ? false : current.isOnline,
    });
  }

  private syncConnectionState(connectionState: PresenceConnectionState): void {
    usePresenceStore.getState().setConnectionState(connectionState);
  }

  private syncFromSyncState(): void {
    const syncState = useSyncStore.getState();
    const presenceState = usePresenceStore.getState();
    const localUserId = useAuthStore.getState().user?.id ?? presenceState.localUserId;
    const connectionState = mapConnectionState(syncState.connectionStatus);

    const participants = Object.values(syncState.members).map((member) =>
      buildParticipant(localUserId ?? null, member, presenceState.participants[member.userId], connectionState)
    );

    usePresenceStore.getState().setLocalUserId(localUserId ?? null);
    usePresenceStore.getState().setSessionId(syncState.session?.sessionId ?? null);
    usePresenceStore.getState().setReconnectAttempts(syncState.reconnectAttempts);
    usePresenceStore.getState().setConnectionState(connectionState);
    usePresenceStore.getState().setParticipants(participants);
  }

  private reconcileIdleState(): void {
    const now = Date.now();
    const state = usePresenceStore.getState();

    Object.values(state.participants).forEach((participant) => {
      const isIdle = now - participant.lastSeenAt > IDLE_TIMEOUT_MS;
      if (participant.isIdle === isIdle) {
        return;
      }

      state.updateParticipant(participant.userId, {
        isIdle,
        isSpeaking: isIdle ? false : participant.isSpeaking,
        isActive: participant.isOnline && !isIdle,
      });
    });
  }

  private clearSpeakingTimer(): void {
    if (this.speakingTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.speakingTimer);
      this.speakingTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.idleTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    this.clearSpeakingTimer();
  }
}

export const presenceManager = new PresenceManager();
