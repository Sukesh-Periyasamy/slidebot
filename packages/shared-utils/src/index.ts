import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID v4
 * @example generateId() // "550e8400-e29b-41d4-a716-446655440000"
 */
export const generateId = (): string => uuidv4();

/**
 * Generate a short ID (8 chars) — for readable room codes
 * @example generateShortId() // "a3f2b1c9"
 */
export const generateShortId = (): string =>
  Math.random().toString(36).substring(2, 10);

// ─────────────────────────────────────────────────────────────────────────────
// Date utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a date string to a human-readable relative time
 * @example formatRelativeTime("2024-01-01T00:00:00Z") // "2 days ago"
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

/**
 * Format a date string to ISO 8601
 */
export const toISOString = (date: Date = new Date()): string =>
  date.toISOString();

// ─────────────────────────────────────────────────────────────────────────────
// Color utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Palette of distinct user presence colors */
const PRESENCE_COLORS = [
  '#6366F1', // indigo
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EF4444', // red
  '#14B8A6', // teal
  '#F97316', // orange
  '#84CC16', // lime
] as const;

/**
 * Get a deterministic presence color for a user
 */
export const getPresenceColor = (userId: string): string => {
  // Simple hash of userId to pick a color
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length] ?? PRESENCE_COLORS[0];
};

/**
 * Convert hex color to rgba
 * @example hexToRgba("#6366F1", 0.5) // "rgba(99, 102, 241, 0.5)"
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Slide position utilities
// ─────────────────────────────────────────────────────────────────────────────

const POSITION_GAP = 1000;
const POSITION_START = 1000;

/**
 * Generate initial positions for N slides
 * @example generateInitialPositions(3) // [1000, 2000, 3000]
 */
export const generateInitialPositions = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => POSITION_START + i * POSITION_GAP);

/**
 * Generate a position between two slides (for insert-between)
 */
export const positionBetween = (before: number, after: number): number =>
  Math.round((before + after) / 2);

/**
 * Check if positions need a full reindex (gaps too small)
 */
export const needsReindex = (positions: number[]): boolean => {
  for (let i = 1; i < positions.length; i++) {
    if ((positions[i] ?? 0) - (positions[i - 1] ?? 0) < 2) return true;
  }
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// String utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate a string with ellipsis
 */
export const truncate = (str: string, maxLength: number): string =>
  str.length > maxLength ? `${str.slice(0, maxLength - 3)}...` : str;

/**
 * Get initials from a display name
 * @example getInitials("John Doe") // "JD"
 */
export const getInitials = (name: string): string =>
  name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe environment variable access
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a required environment variable — throws if missing
 */
export const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

/**
 * Get an optional environment variable with fallback
 */
export const getEnv = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;
