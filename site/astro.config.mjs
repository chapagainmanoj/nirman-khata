// The marketing site: static HTML at "/", laid over the app build at deploy (see README.md).
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://nirman-khata.com',
  output: 'static',
  // Own folder for built files, so they never collide with the app's /assets/.
  build: { assets: '_site', format: 'file' },
  server: { port: 4321 },
  vite: { plugins: [tailwindcss()] },
})
