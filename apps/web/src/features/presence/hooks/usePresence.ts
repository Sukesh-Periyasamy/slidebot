import { useMemo } from 'react';

import {
  usePresenceStore,
} from '../store/presenceStore';

export function usePresence() {
  const participantMap = usePresenceStore((state) => state.participants);
  const connectionState = usePresenceStore((state) => state.connectionState);
  const sessionId = usePresenceStore((state) => state.sessionId);
  const reconnectAttempts = usePresenceStore((state) => state.reconnectAttempts);
  const localUserId = usePresenceStore((state) => state.localUserId);

  const participants = useMemo(
    () =>
      Object.values(participantMap).sort((left, right) => {
        if (left.isPresenter !== right.isPresenter) {
          return left.isPresenter ? -1 : 1;
        }

        return left.displayName.localeCompare(right.displayName);
      }),
    [participantMap]
  );

  const presenter = useMemo(
    () => participants.find((participant) => participant.isPresenter) ?? null,
    [participants]
  );

  return {
    participants,
    presenter,
    connectionState,
    sessionId,
    reconnectAttempts,
    localUserId,
  };
}
