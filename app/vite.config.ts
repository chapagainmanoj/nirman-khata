/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The deploy lays the marketing site (site/) over this build and "/" becomes the site; Pages also
// redirects /index.html to "/". So the service worker cannot cache the app shell as index.html (it
// would get the site): the build writes the same shell as app.html too, which Pages serves as is.
function appShell(): Plugin {
  return {
    name: 'app-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = bundle['index.html']
      if (html?.type === 'asset') this.emitFile({ type: 'asset', fileName: 'app.html', source: html.source })
    },
  }
}

// Light PWA layer only: installable, home-screen icon, cached app shell.
// No core feature depends on the service worker (design §8, mobile decision).
export default defineConfig({
  // Playwright writes traces and screenshots under e2e/; reloading on those would break the run.
  server: { watch: { ignored: ['**/e2e/**'] } },
  plugins: [
    react(),
    tailwindcss(),
    appShell(),
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
        // The shell as app.html (appShell above); "/" is the site, so it always goes to the network.
        navigateFallback: '/app.html',
        navigateFallbackDenylist: [/^\/$/, /^\/(rest|auth|storage|functions)\//],
        directoryIndex: '',
        // The HEIC converter (3 MB) loads only when someone picks an iPhone photo on a computer;
        // index.html is the same shell as app.html.
        globIgnores: ['**/heic-to-*.js', 'index.html'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'], // e2e/ is Playwright's
  },
})
