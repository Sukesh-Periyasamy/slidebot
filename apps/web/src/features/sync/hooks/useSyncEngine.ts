import { useCallback, useEffect, useRef } from 'react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useSyncStore } from '../store/syncStore';
import { sessionManager } from '@/features/collaboration/lib/sessionManager';

interface UseSyncEngineOptions {
  roomId: string;
  deckId: string;
  totalSlides: number;
  onSlideChange?: (slideIndex: number) => void;
  onSessionEnd?: () => void;
  onAnnotationRestore?: (slideId: string) => void;
}

export function useSyncEngine({
  roomId,
  deckId,
  totalSlides,
  onSlideChange,
  onSessionEnd,
}: UseSyncEngineOptions) {
  const user = useAuthStore((s) => s.user);
  const session = useSyncStore((s) => s.session);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const hasNotifiedEndRef = useRef(false);
  const bootstrapKeyRef = useRef<string | null>(null);

  useEffect(() => {
    sessionManager.start();
  }, []);

  useEffect(() => {
    if (!user?.id || !roomId || !deckId) {
      return;
    }

    const bootstrapKey = `${user.id}:${roomId}:${deckId}`;
    if (bootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    bootstrapKeyRef.current = bootstrapKey;

    void sessionManager.ensureSession({
      roomId,
      deckId,
      totalSlides,
      userId: user.id,
    });
  }, [user?.id, roomId, deckId, totalSlides]);

  useEffect(() => {
    if (!roomId || !deckId || totalSlides <= 0) {
      return;
    }

    sessionManager.updateSessionContext({ roomId, deckId, totalSlides });
  }, [roomId, deckId, totalSlides]);

  useEffect(() => {
    if (!onSlideChange || !session) {
      return;
    }

    onSlideChange(session.currentSlide);
  }, [session, session?.currentSlide, onSlideChange]);

  useEffect(() => {
    if (!onSessionEnd) {
      return;
    }

    if (session?.status === 'ended' && !hasNotifiedEndRef.current) {
      hasNotifiedEndRef.current = true;
      onSessionEnd();
    }

    if (session?.status !== 'ended') {
      hasNotifiedEndRef.current = false;
    }
  }, [session?.status, onSessionEnd]);

  const gotoSlide = useCallback((slideIndex: number) => {
    void sessionManager.gotoSlide(slideIndex);
  }, []);

  const handoffTo = useCallback((toUserId: string, toUserName: string) => {
    sessionManager.handoffTo(toUserId, toUserName);
  }, []);

  const enterExploreMode = useCallback(() => {
    sessionManager.enterExploreMode();
  }, []);

  const followPresenter = useCallback(() => {
    sessionManager.followPresenter();
  }, []);

  const endSession = useCallback(() => {
    sessionManager.endSession();
  }, []);

  return {
    gotoSlide,
    handoffTo,
    enterExploreMode,
    followPresenter,
    endSession,
    sessionId: session?.sessionId ?? null,
    isPresenter,
  };
}
