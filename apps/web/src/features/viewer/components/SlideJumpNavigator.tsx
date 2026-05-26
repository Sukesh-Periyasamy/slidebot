import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/Dialog';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';

interface SlideJumpNavigatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SlideJumpNavigator({ open, onOpenChange }: SlideJumpNavigatorProps) {
  const totalPages = useViewerStore((s) => s.totalPages);
  const currentPage = useViewerStore((s) => s.currentPage);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const isPresenter = useSyncStore((s) => s.isPresenter);

  // If we're not presenter, we shouldn't really be jumping slides for the room, 
  // but if we do, it only affects us if we're un-synced. For now, assume it's for presenter.
  if (!isPresenter) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Jump to Slide</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 mt-4 overflow-y-auto p-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => {
                setCurrentPage(pageNum);
                onOpenChange(false);
              }}
              className={`
                aspect-video rounded-md flex items-center justify-center text-sm font-medium transition-all
                ${currentPage === pageNum 
                  ? 'bg-brand-500 text-white ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-900' 
                  : 'bg-surface-800 text-surface-200 hover:bg-surface-700'
                }
              `}
            >
              {pageNum}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
