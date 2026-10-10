/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Light PWA layer only: installable, home-screen icon, cached app shell.
// No core feature depends on the service worker (design §8, mobile decision).
export default defineConfig({
  // Playwright writes traces and screenshots under e2e/; reloading on those would break the run.
  server: { watch: { ignored: ['**/e2e/**'] } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NirmanKhata',
        short_name: 'NirmanKhata',
        description: 'Construction site and cost register',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/projects',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the app shell is cached; API calls always go to the network.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/(rest|auth|storage|functions)\//],
        // The HEIC converter (3 MB) loads only when someone picks an iPhone photo on a computer.
        globIgnores: ['**/heic-to-*.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'], // e2e/ is Playwright's
  },
})
