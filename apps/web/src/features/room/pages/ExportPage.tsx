import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoomById } from '@/features/decks/api/roomsApi';
import { pdfjsLib } from '@/lib/pdfWorker';
import { supabase } from '@/lib/supabase';
import { exportRoomSnapshot, exportRoomReplay } from '../lib/exportUtils';

export function ExportPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<any>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [printReady, setPrintReady] = useState(false);
  const pagesRendered = useRef(0);
  const pdfRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) return;
    
    let cancelled = false;
    const load = async () => {
      try {
        const room = await getRoomById(roomId);
        if (cancelled) return;
        setDeck(room.deck);
        
        const loadingTask = pdfjsLib.getDocument({
          url: room.deck.signedUrl,
          cMapUrl: 'pdfjs-dist/cmaps/',
          cMapPacked: true
        });
        
        const doc = await loadingTask.promise;
        pdfRef.current = doc;
        setNumPages(doc.numPages);
      } catch (err) {
        console.error('Failed to load room or PDF for export', err);
      }
    };
    void load();
    return () => { 
      cancelled = true; 
      if (pdfRef.current) {
        void pdfRef.current.destroy();
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!numPages || !pdfRef.current || !containerRef.current) return;
    let cancelled = false;

    const renderPages = async () => {
      pagesRendered.current = 0;
      const doc = pdfRef.current;
      
      // Fetch snapshot to get annotations for flattening
      let snapshotData: any = null;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/rooms/${roomId}/snapshot`, {
            headers: { Authorization: `Bearer ${data.session.access_token}` }
          });
          if (res.ok) {
            snapshotData = await res.json();
          }
        }
      } catch (err) {
        console.warn('Could not fetch snapshot for annotation flattening', err);
      }

      for (let i = 1; i <= numPages; i++) {
        if (cancelled) break;
        
        try {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // High res for printing
          
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'block shadow-xl print:shadow-none mb-8 print:mb-0 print:border-none border border-surface-200';
          canvas.style.pageBreakAfter = 'always';
          
          containerRef.current?.appendChild(canvas);
          
          const context = canvas.getContext('2d');
          if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            
            // Flatten annotations for this page (i-1)
            const slideEntity = snapshotData?.deck?.slideEntities?.[i - 1];
            if (slideEntity?.annotations) {
              import('../lib/exportUtils').then(({ drawAnnotationsToContext }) => {
                drawAnnotationsToContext(context, slideEntity.annotations, viewport.width, viewport.height);
              });
            }
            
            pagesRendered.current += 1;
          }
        } catch (e) {
          console.error(`Failed to render page ${i}`, e);
        }
      }

      if (!cancelled) {
        setLoading(false);
        setPrintReady(true);
        setTimeout(() => window.print(), 500);
      }
    };

    void renderPages();
    return () => { cancelled = true; };
  }, [numPages, roomId]);

  if (!deck) {
    return <div className="p-8 text-center text-surface-200">Loading export data...</div>;
  }

  const handleExportSnapshot = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await exportRoomSnapshot(roomId!, data.session.access_token);
    }
  };

  const handleExportReplay = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await exportRoomReplay(roomId!, data.session.access_token);
    }
  };

  return (
    <div className="bg-white min-h-screen">
      {/* Non-print UI */}
      <div className="print:hidden fixed top-0 left-0 right-0 bg-surface-900 p-4 flex items-center justify-between z-50 text-surface-50 border-b border-surface-800 shadow-sm">
        <div>
          <h1 className="font-semibold text-lg">{deck.name} - Export</h1>
          <p className="text-sm text-surface-400">
            {loading ? `Rendering slides for print...` : 'Ready to export.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => navigate(`/room/${roomId}`)}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-md text-sm transition-colors"
          >
            Back to Room
          </button>
          <button 
            onClick={handleExportSnapshot}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-md text-sm transition-colors"
          >
            Export Snapshot (JSON)
          </button>
          <button 
            onClick={handleExportReplay}
            className="px-4 py-2 bg-surface-800 hover:bg-surface-700 rounded-md text-sm transition-colors"
          >
            Export Replay (JSON)
          </button>
          <button 
            onClick={() => window.print()}
            disabled={!printReady}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
          >
            Print PDF
          </button>
        </div>
      </div>

      {/* Print content */}
      <div className="pt-24 print:pt-0 pb-12 flex flex-col items-center max-w-4xl mx-auto" ref={containerRef}>
      </div>
    </div>
  );
}
