import React, { useState, useEffect, useRef } from 'react';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { AdaptiveSidebar } from '@/shared/components/AdaptiveSidebar';
import { useParams } from 'react-router-dom';

interface PresenterNotesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PresenterNotes({ open, onOpenChange }: PresenterNotesProps) {
  const currentPage = useViewerStore((s) => s.currentPage);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const { roomId } = useParams<{ roomId: string }>();
  
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeout = useRef<number>();

  const getStorageKey = React.useCallback((page: number) => `slidebot_notes_${roomId}_${page}`, [roomId]);

  // Load note when page changes
  useEffect(() => {
    if (roomId) {
      const savedNote = localStorage.getItem(getStorageKey(currentPage));
      setNote(savedNote || '');
    }
  }, [currentPage, roomId, getStorageKey]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNote(val);
    setIsSaving(true);
    
    if (saveTimeout.current) {
      window.clearTimeout(saveTimeout.current);
    }
    
    saveTimeout.current = window.setTimeout(() => {
      localStorage.setItem(getStorageKey(currentPage), val);
      setIsSaving(false);
    }, 1000);
  };

  if (!isPresenter) return null;

  return (
    <AdaptiveSidebar
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      className="flex flex-col bg-surface-900 border-l border-surface-800"
    >
      <div className="flex items-center justify-between p-4 border-b border-surface-800">
        <h2 className="text-sm font-semibold text-surface-50">Presenter Notes</h2>
        <div className="text-xs text-surface-500">
          Slide {currentPage}
        </div>
      </div>
      
      <div className="flex-1 p-4 flex flex-col relative">
        <textarea
          value={note}
          onChange={handleChange}
          placeholder="Add private notes for this slide..."
          className="flex-1 w-full bg-transparent border-none resize-none focus:outline-none focus:ring-0 text-sm text-surface-200 placeholder:text-surface-600"
        />
        
        {isSaving && (
          <div className="absolute bottom-4 right-4 text-xs text-surface-500 animate-pulse">
            Saving...
          </div>
        )}
      </div>
    </AdaptiveSidebar>
  );
}
