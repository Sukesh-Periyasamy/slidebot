import { useState } from 'react';

import { MSG, sendToBackground } from '../../../shared/messages';

// ─────────────────────────────────────────────────────────────────────────────
// SessionConnector — shown when authenticated but not in a session
// ─────────────────────────────────────────────────────────────────────────────

interface SessionConnectorProps {
  onOpenSlideBot: () => void;
}

export function SessionConnector({ onOpenSlideBot }: SessionConnectorProps) {
  const [code, setCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setIsConnecting(true);
    setError(null);

    try {
      await sendToBackground({
        type: MSG.CONNECT_SESSION,
        payload: { sessionCode: trimmed },
      });
      setCode('');
    } catch {
      setError('Could not connect. Check the room code.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleConnect();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Illustration */}
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>📊</div>
        <p
          className="sb-text-sm sb-font-medium"
          style={{ color: 'var(--sb-text)', marginBottom: 4 }}
        >
          Join a presentation
        </p>
        <p className="sb-text-xs sb-text-muted">Enter a room code or start a new presentation</p>
      </div>

      {/* Room code input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          className="sb-input"
          type="text"
          placeholder="Room code..."
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
        />

        {error && (
          <p className="sb-text-xs" style={{ color: '#EF4444' }}>
            {error}
          </p>
        )}

        <button
          className="sb-btn sb-btn--primary sb-w-full"
          onClick={handleConnect}
          disabled={!code.trim() || isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Join Room'}
        </button>
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--sb-border)' }} />
        <span className="sb-text-xs sb-text-muted">or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--sb-border)' }} />
      </div>

      {/* Start new */}
      <button className="sb-btn sb-btn--secondary sb-w-full" onClick={onOpenSlideBot}>
        Start a new presentation ↗
      </button>
    </div>
  );
}
