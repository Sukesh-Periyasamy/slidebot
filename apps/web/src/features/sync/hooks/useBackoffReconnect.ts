/**
 * useBackoffReconnect — exponential backoff reconnect scheduler.
 *
 * When the socket disconnects:
 * 1. Increment attempt counter
 * 2. Calculate delay: min(base * 2^attempt + jitter, maxDelay)
 * 3. Show countdown timer in UI
 * 4. After delay, trigger reconnect
 * 5. On success: reset counter
 * 6. On max attempts: show manual retry UI
 *
 * Jitter prevents thundering herd when many users disconnect simultaneously.
 * Socket.IO also has its own backoff — this provides UI-level visibility.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { connectSocket } from '@/features/collaboration/lib/socketClient';
import { useSyncStore } from '../store/syncStore';

const BASE_DELAY_MS = 1_000; // 1s base
const MAX_DELAY_MS = 30_000; // 30s cap
const MAX_ATTEMPTS = 8; // After this: show manual retry

function calcDelay(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  const jitter = Math.random() * 1000; // Up to 1s jitter
  return Math.floor(exp + jitter);
}

export interface BackoffState {
  isReconnecting: boolean;
  attempt: number;
  maxAttempts: number;
  /** Milliseconds until next retry (counts down) */
  nextRetryInMs: number;
  hasGivenUp: boolean;
  manualRetry: () => void;
}

export function useBackoffReconnect(): BackoffState {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const setConnectionStatus = useSyncStore((s) => s.setConnectionStatus);
  const setReconnectAttempts = useSyncStore((s) => s.setReconnectAttempts);

  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [nextRetryInMs, setNextRetryInMs] = useState(0);
  const [hasGivenUp, setHasGivenUp] = useState(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
  }, []);

  const doReconnect = useCallback(async () => {
    clearTimers();
    setNextRetryInMs(0);

    try {
      setConnectionStatus('connecting');
      await connectSocket();
      // connectSocket sets status internally
      attemptRef.current = 0;
      setReconnectAttempts(0);
      setHasGivenUp(false);
    } catch {
      // Will be caught by the status-change effect
    }
  }, [clearTimers, setConnectionStatus, setReconnectAttempts]);

  const scheduleReconnect = useCallback(() => {
    if (attemptRef.current >= MAX_ATTEMPTS) {
      setHasGivenUp(true);
      return;
    }

    const delay = calcDelay(attemptRef.current);
    attemptRef.current++;
    setReconnectAttempts(attemptRef.current);

    let remaining = delay;
    setNextRetryInMs(remaining);

    // Countdown ticker (updates every 500ms for smooth UI)
    countdownRef.current = setInterval(() => {
      remaining -= 500;
      setNextRetryInMs(Math.max(0, remaining));
    }, 500);

    timerRef.current = setTimeout(() => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      void doReconnect();
    }, delay);
  }, [doReconnect, setReconnectAttempts]);

  // Trigger on disconnect/error
  useEffect(() => {
    if (connectionStatus === 'reconnecting' || connectionStatus === 'error') {
      scheduleReconnect();
    } else if (connectionStatus === 'connected') {
      clearTimers();
      attemptRef.current = 0;
      setHasGivenUp(false);
      setNextRetryInMs(0);
    }

    return clearTimers;
  }, [connectionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const manualRetry = useCallback(() => {
    clearTimers();
    attemptRef.current = 0;
    setHasGivenUp(false);
    void doReconnect();
  }, [clearTimers, doReconnect]);

  return {
    isReconnecting: connectionStatus === 'reconnecting' || connectionStatus === 'connecting',
    attempt: attemptRef.current,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryInMs,
    hasGivenUp,
    manualRetry,
  };
}
