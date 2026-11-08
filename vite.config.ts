import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Two pages: the studio (index.html) and the marketing landing page (landing/index.html).
// `npm run build:site` arranges them for hosting: landing at "/", studio at "/app/".
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5178 },
  build: {
    rollupOptions: {
      input: {
        studio: entry('./index.html'),
        landing: entry('./landing/index.html'),
      },
    },
  },
})
