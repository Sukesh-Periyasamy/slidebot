import { useState, useEffect } from 'react';
import { MSG, sendToBackground, type ExtensionStatus } from '../../shared/messages';

export function useExtensionStatus() {
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: number;

    async function fetchStatus() {
      try {
        const result = await sendToBackground<ExtensionStatus>({ type: MSG.GET_STATUS });
        if (mounted) {
          setStatus(result);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          console.error('[Popup] Failed to fetch status:', err);
          setError(err.message || 'Failed to connect to background script');
        }
      }
    }

    // Initial fetch
    void fetchStatus();

    // Poll every 1000ms to keep popup fresh (since popup is short-lived)
    timer = window.setInterval(fetchStatus, 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return { status, error };
}
