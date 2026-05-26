import React, { useState, useEffect } from 'react';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { useUxStore } from '@/features/collaboration/store/uxStore';
import { useParams } from 'react-router-dom';

export function Teleprompter() {
  const currentPage = useViewerStore((s) => s.currentPage);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const teleprompterVisible = useUxStore((s) => s.teleprompterVisible);
  const { roomId } = useParams<{ roomId: string }>();
  
  const [note, setNote] = useState('');

  useEffect(() => {
    const getStorageKey = (page: number) => `slidebot_notes_${roomId}_${page}`;
    if (roomId) {
      const savedNote = localStorage.getItem(getStorageKey(currentPage));
      setNote(savedNote || '');
    }
  }, [currentPage, roomId]);

  if (!isPresenter || !teleprompterVisible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-50 p-12 overflow-hidden flex flex-col justify-end pb-24">
      <div className="bg-black/70 backdrop-blur-md rounded-2xl p-8 max-w-4xl mx-auto w-full shadow-2xl border border-surface-800">
        <h2 className="text-surface-400 font-mono text-sm mb-4 uppercase tracking-wider">Teleprompter — Slide {currentPage}</h2>
        <div className="text-3xl md:text-5xl font-semibold leading-tight text-white whitespace-pre-wrap overflow-y-auto max-h-[40vh] scrollbar-hide">
          {note || <span className="text-surface-600 italic">No notes for this slide.</span>}
        </div>
      </div>
    </div>
  );
}
