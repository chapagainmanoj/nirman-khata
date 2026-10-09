/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Light PWA layer only: installable, home-screen icon, cached app shell.
// No core feature depends on the service worker (design §8, mobile decision).
export default defineConfig({
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
        theme_color: '#9c3d26',
        background_color: '#faf7f5',
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
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'], // e2e/ is Playwright's
  },
})
