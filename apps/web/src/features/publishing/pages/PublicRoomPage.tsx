import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { SlideCanvas } from '@/features/viewer/components/SlideCanvas';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { usePdfLoader } from '@/features/viewer/hooks/usePdfLoader';
import { getRoomById } from '@/features/decks/api/roomsApi';

export function PublicRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [error, setError] = useState<string | null>(null);

  const { loadFromUrl } = usePdfLoader();
  const resetViewer = useViewerStore((s) => s.reset);
  
  // Cleanup viewer on unmount
  useEffect(() => {
    return () => resetViewer();
  }, [resetViewer]);

  useEffect(() => {
    if (!roomId) return;
    
    let cancelled = false;
    const loadPublicRoom = async () => {
      try {
        const room = await getRoomById(roomId);
        if (cancelled) return;
        await loadFromUrl(room.deck.signedUrl);
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load the public presentation.');
        }
      }
    };
    
    void loadPublicRoom();
    return () => { cancelled = true; };
  }, [roomId, loadFromUrl]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 text-surface-50">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 text-surface-50">
        <p>Invalid public link.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-surface-950 text-surface-50 overflow-hidden">
      <header className="flex h-[var(--topbar-height)] items-center justify-between border-b border-surface-800 bg-surface-900 px-4 shrink-0">
        <h1 className="text-sm font-semibold text-surface-50">SlideBot Public Viewer</h1>
        <div className="text-xs text-surface-400 bg-surface-800 px-2 py-1 rounded-full">
          Read-Only Mode
        </div>
      </header>

      <main className="flex-1 relative flex flex-col items-center justify-center bg-surface-900 overflow-hidden">
        <SlideCanvas onDimensionsChange={() => {}} />
      </main>
    </div>
  );
}
