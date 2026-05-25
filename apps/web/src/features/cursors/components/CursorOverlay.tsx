import { memo, useEffect, useRef } from 'react';
import { useCursorStore } from '../store/cursorStore';

interface CursorOverlayProps {
  slideId: string;
  width: number;
  height: number;
}

function toPixel(value: number, size: number): number {
  return Math.max(0, Math.min(size, value * size));
}

export const CursorOverlay = memo(function CursorOverlay({ slideId, width, height }: CursorOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Record<string, { root: HTMLDivElement; label: HTMLSpanElement; dot: HTMLSpanElement }>>({});
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const createNode = (userId: string, cursor: any) => {
      const root = document.createElement('div');
      root.className = 'absolute flex items-center gap-2';
      root.style.position = 'absolute';
      root.style.transform = 'translate(-4px, -4px)';

      const dot = document.createElement('span');
      dot.className = 'relative flex h-3.5 w-3.5 rounded-full border border-white/80 shadow-lg';
      dot.style.display = 'inline-block';
      dot.style.backgroundColor = cursor.color;

      const pulse = document.createElement('span');
      pulse.className = 'absolute inset-0 rounded-full';
      pulse.style.boxShadow = cursor.cursorPulseAt ? `0 0 0 8px ${cursor.color}22` : 'none';
      dot.appendChild(pulse);

      const label = document.createElement('span');
      label.className = 'rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-lg';
      label.textContent = cursor.displayName + (cursor.isOffscreen ? ' • offscreen' : '');
      label.style.marginLeft = '6px';

      root.appendChild(dot);
      root.appendChild(label);
      container.appendChild(root);

      nodesRef.current[userId] = { root, label, dot } as any;
    };

    const removeNode = (userId: string) => {
      const n = nodesRef.current[userId];
      if (!n) return;
      n.root.remove();
      delete nodesRef.current[userId];
    };

    // Subscribe to cursors map to add/remove nodes when keys change
    const unsub = useCursorStore.subscribe(
      (s) => s.cursors,
      (next) => {
        const keys = Object.keys(next).filter((k) => next[k]?.slideId === slideId);
        const existingKeys = Object.keys(nodesRef.current);

        // add
        keys.forEach((k) => {
          if (!nodesRef.current[k]) {
            createNode(k, next[k]);
          }
        });

        // remove
        existingKeys.forEach((k) => {
          if (!keys.includes(k)) {
            removeNode(k);
          }
        });
      },
      { fireImmediately: true }
    );

    const tick = () => {
      const cursors = useCursorStore.getState().cursors;
      const now = performance.now();
      Object.entries(nodesRef.current).forEach(([userId, { root, label, dot }]) => {
        const c = cursors[userId];
        if (!c || c.slideId !== slideId) return;

        const x = toPixel(c.x, width);
        const y = toPixel(c.y, height);
        const clampedX = c.isOffscreen ? Math.max(8, Math.min(width - 8, x)) : x;
        const clampedY = c.isOffscreen ? Math.max(8, Math.min(height - 8, y)) : y;

        root.style.left = `${clampedX}px`;
        root.style.top = `${clampedY}px`;

        // update label/pulse/color when changed
        label.textContent = c.displayName + (c.isOffscreen ? ' • offscreen' : '');
        dot.style.backgroundColor = c.color;
        const pulse = dot.firstElementChild as HTMLElement | null;
        if (pulse) {
          pulse.style.boxShadow = c.cursorPulseAt ? `0 0 0 8px ${c.color}22` : 'none';
        }
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      const snapshot = { ...nodesRef.current };
      unsub();
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // cleanup nodes from snapshot to avoid stale ref warnings
      Object.keys(snapshot).forEach((k) => {
        snapshot[k]?.root.remove();
      });
      // reset nodesRef to empty
      nodesRef.current = {} as typeof nodesRef.current;
    };
  }, [slideId, width, height]);

  if (width === 0 || height === 0) return null;

  return <div ref={containerRef} className="pointer-events-none absolute inset-0" />;
});
