import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      output: {
        /**
         * Phase 19 — Manual chunk splitting.
         *
         * Goals:
         *  1. Vendor libs (react, firebase, chart.js) cached separately from
         *     app code — a vendor chunk rarely changes, so browsers cache it
         *     across deployments even when app code changes.
         *  2. Roadmap module lands in its own async chunk (enabled by the
         *     React.lazy() dynamic import in App.jsx — Vite/Rollup
         *     automatically creates the split; this config just ensures
         *     vendor libs don't also end up in that chunk).
         *
         * Chunk strategy:
         *  - vendor-react     → react + react-dom + react-router-dom
         *  - vendor-firebase  → all firebase/* subpackages
         *  - vendor-charts    → chart.js + react-chartjs-2
         *  - vendor-utils     → date-fns + zod (lighter libs, still versioned separately)
         *  - Everything else  → app code chunks (split by dynamic import boundaries)
         */
        manualChunks(id) {
          // React ecosystem
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom') ||
              id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }

          // Firebase SDK
          if (id.includes('node_modules/firebase') ||
              id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }

          // Charting libraries
          if (id.includes('node_modules/chart.js') ||
              id.includes('node_modules/react-chartjs-2')) {
            return 'vendor-charts';
          }

          // Utility libraries
          if (id.includes('node_modules/date-fns') ||
              id.includes('node_modules/zod')) {
            return 'vendor-utils';
          }

          // Calendar library — kept separate as it's large
          if (id.includes('node_modules/react-big-calendar') ||
              id.includes('node_modules/moment') ||
              id.includes('node_modules/globalize') ||
              id.includes('node_modules/cldr')) {
            return 'vendor-calendar';
          }

          // AI SDK
          if (id.includes('node_modules/@google/genai')) {
            return 'vendor-ai';
          }

          // All other node_modules — let Rollup decide placement naturally
          // (avoid a catch-all "vendor-misc" which causes circular chunk warnings
          // when chart.js internals cross-reference react internals)
        },
      },
    },
  },
})
