import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

import App from './app/App';
import { initSettingsSync } from './features/settings/lib/settingsSync';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

initSettingsSync();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);
