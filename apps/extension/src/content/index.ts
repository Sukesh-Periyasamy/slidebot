import { getOrMountOverlay } from './overlay/mount';
import { meetDetector } from './meet/detector';

console.log('[SlideBot] Content script initialized.');

// Initialize Meet detector to mount overlay when entering a call
meetDetector.onStateChange((state) => {
  if (state?.state === 'in-call') {
    getOrMountOverlay();
  }
});
