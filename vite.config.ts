import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo>/, so the asset base must match.
// The deploy workflow sets VITE_BASE_PATH; local dev/build stays at '/'.
const base = process.env.VITE_BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split large vendor libraries into cached chunks instead of one big bundle.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (id.includes('paper')) return 'vendor-paper';
          }
          return undefined;
        },
      },
    },
  },
})
