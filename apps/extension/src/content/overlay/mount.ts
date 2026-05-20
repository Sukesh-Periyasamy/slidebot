/**
 * Overlay mount — creates an isolated Shadow DOM container and mounts
 * the SlideBot React overlay inside it.
 *
 * Shadow DOM ensures:
 * - Our CSS cannot leak into Meet's UI
 * - Meet's CSS cannot affect our overlay
 * - Event propagation is controlled at the boundary
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

import { SHADOW_HOST_ID } from '../../shared/constants';
import { Overlay } from './Overlay';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface OverlayMount {
  show: () => void;
  hide: () => void;
  destroy: () => void;
  isVisible: () => boolean;
}

let mountedOverlay: OverlayMount | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

export function mountOverlay(): OverlayMount {
  // Prevent double mounting
  if (mountedOverlay) return mountedOverlay;

  // ── Create shadow host ─────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  host.setAttribute('data-slidebot', 'true');

  // Position host: fixed, covers viewport, pointer-events passthrough
  // The actual interactive elements inside the shadow have pointer-events: auto
  Object.assign(host.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    zIndex: '2147483647', // Maximum z-index
    pointerEvents: 'none',
    display: 'block',
  });

  // ── Create shadow root ────────────────────────────────────────────────────
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // ── Inject styles into shadow ─────────────────────────────────────────────
  // We inline a minimal style rather than loading external CSS to avoid
  // async loading issues with the shadow DOM
  const styleEl = document.createElement('style');
  styleEl.textContent = getShadowStyles();
  shadowRoot.appendChild(styleEl);

  // ── Create React mount point ──────────────────────────────────────────────
  const mountPoint = document.createElement('div');
  mountPoint.id = 'slidebot-react-root';
  mountPoint.style.cssText = 'width: 100%; height: 100%; pointer-events: none;';
  shadowRoot.appendChild(mountPoint);

  // ── Mount React ───────────────────────────────────────────────────────────
  const root = ReactDOM.createRoot(mountPoint);
  root.render(React.createElement(Overlay));

  // Append to body
  document.body.appendChild(host);

  let visible = true;

  const overlay: OverlayMount = {
    show: () => {
      host.style.display = 'block';
      visible = true;
    },
    hide: () => {
      host.style.display = 'none';
      visible = false;
    },
    destroy: () => {
      root.unmount();
      host.remove();
      mountedOverlay = null;
    },
    isVisible: () => visible,
  };

  mountedOverlay = overlay;
  return overlay;
}

/** Get or create the overlay. */
export function getOrMountOverlay(): OverlayMount {
  return mountedOverlay ?? mountOverlay();
}

/** Destroy if mounted. */
export function destroyOverlay(): void {
  mountedOverlay?.destroy();
  mountedOverlay = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shadow DOM styles
// ─────────────────────────────────────────────────────────────────────────────

function getShadowStyles(): string {
  return `
    /* Reset inside shadow */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* SlideBot design tokens */
    :host {
      --sb-brand: #6173F2;
      --sb-brand-light: #8199f8;
      --sb-bg: rgba(17, 24, 39, 0.95);
      --sb-bg-hover: rgba(26, 32, 53, 0.98);
      --sb-border: rgba(255, 255, 255, 0.08);
      --sb-border-focus: rgba(97, 115, 242, 0.5);
      --sb-text: #f8f9fb;
      --sb-text-secondary: #9aa5b8;
      --sb-text-muted: #6b778d;
      --sb-radius: 12px;
      --sb-font: 'Inter', system-ui, -apple-system, sans-serif;
      --sb-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    /* All overlay elements need pointer-events: auto */
    .sb-interactive {
      pointer-events: auto;
    }

    /* Floating container — bottom right of screen */
    .sb-container {
      position: fixed;
      bottom: 88px;  /* Above Meet's bottom bar */
      right: 20px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      pointer-events: none;
      font-family: var(--sb-font);
      -webkit-font-smoothing: antialiased;
    }

    /* Glass card base */
    .sb-card {
      background: var(--sb-bg);
      border: 1px solid var(--sb-border);
      border-radius: var(--sb-radius);
      box-shadow: var(--sb-shadow);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      pointer-events: auto;
      overflow: hidden;
      color: var(--sb-text);
    }

    /* Floating toggle button */
    .sb-fab {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--sb-brand);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(97, 115, 242, 0.5);
      transition: transform 0.2s, box-shadow 0.2s;
      pointer-events: auto;
      outline: none;
    }
    .sb-fab:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 20px rgba(97, 115, 242, 0.6);
    }
    .sb-fab:active { transform: scale(0.96); }

    /* Panel dimensions */
    .sb-panel {
      width: 280px;
      user-select: none;
    }

    /* Panel header (drag handle) */
    .sb-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--sb-border);
      cursor: grab;
    }
    .sb-panel-header:active { cursor: grabbing; }

    /* Status dot */
    .sb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .sb-dot--live { background: #10B981; animation: sb-pulse 2s infinite; }
    .sb-dot--idle { background: #6b778d; }
    .sb-dot--error { background: #EF4444; }

    @keyframes sb-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Buttons */
    .sb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: var(--sb-font);
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      transition: background 0.15s, transform 0.1s;
      outline: none;
      white-space: nowrap;
    }
    .sb-btn--primary {
      background: var(--sb-brand);
      color: white;
      padding: 8px 14px;
    }
    .sb-btn--primary:hover { background: #4e55e6; }
    .sb-btn--secondary {
      background: rgba(255,255,255,0.06);
      color: var(--sb-text-secondary);
      padding: 7px 12px;
      border: 1px solid var(--sb-border);
    }
    .sb-btn--secondary:hover {
      background: rgba(255,255,255,0.1);
      color: var(--sb-text);
    }
    .sb-btn--icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: transparent;
      color: var(--sb-text-secondary);
      padding: 0;
    }
    .sb-btn--icon:hover {
      background: rgba(255,255,255,0.08);
      color: var(--sb-text);
    }
    .sb-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .sb-btn:active:not(:disabled) { transform: scale(0.96); }

    /* Input */
    .sb-input {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--sb-border);
      border-radius: 8px;
      color: var(--sb-text);
      font-family: var(--sb-font);
      font-size: 13px;
      padding: 8px 10px;
      outline: none;
      transition: border-color 0.15s;
    }
    .sb-input::placeholder { color: var(--sb-text-muted); }
    .sb-input:focus { border-color: var(--sb-border-focus); }

    /* Typography helpers */
    .sb-text-xs { font-size: 11px; }
    .sb-text-sm { font-size: 12px; }
    .sb-text-base { font-size: 13px; }
    .sb-text-muted { color: var(--sb-text-muted); }
    .sb-text-secondary { color: var(--sb-text-secondary); }
    .sb-font-medium { font-weight: 500; }
    .sb-font-semibold { font-weight: 600; }

    /* Layout helpers */
    .sb-flex { display: flex; }
    .sb-flex-col { flex-direction: column; }
    .sb-items-center { align-items: center; }
    .sb-justify-between { justify-content: space-between; }
    .sb-gap-1 { gap: 4px; }
    .sb-gap-2 { gap: 8px; }
    .sb-gap-3 { gap: 12px; }
    .sb-p-3 { padding: 12px; }
    .sb-p-4 { padding: 14px; }
    .sb-py-2 { padding-top: 8px; padding-bottom: 8px; }
    .sb-px-3 { padding-left: 12px; padding-right: 12px; }
    .sb-w-full { width: 100%; }
    .sb-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Slide navigation */
    .sb-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .sb-slide-counter {
      font-size: 13px;
      font-weight: 600;
      color: var(--sb-text);
      text-align: center;
      flex: 1;
    }
    .sb-slide-counter span { color: var(--sb-text-muted); font-weight: 400; }

    /* Progress bar */
    .sb-progress {
      height: 2px;
      background: rgba(255,255,255,0.08);
      border-radius: 1px;
      overflow: hidden;
    }
    .sb-progress-bar {
      height: 100%;
      background: var(--sb-brand);
      border-radius: 1px;
      transition: width 0.3s ease;
    }

    /* Slide-in animation for panel */
    @keyframes sb-slide-up {
      from { opacity: 0; transform: translateY(12px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .sb-panel { animation: sb-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
  `;
}
