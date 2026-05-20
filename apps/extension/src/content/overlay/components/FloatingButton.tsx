import type React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// FloatingButton — the collapsed FAB that toggles the panel
// ─────────────────────────────────────────────────────────────────────────────

interface FloatingButtonProps {
  isOpen: boolean;
  isConnected: boolean;
  hasNotification: boolean;
  onClick: () => void;
}

export function FloatingButton({
  isOpen,
  isConnected,
  hasNotification,
  onClick,
}: FloatingButtonProps) {
  return (
    <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      <button
        className="sb-fab"
        onClick={onClick}
        title={isOpen ? 'Close SlideBot' : 'Open SlideBot'}
        aria-label="Toggle SlideBot panel"
      >
        {isOpen ? <CloseIcon /> : <SlideBotIcon />}
      </button>

      {/* Status dot */}
      <span
        style={{
          position: 'absolute',
          top: '-2px',
          right: '-2px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: hasNotification ? '#F59E0B' : isConnected ? '#10B981' : '#6b778d',
          border: '2px solid #111827',
          display: 'block',
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG Icons (inlined to avoid asset loading in Shadow DOM)
// ─────────────────────────────────────────────────────────────────────────────

function SlideBotIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.95" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.65" />
      <rect x="6" y="14" width="6" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
