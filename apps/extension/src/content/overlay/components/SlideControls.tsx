import type { SessionState, ExtensionStatus } from '../../../shared/messages';
import { MSG, sendToBackground } from '../../../shared/messages';

// ─────────────────────────────────────────────────────────────────────────────
// SlideControls — shown when connected to an active SlideBot session
// ─────────────────────────────────────────────────────────────────────────────

interface SlideControlsProps {
  session: SessionState;
  status: ExtensionStatus;
}

export function SlideControls({ session, status }: SlideControlsProps) {
  const progress = session.totalSlides > 0
    ? ((session.currentSlide + 1) / session.totalSlides) * 100
    : 0;

  const isPresenter = status.sessionId === session.presenterId;

  // Presenter nav via background → API (WebSocket event forwarding)
  // For the extension overlay, navigation is a convenience feature;
  // the full controls live in the web app
  const handlePrev = () => {
    // TODO: extend background to relay slide:goto events
    console.log('[SlideBot] prev slide');
  };

  const handleNext = () => {
    console.log('[SlideBot] next slide');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Deck title */}
      <div>
        <p className="sb-text-xs sb-text-muted" style={{ marginBottom: 2 }}>
          Presentation
        </p>
        <p
          className="sb-text-sm sb-font-medium sb-truncate"
          style={{ color: 'var(--sb-text)' }}
          title={session.deckTitle}
        >
          {session.deckTitle}
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="sb-progress">
          <div className="sb-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span className="sb-text-xs sb-text-muted">
            {isPresenter ? '🎤 Presenting' : `Following ${session.presenterName}`}
          </span>
          <span className="sb-text-xs sb-text-muted">
            {session.currentSlide + 1}/{session.totalSlides}
          </span>
        </div>
      </div>

      {/* Slide navigation */}
      <div className="sb-nav">
        <button
          className="sb-btn sb-btn--secondary"
          onClick={handlePrev}
          disabled={session.currentSlide <= 0}
          style={{ padding: '7px 14px' }}
        >
          ←
        </button>

        <div className="sb-slide-counter">
          {session.currentSlide + 1}
          <span>/{session.totalSlides}</span>
        </div>

        <button
          className="sb-btn sb-btn--secondary"
          onClick={handleNext}
          disabled={session.currentSlide >= session.totalSlides - 1}
          style={{ padding: '7px 14px' }}
        >
          →
        </button>
      </div>

      {/* Quick-open in app */}
      <button
        className="sb-btn sb-btn--primary sb-w-full"
        onClick={() =>
          sendToBackground({
            type: MSG.OPEN_SLIDEBOT,
            payload: { deckId: session.deckId },
          })
        }
      >
        Open in SlideBot ↗
      </button>
    </div>
  );
}
