import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';

const BRANDING_COLORS = {
  default: { brand: '#6173f2', brandLight: '#8199f8', brandDark: '#4e55e6' },
  ocean: { brand: '#0ea5e9', brandLight: '#38bdf8', brandDark: '#0284c7' },
  ruby: { brand: '#e11d48', brandLight: '#fb7185', brandDark: '#be123c' },
  forest: { brand: '#10b981', brandLight: '#34d399', brandDark: '#059669' },
};

export function ThemeManager() {
  const { theme, branding, density } = useThemeStore();

  useEffect(() => {
    const root = document.documentElement;

    // Apply color theme
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    // Apply branding CSS vars
    const colors = BRANDING_COLORS[branding] || BRANDING_COLORS.default;
    root.style.setProperty('--color-brand', colors.brand);
    root.style.setProperty('--color-brand-light', colors.brandLight);
    root.style.setProperty('--color-brand-dark', colors.brandDark);

    // Apply density
    if (density === 'compact') {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }

  }, [theme, branding, density]);

  return null;
}
