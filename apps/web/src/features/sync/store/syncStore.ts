import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

export type HandoffStatus =
  | 'idle'
  | 'requesting' // Current user sent handoff
  | 'receiving' // Current user is receiving handoff
  | 'confirming' // Waiting for new presenter to confirm
  | 'complete';

export interface SessionMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  role: 'presenter' | 'viewer';
  isExploring: boolean;
  isConnected: boolean;
}

export interface SyncSession {
  sessionId: string;
  deckId: string;
  presenterId: string;
  presenterName: string;
  currentSlide: number;
  totalSlides: number;
  sequenceNum: number;
  status: 'active' | 'waiting' | 'ended';
}

interface SyncState {
  // Connection
  connectionStatus: ConnectionStatus;
  reconnectAttempts: number;
  lastConnectedAt: number | null;

  // Session
  session: SyncSession | null;
  members: Record<string, SessionMember>;

  // Own state
  isPresenter: boolean;
  isExploring: boolean;
  /** Last sequence number this client has seen — detects missed events */
  lastSeenSeq: number;

  // Handoff
  handoffStatus: HandoffStatus;
  handoffTargetUserId: string | null;
  handoffTargetName: string | null;
  presenterDisconnected: boolean;
  presenterDisconnectedAt: number | null;

  // Actions — connection
  setConnectionStatus: (status: ConnectionStatus) => void;
  setReconnectAttempts: (n: number) => void;

  // Actions — session
  initSession: (session: SyncSession, members: SessionMember[], isPresenter: boolean) => void;
  updateCurrentSlide: (slideIndex: number, seqNum: number) => void;
  transferPresenter: (newPresenterId: string, newPresenterName: string) => void;
  endSession: () => void;

  // Actions — members
  addMember: (member: SessionMember) => void;
  removeMember: (userId: string) => void;
  setMemberExploring: (userId: string, exploring: boolean) => void;
  setMemberConnected: (userId: string, connected: boolean) => void;

  // Actions — own state
  setIsPresenter: (isPresenter: boolean) => void;
  setIsExploring: (exploring: boolean) => void;

  // Actions — handoff
  startHandoff: (targetUserId: string, targetName: string) => void;
  receiveHandoff: () => void;
  completeHandoff: () => void;
  cancelHandoff: () => void;
  setPresenterDisconnected: (disconnected: boolean) => void;

  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

const initialState = {
  connectionStatus: 'idle' as ConnectionStatus,
  reconnectAttempts: 0,
  lastConnectedAt: null,
  session: null,
  members: {},
  isPresenter: false,
  isExploring: false,
  lastSeenSeq: -1,
  handoffStatus: 'idle' as HandoffStatus,
  handoffTargetUserId: null,
  handoffTargetName: null,
  presenterDisconnected: false,
  presenterDisconnectedAt: null,
};

export const useSyncStore = create<SyncState>()(
  devtools(
    subscribeWithSelector(
      immer((set) => ({
        ...initialState,

        // ── Connection ────────────────────────────────────────────────────
        setConnectionStatus: (connectionStatus) =>
          set((s) => {
            s.connectionStatus = connectionStatus;
            if (connectionStatus === 'connected') {
              s.lastConnectedAt = Date.now();
              s.reconnectAttempts = 0;
            }
          }),

        setReconnectAttempts: (reconnectAttempts) =>
          set((s) => {
            s.reconnectAttempts = reconnectAttempts;
          }),

        // ── Session lifecycle ─────────────────────────────────────────────
        initSession: (session, members, isPresenter) =>
          set((s) => {
            s.session = session;
            s.members = Object.fromEntries(members.map((m) => [m.userId, m]));
            s.isPresenter = isPresenter;
            s.lastSeenSeq = session.sequenceNum;
            s.presenterDisconnected = false;
            s.handoffStatus = 'idle';
          }),

        updateCurrentSlide: (slideIndex, seqNum) =>
          set((s) => {
            if (!s.session) return;
            // Discard out-of-order events
            if (seqNum <= s.lastSeenSeq && seqNum !== 0) return;
            s.session.currentSlide = slideIndex;
            s.session.sequenceNum = seqNum;
            s.lastSeenSeq = seqNum;
          }),

        transferPresenter: (newPresenterId, newPresenterName) =>
          set((s) => {
            if (!s.session) return;
            s.session.presenterId = newPresenterId;
            s.session.presenterName = newPresenterName;

            // Update member roles
            Object.values(s.members).forEach((m: any) => {
              m.role = m.userId === newPresenterId ? 'presenter' : 'viewer';
            });

            s.presenterDisconnected = false;
          }),

        endSession: () =>
          set((s) => {
            if (s.session) s.session.status = 'ended';
          }),

        // ── Members ───────────────────────────────────────────────────────
        addMember: (member) =>
          set((s) => {
            s.members[member.userId] = member;
          }),

        removeMember: (userId) =>
          set((s) => {
            delete s.members[userId];
          }),

        setMemberExploring: (userId, exploring) =>
          set((s) => {
            if (s.members[userId]) s.members[userId]!.isExploring = exploring;
          }),

        setMemberConnected: (userId, connected) =>
          set((s) => {
            if (s.members[userId]) s.members[userId]!.isConnected = connected;
          }),

        // ── Own state ─────────────────────────────────────────────────────
        setIsPresenter: (isPresenter) =>
          set((s) => {
            s.isPresenter = isPresenter;
          }),

        setIsExploring: (isExploring) =>
          set((s) => {
            s.isExploring = isExploring;
          }),

        // ── Handoff ───────────────────────────────────────────────────────
        startHandoff: (targetUserId, targetName) =>
          set((s) => {
            s.handoffStatus = 'requesting';
            s.handoffTargetUserId = targetUserId;
            s.handoffTargetName = targetName;
          }),

        receiveHandoff: () =>
          set((s) => {
            s.handoffStatus = 'receiving';
          }),

        completeHandoff: () =>
          set((s) => {
            s.handoffStatus = 'complete';
            s.handoffTargetUserId = null;
            s.handoffTargetName = null;
            // Reset to idle after brief delay (handled by caller)
          }),

        cancelHandoff: () =>
          set((s) => {
            s.handoffStatus = 'idle';
            s.handoffTargetUserId = null;
            s.handoffTargetName = null;
          }),

        setPresenterDisconnected: (presenterDisconnected) =>
          set((s) => {
            s.presenterDisconnected = presenterDisconnected;
            s.presenterDisconnectedAt = presenterDisconnected ? Date.now() : null;
          }),

        reset: () => set(() => ({ ...initialState })),
      }))
    ),
    { name: 'SyncStore' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectSession = (s: SyncState) => s.session;
export const selectIsPresenter = (s: SyncState) => s.isPresenter;
export const selectIsExploring = (s: SyncState) => s.isExploring;
export const selectMembers = (s: SyncState) => Object.values(s.members);
export const selectOtherMembers = (userId: string) => (s: SyncState) =>
  Object.values(s.members).filter((m) => m.userId !== userId);
export const selectConnectionStatus = (s: SyncState) => s.connectionStatus;
export const selectHandoffStatus = (s: SyncState) => s.handoffStatus;
export const selectPresenterDisconnected = (s: SyncState) => s.presenterDisconnected;
export const selectCurrentSlide = (s: SyncState) => s.session?.currentSlide ?? 0;
