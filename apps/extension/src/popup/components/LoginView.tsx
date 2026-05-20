import React from 'react';
import { MSG, sendToBackground } from '../../shared/messages';

export function LoginView() {
  const handleLogin = () => {
    void sendToBackground({ type: MSG.OPEN_SLIDEBOT, payload: {} });
  };

  return (
    <div className="container">
      <h2 className="title">Welcome to SlideBot</h2>
      <p className="subtitle">Sign in to start creating and joining collaborative presentations directly from Google Meet.</p>
      <button className="btn btn-primary" onClick={handleLogin}>
        Sign In via Web App
      </button>
    </div>
  );
}
