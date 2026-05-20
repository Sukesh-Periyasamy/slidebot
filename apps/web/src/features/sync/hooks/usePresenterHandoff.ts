import { useCallback } from 'react';

import { useAuthStore } from '@/features/auth/store/authStore';
import {
  selectHandoffStatus,
  selectIsPresenter,
  selectMembers,
  useSyncStore,
} from '../store/syncStore';
import type { useSyncEngine } from './useSyncEngine';

// ─────────────────────────────────────────────────────────────────────────────
// usePresenterHandoff — manages the complete handoff flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Presenter handoff state machine:
 *
 *   idle ──→ requesting ──→ complete ──→ idle
 *                                          ↑
 *   idle ──→ receiving  ──→ complete ──────┘
 *
 * Cancellation: any state → idle
 *
 * The handoff is server-authoritative:
 * - Current presenter sends handoff request
 * - Server validates and broadcasts presenter:changed
 * - All clients update state based on broadcast (not the sender's ack)
 */
export function usePresenterHandoff(engine: ReturnType<typeof useSyncEngine>) {
  const user = useAuthStore((s) => s.user);
  const members = useSyncStore(selectMembers);
  const isPresenter = useSyncStore(selectIsPresenter);
  const handoffStatus = useSyncStore(selectHandoffStatus);
  const handoffTargetUserId = useSyncStore((s) => s.handoffTargetUserId);
  const handoffTargetName = useSyncStore((s) => s.handoffTargetName);
  const cancelHandoff = useSyncStore((s) => s.cancelHandoff);

  // Members eligible to receive handoff (everyone except current presenter)
  const eligibleMembers = members.filter((m) => m.userId !== user?.id && m.isConnected);

  // Initiate handoff to a specific user
  const initiateHandoff = useCallback(
    (toUserId: string, toUserName: string) => {
      if (!isPresenter) return;
      engine.handoffTo(toUserId, toUserName);
    },
    [isPresenter, engine]
  );

  // Cancel a pending handoff (before server processes it)
  const cancel = useCallback(() => {
    cancelHandoff();
  }, [cancelHandoff]);

  return {
    // State
    handoffStatus,
    handoffTargetUserId,
    handoffTargetName,
    eligibleMembers,
    isPresenter,
    canHandoff: isPresenter && eligibleMembers.length > 0,

    // Actions
    initiateHandoff,
    cancel,
  };
}
