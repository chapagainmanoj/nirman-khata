// Regenerate app icons with: pnpm exec pwa-assets-generator
// Home-screen icons (maskable, Apple) fill their padding with the brand colour, not white.
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

const brand = '#6a1f24' // Lal Bahi, the logo tile

export default defineConfig({
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: { background: brand } },
    apple: { ...preset.apple, resizeOptions: { background: brand } },
  },
  images: ['public/favicon.svg'],
})
