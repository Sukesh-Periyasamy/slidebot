import { AppProviders } from './providers';
import { AppRouter } from './router';
import * as Sentry from '@sentry/react';
import { Toaster } from '@/shared/components/Toaster';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { CommandPalette } from '@/shared/components/CommandPalette';

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={<div className="p-8 text-center text-red-500">Something went wrong.</div>}>
      <AppProviders>
        <AppRouter />
        <Toaster />
        <OnboardingFlow />
        <CommandPalette />
      </AppProviders>
    </Sentry.ErrorBoundary>
  );
}
