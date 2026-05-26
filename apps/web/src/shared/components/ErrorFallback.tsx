import React from 'react';
import { Button } from '@/shared/components/Button';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import * as Sentry from '@sentry/react';

export function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  const handleReload = () => {
    resetError();
    window.location.reload();
  };

  const handleReport = () => {
    Sentry.showReportDialog({ eventId: Sentry.lastEventId() ?? '' });
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-surface-950 p-6 text-center text-surface-200">
      <div className="mb-6 rounded-full bg-red-500/10 p-4 text-red-400">
        <AlertTriangle className="h-12 w-12" />
      </div>
      
      <h1 className="mb-2 text-2xl font-bold text-surface-50">Something went wrong</h1>
      <p className="mb-6 max-w-md text-sm text-surface-400">
        We've encountered an unexpected error. Our team has been notified.
      </p>

      {import.meta.env.DEV && (
        <div className="mb-8 max-w-xl overflow-auto rounded-md border border-red-500/20 bg-red-950/20 p-4 text-left font-mono text-xs text-red-300">
          <strong>{error.name}:</strong> {error.message}
          <br />
          {error.stack}
        </div>
      )}

      <div className="flex gap-4">
        <Button onClick={handleReload} variant="primary" className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Reload Page
        </Button>
        <Button onClick={handleReport} variant="secondary">
          Report Issue
        </Button>
      </div>
    </div>
  );
}
