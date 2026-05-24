import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useSyncEngine } from '@/features/sync/hooks/useSyncEngine';
import { useAnnotationSync } from '@/features/annotation/hooks/useAnnotationSync';
import { RoomHeader } from '../components/RoomHeader';
import { OnboardingGuide } from '../components/OnboardingGuide';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts';
import { ThumbnailSidebar } from '@/features/viewer/components/ThumbnailSidebar';
import { SlideCanvas } from '@/features/viewer/components/SlideCanvas';
import { AnnotationCanvas } from '@/features/annotation/components/AnnotationCanvas';
import { RoomOverlays } from '@/features/sync/components/RoomOverlays';
import { ConnectionStatusBar } from '@/features/sync/components/ConnectionStatusBar';
import { PresenterControls } from '@/features/sync/components/PresenterControls';
import { useExplorationMode } from '@/features/sync/hooks/useExplorationMode';
import { SnapBackBanner } from '@/features/sync/components/SnapBackBanner';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { ParticipantsList } from '@/features/sync/components/ParticipantsList';
import { usePdfLoader } from '@/features/viewer/hooks/usePdfLoader';
import { useDeckStore } from '@/features/decks/store/deckStore';
import { getRoomById } from '@/features/decks/api/roomsApi';
import { sessionManager } from '@/features/collaboration/lib/sessionManager';

export function RoomPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const session = useSyncStore((s) => s.session);
  const members = useSyncStore((s) => s.members);
  const isExploring = useSyncStore((s) => s.isExploring);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const currentPage = useViewerStore((s) => s.currentPage);
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 });
  const [participantsPanelOpen, setParticipantsPanelOpen] = useState(false);
  const [resolvedDeckId, setResolvedDeckId] = useState<string | null>(null);
  const bootstrappedRoomIdRef = useRef<string | null>(null);

  const handleDimensionsChange = useCallback((w: number, h: number) => {
    setCanvasDims((prev) => {
      if (prev.w === w && prev.h === h) return prev;
      return { w, h };
    });
  }, []);

  const totalSlides = useViewerStore((s) => s.pdfDoc?.numPages ?? 0);
  const deckName = useDeckStore((s) =>
    resolvedDeckId ? (s.decks[resolvedDeckId]?.name ?? 'SlideBot Presentation') : 'SlideBot Presentation'
  );
  const upsertDeck = useDeckStore((s) => s.upsertDeck);
  const { loadFromUrl } = usePdfLoader();

  const sync = useSyncEngine({ roomId: roomId ?? '', deckId: resolvedDeckId ?? '', totalSlides });
  const exploration = useExplorationMode(sync);
  const annotationSync = useAnnotationSync({
    sessionId: session?.sessionId ?? '',
    deckId: resolvedDeckId ?? '',
    slideId: `${resolvedDeckId ?? 'deck'}-${currentPage}`,
  });

  const resetViewer = useViewerStore((s) => s.reset);
  useEffect(() => {
    return () => resetViewer();
  }, [resetViewer]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as { __TEST_SYNC_STATE__?: unknown }).__TEST_SYNC_STATE__ = {
        currentPage,
        isExploring,
        session,
        connectionState: connectionStatus,
      };
    }
  }, [currentPage, isExploring, session, connectionStatus]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    if (bootstrappedRoomIdRef.current === roomId) {
      return;
    }

    let cancelled = false;

    const loadRoom = async () => {
      try {
        const room = await getRoomById(roomId);
        if (cancelled) {
          return;
        }

        bootstrappedRoomIdRef.current = roomId;
        setResolvedDeckId(room.deck.deckId);
        upsertDeck({
          deckId: room.deck.deckId,
          name: room.deck.name,
          slides: room.deck.slides,
          storagePath: room.deck.storagePath,
          signedUrl: room.deck.signedUrl,
          signedUrlExpiresAt: Date.now() + room.deck.signedUrlExpiresIn * 1000,
          createdAt: Date.now(),
        });

        await loadFromUrl(room.deck.signedUrl);
      } catch {
        if (cancelled) {
          return;
        }
      }
    };

    void loadRoom();

    return () => {
      cancelled = true;
    };
  }, [roomId, loadFromUrl, upsertDeck]);

  const handleLeave = useCallback(async () => {
    await sessionManager.leaveActiveRoom();
    navigate('/dashboard');
  }, [navigate]);

  if (!roomId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 px-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-surface-50">Missing Room ID</h1>
          <p className="mt-2 text-sm text-surface-400">This room link is invalid. Please re-open a valid room URL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-surface-950 text-surface-50">
      <RoomHeader
        deckName={deckName}
        onLeave={() => {
          void handleLeave();
        }}
        participantCount={Object.keys(members).length}
        participantsPanelOpen={participantsPanelOpen}
        onToggleParticipants={() => setParticipantsPanelOpen((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <ThumbnailSidebar />

        <main className="flex-1 relative flex flex-col items-center justify-center bg-surface-900 overflow-hidden">
          <SlideCanvas onDimensionsChange={handleDimensionsChange} />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ width: canvasDims.w, height: canvasDims.h, position: 'relative' }}>
              <AnnotationCanvas
                slideId={`${resolvedDeckId ?? 'deck'}-${currentPage}`}
                width={canvasDims.w}
                height={canvasDims.h}
                sync={annotationSync}
              />
            </div>
          </div>

          <SnapBackBanner
            presenterName={session?.presenterName ?? ''}
            presenterSlide={session?.currentSlide ?? 0}
            totalSlides={session?.totalSlides ?? 0}
            slideDelta={(currentPage ?? 0) - (session?.currentSlide ?? 0)}
            isVisible={isExploring && !isPresenter}
            onSnapBack={sync.followPresenter}
          />

          <PresenterControls
            exploration={exploration}
            onHandoffClick={() => sync.handoffTo('', '')}
            onEndSession={sync.endSession}
          />

          <ConnectionStatusBar />
        </main>

        <ParticipantsList isOpen={participantsPanelOpen} />
      </div>

      <RoomOverlays />
      <OnboardingGuide />
      <KeyboardShortcuts />
    </div>
  );
}
