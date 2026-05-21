import React from 'react';
import { MSG, sendToBackground } from '../../shared/messages';
import { LogIn } from 'lucide-react';

export function LoginView() {
  const handleLogin = () => {
    void sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: {} });
  };

  return (
    <div className="container" style={{ justifyContent: 'center' }}>
      <div style={{ padding: '24px', backgroundColor: 'var(--surface-900)', borderRadius: '16px', marginBottom: '24px' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto' }}>
          <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
          <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
          <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
          <rect x="6" y="14" width="6" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.4" />
        </svg>
      </div>
      
      <h2 className="title">Welcome to SlideBot</h2>
      <p className="subtitle" style={{ maxWidth: '280px' }}>
        Sign in to start creating and joining collaborative presentations directly from Google Meet.
      </p>
      
      <button className="btn btn-primary" onClick={handleLogin}>
        <LogIn size={16} />
        Sign In via Web App
      </button>
    </div>
  );
}
