import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Stamps the service worker with this build: each deploy changes sw.js, so installed apps pick up
// the new version and drop the files of the old one instead of staying stuck on it.
const stampServiceWorker = (): Plugin => {
  let outDir = 'dist'
  return {
    name: 'overloady-stamp-sw',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js')
      const build = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || Date.now().toString(36)
      writeFileSync(file, readFileSync(file, 'utf8').replace('__OVERLOADY_BUILD__', build))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
