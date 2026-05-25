import { socketManager } from '@/features/collaboration/lib/socketManager';

const INSPECT_EVENTS = [
  'connect',
  'disconnect',
  'cursor_update',
  'annotation_started',
  'annotation_drew',
  'annotation_ended',
  'annotation_deleted',
  'annotation_cleared',
  'participant:joined',
  'participant:left',
  'participant:reconnected',
  'presenter:changed',
  'presenter:disconnected',
  'presenter:reconnected',
  'session:state',
  'slide:changed',
  'slide:change',
] as const;

export interface ListenerSnapshot {
  scope: 'presenter' | 'collaboration';
  event: string;
  count: number;
}

export function inspectListeners(): ListenerSnapshot[] {
  const presenterSocket = socketManager.getPresenterSocket();
  const collaborationSocket = socketManager.getCollaborationSocket();

  return INSPECT_EVENTS.flatMap((event) => [
    {
      scope: 'presenter' as const,
      event,
      count: presenterSocket ? presenterSocket.listeners(event).length : 0,
    },
    {
      scope: 'collaboration' as const,
      event,
      count: collaborationSocket ? collaborationSocket.listeners(event).length : 0,
    },
  ]);
}
