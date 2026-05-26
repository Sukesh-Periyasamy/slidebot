import { useState, useEffect, useCallback, RefObject } from 'react';

/**
 * Hook to manage fullscreen state for a specific element or the document.
 */
export function useFullscreen(elementRef?: RefObject<HTMLElement>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const checkFullscreen = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  useEffect(() => {
    document.addEventListener('fullscreenchange', checkFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
    };
  }, [checkFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const target = elementRef?.current || document.documentElement;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Failed to toggle fullscreen:', err);
    }
  }, [elementRef]);

  return { isFullscreen, toggleFullscreen };
}
