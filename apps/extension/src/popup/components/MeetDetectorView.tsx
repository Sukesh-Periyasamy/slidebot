import React from 'react';
import { MSG, sendToBackground } from '../../shared/messages';

export function MeetDetectorView() {
  const handleOpenMeet = () => {
    // Open Google Meet in a new tab
    void chrome.tabs.create({ url: 'https://meet.google.com' });
  };

  const handleOpenDashboard = () => {
    void sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: {} });
  };

  return (
    <div className="container">
      <h2 className="title">Not on Google Meet</h2>
      <p className="subtitle">Open a Google Meet tab to launch or join a SlideBot room.</p>
      
      <div className="flex-row" style={{ flexDirection: 'column', gap: '12px' }}>
        <button className="btn btn-primary" onClick={handleOpenMeet}>
          Open Google Meet
        </button>
        <button className="btn" onClick={handleOpenDashboard}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
