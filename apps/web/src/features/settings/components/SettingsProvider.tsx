import { useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { applyDensity } from '@/shared/styles/layoutTokens';

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { theme, density, reducedMotion, highContrast, fontScaling } = useSettingsStore(
    (state) => state.settings
  );

  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    applyDensity(document.documentElement, density);
  }, [density]);

  useEffect(() => {
    if (reducedMotion) {
      document.body.setAttribute('data-reduced-motion', 'true');
    } else {
      document.body.removeAttribute('data-reduced-motion');
    }
  }, [reducedMotion]);

  useEffect(() => {
    if (highContrast) {
      document.body.setAttribute('data-high-contrast', 'true');
    } else {
      document.body.removeAttribute('data-high-contrast');
    }
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', `${fontScaling / 100}`);
    document.documentElement.style.fontSize = `${(fontScaling / 100) * 16}px`;
  }, [fontScaling]);

  // System theme listener for auto-updates when 'system' is selected
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return <>{children}</>;
}
