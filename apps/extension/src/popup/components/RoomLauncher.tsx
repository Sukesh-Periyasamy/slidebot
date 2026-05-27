import React from 'react';
import { MSG, sendToBackground } from '../../shared/messages';
import { Play, Users } from 'lucide-react';

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
    <div className="container" style={{ justifyContent: 'center' }}>
      <div style={{ padding: '16px', backgroundColor: 'var(--surface-900)', borderRadius: '16px', marginBottom: '24px' }}>
        <Users size={32} color="var(--primary)" style={{ margin: '0 auto' }} />
      </div>
      
      <h2 className="title">Ready to Present</h2>
      <p className="subtitle">
        Active Meet session detected:<br/>
        <span style={{ fontFamily: 'monospace', color: 'var(--surface-50)', fontSize: '1rem', marginTop: '8px', display: 'inline-block', backgroundColor: 'var(--surface-800)', padding: '4px 8px', borderRadius: '4px' }}>{meetCode}</span>
      </p>
      
      <div className="card" style={{ textAlign: 'center', marginBottom: '24px', backgroundColor: 'transparent', border: '1px solid var(--surface-800)' }}>
        <div className="card-value" style={{ fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--surface-200)', lineHeight: '1.5' }}>
          Launch a new room or join an existing session linked to this Meet.
        </div>
      </div>
      
      <button className="btn btn-primary" onClick={handleLaunchRoom}>
        <Play size={16} fill="currentColor" />
        Launch SlideBot Room
      </button>
    </div>
  );
}
