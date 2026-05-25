import { useRef, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useViewerStore } from '../../viewer/store/viewerStore';
import { useSyncStore } from '../../sync/store/syncStore';
import { SlideThumbnail } from './SlideThumbnail';

// ThumbnailSidebar

export function ThumbnailSidebar() {
  const pdfDoc = useViewerStore((s) => s.pdfDoc);
  const currentPage = useViewerStore((s) => s.currentPage);
  const totalPages = useViewerStore((s) => s.totalPages);
  const isThumbnailStripOpen = useViewerStore((s) => s.isThumbnailStripOpen);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const toggleThumbnailStrip = useViewerStore((s) => s.toggleThumbnailStrip);

  const session = useSyncStore((s) => s.session);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const isExploring = useSyncStore((s) => s.isExploring);
  const setIsExploring = useSyncStore((s) => s.setIsExploring);

  const presenterSlide = session?.currentSlide ?? 1;
  const lastAutoScrollRef = useRef<{ sessionId: string | null; slide: number } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: totalPages,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 4,
  });

  useEffect(() => {
    if (!isThumbnailStripOpen || totalPages === 0 || !session?.sessionId) return;
    if (!isExploring && !isPresenter) {
      const last = lastAutoScrollRef.current;
      if (last?.sessionId === session.sessionId && last.slide === presenterSlide) {
        return;
      }

      virtualizer.scrollToIndex(presenterSlide - 1, { align: 'center', behavior: 'smooth' });
      lastAutoScrollRef.current = { sessionId: session.sessionId, slide: presenterSlide };
    }
  }, [presenterSlide, isExploring, isPresenter, isThumbnailStripOpen, virtualizer, totalPages, session?.sessionId]);

  const handleThumbnailClick = useCallback(
    (pageNumber: number) => {
      setCurrentPage(pageNumber);
      if (!isPresenter) {
        setIsExploring(true);
      }
    },
    [setCurrentPage, isPresenter, setIsExploring]
  );

  return (
    <>
      <AnimatePresence initial={false}>
        {isThumbnailStripOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative h-full flex flex-col border-r border-surface-800 bg-surface-900/50 backdrop-blur-sm z-10 flex-shrink-0"
          >
            <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-surface-200">Slides</h2>
                <p className="text-[11px] text-surface-500 font-medium">{totalPages} total</p>
              </div>
              <button
                onClick={toggleThumbnailStrip}
                className="p-1.5 rounded-md text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                title="Close Sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>

            <div ref={parentRef} className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar" style={{ contain: 'strict' }}>
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const pageNumber = virtualItem.index + 1;

                  return (
                    <div
                      key={virtualItem.key}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      className="pb-4"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <SlideThumbnail
                        pdfDoc={pdfDoc}
                        pageNumber={pageNumber}
                        isViewerActive={currentPage === pageNumber}
                        isPresenterSlide={presenterSlide === pageNumber}
                        isExploring={isExploring}
                        isPresenter={isPresenter}
                        onClick={handleThumbnailClick}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isThumbnailStripOpen && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            onClick={toggleThumbnailStrip}
            className="absolute top-4 left-4 z-20 p-2 rounded-lg bg-surface-900/80 backdrop-blur-sm border border-surface-800 text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-all shadow-md"
            title="Open Sidebar"
          >
            <PanelLeftOpen size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
