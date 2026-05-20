import { useState } from 'react';

import type { ExtensionStatus, SessionState } from '../../../shared/messages';
import { MSG, sendToBackground } from '../../../shared/messages';
import { SlideControls } from './SlideControls';
import { SessionConnector } from './SessionConnector';

// ─────────────────────────────────────────────────────────────────────────────
// SlideBotPanel — the expanded overlay panel
// ─────────────────────────────────────────────────────────────────────────────

interface SlideBotPanelProps {
  status: ExtensionStatus | null;
  session: SessionState | null;
  onClose: () => void;
  onOpenSlideBot: () => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
}

export function SlideBotPanel({
  status,
  session,
  onClose,
  onOpenSlideBot,
  onDragHandlePointerDown,
}: SlideBotPanelProps) {
  return (
    <div className="sb-card sb-panel">
      {/* ── Header (drag handle) ─────────────────────────────────────────── */}
      <div className="sb-panel-header" onPointerDown={onDragHandlePointerDown}>
        {/* Logo + title */}
        <div className="sb-flex sb-items-center sb-gap-2">
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: '#6173F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MiniLogo />
          </div>
          <span className="sb-font-semibold" style={{ fontSize: 13, color: 'var(--sb-text)' }}>
            SlideBot
          </span>

          {/* Connection badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: status?.isConnected
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(107, 119, 141, 0.15)',
              borderRadius: 20,
              padding: '2px 7px',
              fontSize: 10,
              fontWeight: 500,
              color: status?.isConnected ? '#10B981' : 'var(--sb-text-muted)',
            }}
          >
            <span
              className="sb-dot"
              style={{
                background: status?.isConnected ? '#10B981' : '#6b778d',
                width: 5,
                height: 5,
                ...(status?.isConnected ? {} : {}),
              }}
            />
            {status?.isConnected ? 'Live' : 'Offline'}
          </div>
        </div>

        {/* Actions */}
        <div className="sb-flex sb-items-center sb-gap-1">
          <button
            className="sb-btn sb-btn--icon"
            onClick={onOpenSlideBot}
            title="Open SlideBot app"
            style={{ fontSize: 14 }}
          >
            ↗
          </button>
          <button
            className="sb-btn sb-btn--icon"
            onClick={onClose}
            title="Close"
            style={{ fontSize: 16 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="sb-p-3">
        {!status?.isAuthenticated ? (
          <NotAuthenticatedView onOpenSlideBot={onOpenSlideBot} />
        ) : !status?.isConnected || !session ? (
          <SessionConnector onOpenSlideBot={onOpenSlideBot} />
        ) : (
          <SlideControls session={session} status={status} />
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--sb-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="sb-text-xs sb-text-muted">
          {status?.meetCode ? `meet.google.com/${status.meetCode}` : 'Not in a meeting'}
        </span>
        <button
          className="sb-btn sb-btn--secondary"
          style={{ padding: '4px 8px', fontSize: 10 }}
          onClick={onOpenSlideBot}
        >
          Open app
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Not authenticated view
// ─────────────────────────────────────────────────────────────────────────────

function NotAuthenticatedView({ onOpenSlideBot }: { onOpenSlideBot: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
      <p className="sb-text-sm sb-font-medium" style={{ color: 'var(--sb-text)', marginBottom: 4 }}>
        Sign in to SlideBot
      </p>
      <p className="sb-text-xs sb-text-muted" style={{ marginBottom: 12 }}>
        Sign in to sync presentations with your team
      </p>
      <button className="sb-btn sb-btn--primary sb-w-full" onClick={onOpenSlideBot}>
        Sign in
      </button>
    </div>
  );
}

function MiniLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="6" y="9" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="12" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
    </svg>
  );
}
