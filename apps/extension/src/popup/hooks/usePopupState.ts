/**
 * usePopupState — central state hook for the popup.
 *
 * Fetches from the background service worker on mount and exposes
 * all actions the popup screens need.
 */

import { useState, useEffect, useCallback } from 'react';
import { sendToBackground, MSG, type ExtensionStatus } from '../../shared/messages';
import { storageGet } from '../../shared/storage';

export type PopupView =
  | 'loading'
  | 'unauthenticated'
  | 'home' // On Meet — session connected
  | 'meet-detected' // On Meet — no session yet
  | 'join' // Entering session code
  | 'dashboard'; // Not on Meet

export interface PopupState {
  view: PopupView;
  status: ExtensionStatus | null;
  webAppUrl: string;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_STATUS: ExtensionStatus = {
  isOnMeet: false,
  meetCode: null,
  isConnected: false,
  sessionId: null,
  deckTitle: null,
  currentSlide: 0,
  totalSlides: 0,
  isAuthenticated: false,
};

export function usePopupState() {
  const [state, setState] = useState<PopupState>({
    view: 'loading',
    status: null,
    webAppUrl: 'https://app.slidebot.app',
    isLoading: true,
    error: null,
  });

  // ── Fetch status on mount ───────────────────────────────────────────────

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const [status, webAppUrl] = await Promise.all([
        sendToBackground<ExtensionStatus>({ type: MSG.GET_STATUS }),
        storageGet('webAppUrl'),
      ]);

      const resolvedStatus = status ?? DEFAULT_STATUS;
      const view = deriveView(resolvedStatus);

      setState({
        view,
        status: resolvedStatus,
        webAppUrl,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        view: 'dashboard',
        isLoading: false,
        error: 'Failed to load status',
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const openWebApp = useCallback(async (deckId?: string) => {
    await sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: deckId ? { deckId } : {} });
    window.close();
  }, []);

  const connectSession = useCallback(
    async (sessionCode: string) => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        await sendToBackground({
          type: MSG.CONNECT_SESSION,
          payload: { sessionCode },
        });
        await refresh();
      } catch {
        setState((s) => ({ ...s, isLoading: false, error: 'Failed to connect' }));
      }
    },
    [refresh]
  );

  const disconnectSession = useCallback(async () => {
    await sendToBackground({ type: MSG.DISCONNECT_SESSION });
    await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await sendToBackground({ type: MSG.CLEAR_AUTH_TOKEN });
    await refresh();
  }, [refresh]);

  const setView = useCallback((view: PopupView) => {
    setState((s) => ({ ...s, view }));
  }, []);

  return {
    ...state,
    refresh,
    openWebApp,
    connectSession,
    disconnectSession,
    signOut,
    setView,
  };
}

// ── View derivation ──────────────────────────────────────────────────────────

function deriveView(status: ExtensionStatus): PopupView {
  if (!status.isAuthenticated) return 'unauthenticated';
  if (status.isOnMeet && status.isConnected) return 'home';
  if (status.isOnMeet && !status.isConnected) return 'meet-detected';
  return 'dashboard';
}
