// ─────────────────────────────────────────────────────────────────────────────
// @slidebot/shared-types — Public API
// ─────────────────────────────────────────────────────────────────────────────

// Domain models
export * from './models/index.js';

// Socket.IO event types
export * from './events/socket.events.js';
export * from './realtime.js';

// API request/response types
export * from './api/index.js';
export * from './annotations.js';

// Scene Graph types (PPTX ingestion)
// Re-exported under a namespace to avoid conflicts with existing Slide/SlideElement models
export * as SceneGraph from './scene-graph.js';

// Scene Graph Normalizer (EMU to Virtual Viewport conversion)
export * as SceneGraphNormalizer from './scene-graph-normalizer.js';
