// responsive.ts

export const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type UIDensity = typeof DENSITIES[number];
