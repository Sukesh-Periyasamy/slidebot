import { AppProviders } from './providers';
import { AppRouter } from './router';
import { Toaster } from '@/shared/components/Toaster';

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
      <Toaster />
    </AppProviders>
  );
}
