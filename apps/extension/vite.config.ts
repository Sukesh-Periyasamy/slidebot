import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import path from 'path';

import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@ext': path.resolve(__dirname, './src'),
      '@slidebot/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@slidebot/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
    },
  },
  build: {
    // Emit source maps for debugging in Chrome DevTools
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      output: {
        // Prevent chunk splitting that breaks extension loading
        manualChunks: undefined,
      },
    },
  },
  // Required for @crxjs/vite-plugin HMR
  server: {
    port: 5174,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
});
