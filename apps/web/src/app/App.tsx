import { AppProviders } from './providers';
import { AppRouter } from './router';
import * as Sentry from '@sentry/react';
import { Toaster } from '@/shared/components/Toaster';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { CommandPalette } from '@/shared/components/CommandPalette';

import { ErrorFallback } from '@/shared/components/ErrorFallback';

import { SettingsProvider } from '@/features/settings/components/SettingsProvider';

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => <ErrorFallback error={error as Error} resetError={resetError} />}>
      <AppProviders>
        <SettingsProvider>
          <AppRouter />
          <Toaster />
          <OnboardingFlow />
          <CommandPalette />
        </SettingsProvider>
      </AppProviders>
    </Sentry.ErrorBoundary>
  );
}
