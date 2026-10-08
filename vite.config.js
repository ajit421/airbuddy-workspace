import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // The hosted Claude connector (api/mcp.js, api/oauth.js) in local dev: run
  // `npm run dev:connector` alongside `npm run dev`. Only these paths are
  // proxied, so /api/gemini behaves as before.
  server: {
    proxy: Object.fromEntries(
      ['/api/mcp', '/api/oauth', '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server']
        .map((p) => [p, 'http://127.0.0.1:3001']),
    ),
  },

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
         *  - exceljs          → no rule on purpose: it is only reached through the
         *                       dynamic import in roadmapExportService, so Rollup
         *                       gives it its own chunk, loaded on Export click
         *  - Everything else  → app code chunks (split by dynamic import boundaries)
         */
        manualChunks(id) {
          // React ecosystem. The trailing slashes matter: a bare
          // 'node_modules/react' also matched react-big-calendar, react-markdown
          // and react-chartjs-2, so all three landed in vendor-react (534 KB on
          // every first load) and vendor-calendar was never emitted.
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/scheduler/')) {
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
