import { useState, useEffect } from 'react';

interface ViewportSize {
  width: number;
  height: number;
}

export function useViewport(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: number;
    let animationFrameId: number;

    const handleResize = () => {
      clearTimeout(timeoutId);
      
      timeoutId = window.setTimeout(() => {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          setSize({
            width: window.innerWidth,
            height: window.innerHeight,
          });
        });
      }, 100); // 100ms debounce
    };

    window.addEventListener('resize', handleResize, { passive: true });
    
    // Initial size
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return size;
}
