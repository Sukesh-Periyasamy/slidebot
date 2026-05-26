import { UIDensity } from '../utils/responsive';

export const densityTokens: Record<UIDensity, Record<string, string>> = {
  compact: {
    '--spacing-base': '0.75rem',
    '--toolbar-height': '40px',
    '--icon-size': '16px',
    '--font-size-base': '13px',
    '--card-padding': '1rem',
  },
  comfortable: {
    '--spacing-base': '1rem',
    '--toolbar-height': '56px',
    '--icon-size': '20px',
    '--font-size-base': '15px',
    '--card-padding': '1.5rem',
  },
  spacious: {
    '--spacing-base': '1.25rem',
    '--toolbar-height': '72px',
    '--icon-size': '24px',
    '--font-size-base': '16px',
    '--card-padding': '2rem',
  },
};

/**
 * Utility to apply density tokens to a DOM element (e.g. document.documentElement)
 */
export function applyDensity(element: HTMLElement, density: UIDensity) {
  const tokens = densityTokens[density];
  if (!tokens) return;
  
  Object.entries(tokens).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
  element.dataset.density = density;
}
