import { useState, useCallback, useRef, useEffect } from 'react';

import type { SessionState, ExtensionStatus } from '../../shared/messages';
import { MSG, sendToBackground, onMessage } from '../../shared/messages';
import { SlideBotPanel } from './components/SlideBotPanel';
import { FloatingButton } from './components/FloatingButton';

// ─────────────────────────────────────────────────────────────────────────────
// Overlay — React root rendered inside Shadow DOM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Overlay manages:
 * - Collapsed/expanded toggle state
 * - Draggable positioning
 * - Receiving push messages from background
 * - Passing state to panel components
 */
export function Overlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [position, setPosition] = useState({ bottom: 88, right: 20 });

  // ── Load initial status ───────────────────────────────────────────────────
  useEffect(() => {
    void sendToBackground<ExtensionStatus>({ type: MSG.GET_STATUS }).then((s) => {
      setStatus(s);
    });
  }, []);

  // ── Listen for push messages from background ──────────────────────────────
  useEffect(() => {
    return onMessage((message) => {
      if (message.type === MSG.SHOW_OVERLAY) setIsOpen(true);
      if (message.type === MSG.HIDE_OVERLAY) setIsOpen(false);
      if (message.type === MSG.PUSH_SESSION_STATE) {
        setSession(message.payload);
        setStatus((s) =>
          s ? { ...s, isConnected: true, sessionId: message.payload.sessionId } : s
        );
        // Auto-open on first session connect
        setIsOpen(true);
      }
    });
  }, []);

  // ── Dragging ──────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startRight: position.right,
        startBottom: position.bottom,
      };

      const handleMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPosition({
          right: Math.max(8, dragRef.current.startRight - dx),
          bottom: Math.max(8, dragRef.current.startBottom - dy),
        });
      };

      const handleUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [position]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenSlideBot = useCallback(() => {
    void sendToBackground({
      type: MSG.OPEN_SLIDEBOT,
      payload: session?.deckId ? { deckId: session.deckId } : {},
    });
  }, [session]);

  return (
    <div
      className="sb-container"
      style={{
        bottom: `${position.bottom}px`,
        right: `${position.right}px`,
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px',
        pointerEvents: 'none',
        fontFamily: 'var(--sb-font)',
      }}
    >
      {/* Expanded panel */}
      {isOpen && (
        <SlideBotPanel
          status={status}
          session={session}
          onClose={() => setIsOpen(false)}
          onOpenSlideBot={handleOpenSlideBot}
          onDragHandlePointerDown={handleDragStart}
        />
      )}

      {/* FAB toggle */}
      <FloatingButton
        isOpen={isOpen}
        isConnected={status?.isConnected ?? false}
        hasNotification={!status?.isAuthenticated}
        onClick={() => setIsOpen((o) => !o)}
      />
    </div>
  );
}
