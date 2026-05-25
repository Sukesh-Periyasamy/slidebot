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
  const initializedRef = useRef(false);

  const roomIdRef = useRef(roomId);
  const deckIdRef = useRef(deckId);
  const userIdRef = useRef(user?.id ?? '');

  roomIdRef.current = roomId;
  deckIdRef.current = deckId;
  userIdRef.current = user?.id ?? '';

  // We intentionally depend on `session?.sessionId` rather than the whole `session` object
  // to avoid unstable object identity triggering re-initialization.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initializedRef.current) return;
    if (!userIdRef.current || !roomIdRef.current || !deckIdRef.current) return;
    initializedRef.current = true;
    void sessionManager.ensureSession({
      roomId: roomIdRef.current,
      deckId: deckIdRef.current,
      userId: userIdRef.current,
    });
  }, [user?.id, roomId, deckId, session?.sessionId]);

  useEffect(() => {
    if (totalSlides <= 0) {
      return;
    }

    sessionManager.updateSlides(totalSlides);
  }, [totalSlides]);

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
