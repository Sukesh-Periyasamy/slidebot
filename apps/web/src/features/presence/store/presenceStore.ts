import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type PresenceConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface PresenceParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isPresenter: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  isOnline: boolean;
  isIdle: boolean;
  isSpeaking: boolean;
  cursorPulseAt: number | null;
  lastSeenAt: number;
  slideId: string | null;
  isActive: boolean;
}

interface PresenceState {
  sessionId: string | null;
  connectionState: PresenceConnectionState;
  reconnectAttempts: number;
  participants: Record<string, PresenceParticipant>;
  localUserId: string | null;
  setSessionId: (sessionId: string | null) => void;
  setConnectionState: (state: PresenceConnectionState) => void;
  setReconnectAttempts: (attempts: number) => void;
  setParticipants: (participants: PresenceParticipant[]) => void;
  upsertParticipant: (participant: PresenceParticipant) => void;
  updateParticipant: (userId: string, updates: Partial<PresenceParticipant>) => void;
  removeParticipant: (userId: string) => void;
  touchParticipant: (userId: string, updates?: Partial<PresenceParticipant>) => void;
  setLocalUserId: (userId: string | null) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  connectionState: 'idle' as PresenceConnectionState,
  reconnectAttempts: 0,
  participants: {} as Record<string, PresenceParticipant>,
  localUserId: null as string | null,
};

function isEqualParticipant(left: PresenceParticipant | undefined, right: PresenceParticipant): boolean {
  if (!left) return false;

  return (
    left.userId === right.userId &&
    left.displayName === right.displayName &&
    left.avatarUrl === right.avatarUrl &&
    left.color === right.color &&
    left.role === right.role &&
    left.isPresenter === right.isPresenter &&
    left.isConnected === right.isConnected &&
    left.isReconnecting === right.isReconnecting &&
    left.isOnline === right.isOnline &&
    left.isIdle === right.isIdle &&
    left.isSpeaking === right.isSpeaking &&
    left.cursorPulseAt === right.cursorPulseAt &&
    left.lastSeenAt === right.lastSeenAt &&
    left.slideId === right.slideId &&
    left.isActive === right.isActive
  );
}

export const usePresenceStore = create<PresenceState>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...initialState,

        setSessionId: (sessionId) =>
          set((state) => {
            state.sessionId = sessionId;
          }),

        setConnectionState: (connectionState) =>
          set((state) => {
            state.connectionState = connectionState;
          }),

        setReconnectAttempts: (reconnectAttempts) =>
          set((state) => {
            state.reconnectAttempts = reconnectAttempts;
          }),

        setParticipants: (participants) =>
          set((state) => {
            const next = Object.fromEntries(participants.map((participant) => [participant.userId, participant]));
            const current = state.participants;
            const currentKeys = Object.keys(current);
            const nextKeys = Object.keys(next);
            const sameKeys = currentKeys.length === nextKeys.length && currentKeys.every((key) => key in next);
            const sameParticipants = sameKeys && nextKeys.every((key) => isEqualParticipant(current[key], next[key]!));

            if (sameParticipants) return;

            state.participants = next;
          }),

        upsertParticipant: (participant) =>
          set((state) => {
            const current = state.participants[participant.userId];
            if (isEqualParticipant(current, participant)) return;
            state.participants[participant.userId] = participant;
          }),

        updateParticipant: (userId, updates) =>
          set((state) => {
            const current = state.participants[userId];
            if (!current) return;

            const next = { ...current, ...updates };
            if (isEqualParticipant(current, next)) return;

            state.participants[userId] = next;
          }),

        removeParticipant: (userId) =>
          set((state) => {
            if (!state.participants[userId]) return;
            delete state.participants[userId];
          }),

        touchParticipant: (userId, updates = {}) =>
          set((state) => {
            const current = state.participants[userId];
            if (!current) return;

            const now = Date.now();
            const next = {
              ...current,
              ...updates,
              lastSeenAt: updates.lastSeenAt ?? now,
              isIdle: updates.isIdle ?? false,
              isSpeaking: updates.isSpeaking ?? current.isSpeaking,
              cursorPulseAt: updates.cursorPulseAt ?? current.cursorPulseAt,
            };

            if (isEqualParticipant(current, next)) return;

            state.participants[userId] = next;
          }),

        setLocalUserId: (localUserId) =>
          set((state) => {
            state.localUserId = localUserId;
          }),

        reset: () => set(() => ({ ...initialState })),
      }))
    ),
    { name: 'PresenceStore' }
  )
);

export const selectPresenceParticipants = (state: PresenceState) =>
  Object.values(state.participants).sort((left, right) => {
    if (left.isPresenter !== right.isPresenter) {
      return left.isPresenter ? -1 : 1;
    }

    return left.displayName.localeCompare(right.displayName);
  });

export const selectPresenterPresence = (state: PresenceState) =>
  Object.values(state.participants).find((participant) => participant.isPresenter) ?? null;

export const selectPresenceSummary = (state: PresenceState) => ({
  sessionId: state.sessionId,
  connectionState: state.connectionState,
  reconnectAttempts: state.reconnectAttempts,
  participants: selectPresenceParticipants(state),
  presenter: selectPresenterPresence(state),
  localUserId: state.localUserId,
});
