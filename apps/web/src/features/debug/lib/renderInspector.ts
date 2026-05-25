type RenderCounts = Record<string, number>;

function getGlobalCounts(): RenderCounts {
  if (typeof window === 'undefined') {
    return {};
  }

  const target = window as unknown as { __SLIDEBOT_RENDER_COUNTS__?: RenderCounts };
  target.__SLIDEBOT_RENDER_COUNTS__ ??= {};
  return target.__SLIDEBOT_RENDER_COUNTS__;
}

export function recordRenderCount(name: string): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }

  const counts = getGlobalCounts();
  counts[name] = (counts[name] ?? 0) + 1;
}

export function getRenderCounts(): RenderCounts {
  return { ...getGlobalCounts() };
}
