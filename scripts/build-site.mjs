// Arranges the Vite output for hosting (Vercel and any static host):
//   /          → the landing page
//   /app/      → the studio
// Asset URLs are absolute (/assets/…), so moving the HTML files is safe.
import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve('dist')
const studio = path.join(dist, 'index.html')
const landing = path.join(dist, 'landing', 'index.html')

for (const file of [studio, landing]) {
  if (!fs.existsSync(file)) throw new Error(`Expected build output at ${file}. Run "npm run build" first.`)
}

fs.mkdirSync(path.join(dist, 'app'), { recursive: true })
fs.renameSync(studio, path.join(dist, 'app', 'index.html'))
fs.renameSync(landing, studio)
fs.rmSync(path.join(dist, 'landing'), { recursive: true, force: true })

console.log('Site ready · dist/index.html (landing) and dist/app/index.html (studio)')
