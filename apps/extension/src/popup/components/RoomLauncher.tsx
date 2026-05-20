import React from 'react';
import { MSG, sendToBackground } from '../../shared/messages';

interface RoomLauncherProps {
  meetCode: string;
}

export function RoomLauncher({ meetCode }: RoomLauncherProps) {
  const handleLaunchRoom = () => {
    // For now, we open the web app dashboard, which handles room creation.
    // The web app can detect the extension and link it to this Meet.
    void sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: {} });
  };

  return (
    <div className="container">
      <h2 className="title">Ready to Present</h2>
      <p className="subtitle">Active Meet: {meetCode}</p>
      
      <div className="card">
        <div className="card-label">Start a Session</div>
        <div className="card-value" style={{ fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--surface-200)' }}>
          Launch a new presentation or join an existing one.
        </div>
      </div>
      
      <button className="btn btn-primary" onClick={handleLaunchRoom}>
        Launch SlideBot Room
      </button>
    </div>
  );
}
