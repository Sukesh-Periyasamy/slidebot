import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { useSyncEngine } from '@/features/sync/hooks/useSyncEngine';
import { RoomHeader } from '../components/RoomHeader';
import { ThumbnailSidebar } from '@/features/viewer/components/ThumbnailSidebar';
import { SlideCanvas } from '@/features/viewer/components/SlideCanvas';
import { AnnotationCanvas } from '@/features/annotation/components/AnnotationCanvas';
import { RoomOverlays } from '@/features/sync/components/RoomOverlays';
import { ConnectionStatusBar } from '@/features/sync/components/ConnectionStatusBar';
import { PresenterControls } from '@/features/sync/components/PresenterControls';
import { SnapBackBanner } from '@/features/sync/components/SnapBackBanner';
import { useViewerStore } from '@/features/viewer/store/viewerStore';

export function RoomPage() {
  const { deckId } = useParams<{ deckId: string }>();

  // ── 1. Initialize the WebSocket Sync Engine ──────────────────────────────
  // This hook connects to /presenter and /collaboration namespaces and
  // automatically handles joining the session and receiving the initial snapshot.
  useSyncEngine(deckId ?? '');

  // ── 2. Cleanup viewer state on unmount ──────────────────────────────────
  const resetViewer = useViewerStore((s) => s.reset);
  useEffect(() => {
    return () => resetViewer();
  }, [resetViewer]);

  if (!deckId) return null;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-surface-950 text-surface-50">
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <RoomHeader />

      <div className="flex flex-1 overflow-hidden relative">
        {/* ── Left Sidebar (Virtual Thumbnail Strip) ─────────────────────── */}
        <ThumbnailSidebar />

        {/* ── Main Canvas Area ───────────────────────────────────────────── */}
        <main className="flex-1 relative flex flex-col items-center justify-center bg-surface-900 overflow-hidden">
          {/* Active slide PDF render */}
          <SlideCanvas />

          {/* Collaborative annotations layer (Yjs) */}
          <div className="absolute inset-0">
            <AnnotationCanvas />
          </div>

          {/* Floating UI Elements */}
          <SnapBackBanner />
          <PresenterControls />
          <ConnectionStatusBar />
        </main>
      </div>

      {/* ── Global Overlays (Modals, Handoffs, Errors) ───────────────────── */}
      <RoomOverlays />
    </div>
  );
}
