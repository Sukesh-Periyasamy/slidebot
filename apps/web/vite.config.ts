import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Allow importing workspace packages directly in dev
      '@slidebot/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@slidebot/shared-schemas': path.resolve(__dirname, '../../packages/shared-schemas/src'),
      '@slidebot/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
    },
  },
  server: {
    port: 3000,
    // Proxy API calls to backend in development
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Chunk splitting for better caching
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          canvas: ['konva', 'react-konva'],
          collab: ['socket.io-client', 'yjs'],
          state: ['zustand', '@tanstack/react-query'],
        },
      },
    },
  },
});
