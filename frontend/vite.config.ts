import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Better resilience for backgrounded tabs. Chrome throttles WebSocket
    // pings on inactive tabs, and the default 30s HMR timeout often
    // expires - which triggers a full module re-fetch on tab return (the
    // "HTML without CSS for 10s" symptom). Bigger timeout keeps the HMR
    // connection healthy across long idle periods.
    hmr: {
      timeout: 120_000,
    },
    // Skip watching vault content + the sibling server/bridge directories.
    // They don't affect the React app and were causing unnecessary
    // invalidations + dependency re-bundles.
    watch: {
      ignored: [
        '**/00_System/**',
        '**/05_Assets/**',
        '**/04_Channel/**',
        '**/03_Projects/dashboard/server/**',
        '**/03_Projects/dashboard/claude-bridge/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8791',
        changeOrigin: true,
      },
    },
  },
  // Production preview server (`vite preview`) serves the built dist/ for fast
  // opens - this is the default the launcher uses. Mirrors the dev proxy so
  // /api still reaches the server on :8791.
  preview: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8791', changeOrigin: true },
    },
  },
  // Pre-bundle heavy deps once at first start so they don't get re-bundled
  // on idle-tab return (which is what makes the page take "a while to
  // come back" after long inactivity).
  optimizeDeps: {
    include: ['react', 'react-dom', '@tanstack/react-query'],
  },
});
