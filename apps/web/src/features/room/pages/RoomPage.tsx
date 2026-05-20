import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useSyncEngine } from '@/features/sync/hooks/useSyncEngine';
import { useAnnotationSync } from '@/features/annotation/hooks/useAnnotationSync';
import { RoomHeader } from '../components/RoomHeader';
import { ThumbnailSidebar } from '@/features/viewer/components/ThumbnailSidebar';
import { SlideCanvas } from '@/features/viewer/components/SlideCanvas';
import { AnnotationCanvas } from '@/features/annotation/components/AnnotationCanvas';
import { RoomOverlays } from '@/features/sync/components/RoomOverlays';
import { ConnectionStatusBar } from '@/features/sync/components/ConnectionStatusBar';
import { PresenterControls } from '@/features/sync/components/PresenterControls';
import { SnapBackBanner } from '@/features/sync/components/SnapBackBanner';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';

export function RoomPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const syncStore = useSyncStore();
  const viewerStore = useViewerStore();
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 });

  const totalSlides = useViewerStore((s) => s.pdfDoc?.numPages ?? 0);
  const sync = useSyncEngine({ deckId: deckId ?? '', totalSlides });
  const annotationSync = useAnnotationSync({
    sessionId: syncStore.session?.sessionId ?? '',
    slideId: `${deckId}-${viewerStore.currentPage}`
  });

  // ── 2. Cleanup viewer state on unmount ──────────────────────────────────
  const resetViewer = useViewerStore((s) => s.reset);
  useEffect(() => {
    return () => resetViewer();
  }, [resetViewer]);

  // ── 3. Expose state to window for Playwright deterministic testing ─────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__TEST_SYNC_STATE__ = {
        currentPage: viewerStore.currentPage,
        isExploring: viewerStore.isExploring,
        session: syncStore.session,
        connectionState: syncStore.connectionState,
      };
    }
  }, [viewerStore.currentPage, viewerStore.isExploring, syncStore.session, syncStore.connectionState]);

  if (!deckId) return null;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-surface-950 text-surface-50">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <RoomHeader 
        deckName="SlideBot Presentation"
        onLeave={() => {}}
        participantCount={Object.keys(syncStore.members).length}
        participantsPanelOpen={false}
        onToggleParticipants={() => {}}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Left Sidebar (Virtual Thumbnail Strip) ─────────────────────── */}
        <ThumbnailSidebar />

        {/* ── Main Canvas Area ───────────────────────────────────────────── */}
        <main className="flex-1 relative flex flex-col items-center justify-center bg-surface-900 overflow-hidden">
          {/* Active slide PDF render */}
          <SlideCanvas onDimensionsChange={(w, h) => setCanvasDims({ w, h })} />

          {/* Collaborative annotations layer (Yjs) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ width: canvasDims.w, height: canvasDims.h, position: 'relative' }}>
              <AnnotationCanvas 
                slideId={`${deckId}-${viewerStore.currentPage}`}
                width={canvasDims.w}
                height={canvasDims.h}
                sync={annotationSync}
              />
            </div>
          </div>

          {/* Floating UI Elements */}
          <SnapBackBanner 
            presenterName={syncStore.session?.presenterName ?? ''} 
            presenterSlide={syncStore.session?.currentSlide ?? 0}
            totalSlides={syncStore.session?.totalSlides ?? 0}
            slideDelta={(viewerStore.currentPage ?? 0) - (syncStore.session?.currentSlide ?? 0)}
            onSnapBack={sync.followPresenter}
          />
          <PresenterControls 
            syncState={syncStore as any}
            onHandoffClick={() => sync.handoffTo('', '')}
            onEndSession={sync.endSession}
          />
          <ConnectionStatusBar />
        </main>
      </div>

      {/* ── Global Overlays (Modals, Handoffs, Errors) ───────────────────── */}
      <RoomOverlays />
    </div>
  );
}
