import React from 'react';
import { useExtensionStatus } from './hooks/useExtensionStatus';
import { LoginView } from './components/LoginView';
import { MeetDetectorView } from './components/MeetDetectorView';
import { RoomLauncher } from './components/RoomLauncher';
import { ActiveSessionView } from './components/ActiveSessionView';

export function PopupApp() {
  const { status, error } = useExtensionStatus();

  if (error) {
    return (
      <div className="container">
        <h2 className="title" style={{ color: 'var(--danger)' }}>Error</h2>
        <p className="subtitle">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="container">
        <p className="subtitle">Loading...</p>
      </div>
    );
  }

  // Header is visible in all states
  const Header = () => (
    <div className="header">
      <div className="header-title">SlideBot</div>
      {status.isAuthenticated ? (
        <div className="badge badge-success">Authenticated</div>
      ) : (
        <div className="badge badge-warning">Guest</div>
      )}
    </div>
  );

  return (
    <>
      <Header />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
        {!status.isAuthenticated ? (
          <LoginView />
        ) : !status.isOnMeet ? (
          <MeetDetectorView />
        ) : !status.isConnected ? (
          <RoomLauncher meetCode={status.meetCode!} />
        ) : (
          <ActiveSessionView status={status} />
        )}
      </div>
    </>
  );
}
