import React from 'react';
import { MSG, sendToBackground, type ExtensionStatus } from '../../shared/messages';

interface ActiveSessionViewProps {
  status: ExtensionStatus;
}

export function ActiveSessionView({ status }: ActiveSessionViewProps) {
  const { sessionId, currentSlide, totalSlides, deckTitle } = status;

  const handleEndSession = () => {
    void sendToBackground({ type: MSG.DISCONNECT_SESSION });
  };

  const handleOpenRoom = () => {
    // Open the actual SlideBot room tab
    void sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: { deckId: sessionId || '' } });
  };

  const handleNextSlide = () => {
    void sendToBackground({
      type: MSG.PUSH_SLIDE_CHANGE,
      payload: { slideIndex: currentSlide + 1, totalSlides, presenterName: 'Presenter', sequenceNum: 0 }
    });
  };

  const handlePrevSlide = () => {
    void sendToBackground({
      type: MSG.PUSH_SLIDE_CHANGE,
      payload: { slideIndex: Math.max(1, currentSlide - 1), totalSlides, presenterName: 'Presenter', sequenceNum: 0 }
    });
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="card">
        <div className="card-label">Presentation</div>
        <div className="card-value" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {deckTitle || 'SlideBot Presentation'}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="card-label">Current Slide</div>
          <div className="card-value">
            {currentSlide} <span style={{ color: 'var(--surface-200)' }}>/ {totalSlides}</span>
          </div>
        </div>
        <div className="badge badge-success">Live</div>
      </div>

      <div className="flex-row" style={{ marginTop: 'auto', marginBottom: '16px' }}>
        <button className="btn" onClick={handlePrevSlide} disabled={currentSlide <= 1}>Prev</button>
        <button className="btn" onClick={handleNextSlide} disabled={currentSlide >= totalSlides && totalSlides > 0}>Next</button>
      </div>

      <div className="flex-row">
        <button className="btn" onClick={handleOpenRoom}>Open Tab</button>
        <button className="btn btn-danger" onClick={handleEndSession}>Disconnect</button>
      </div>
    </div>
  );
}
