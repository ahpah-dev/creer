import fs from 'node:fs'
import path from 'node:path'

const source = path.resolve('standalone/index.html')
const target = path.resolve('Creer.html')
const docsDir = path.resolve('docs')
const docsTarget = path.join(docsDir, 'index.html')

if (!fs.existsSync(source)) {
  throw new Error(`Standalone build not found at ${source}`)
}
fs.copyFileSync(source, target)
fs.mkdirSync(docsDir, { recursive: true })
fs.copyFileSync(source, docsTarget)
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '')
const size = fs.statSync(target).size
console.log(`Creer.html ready · ${(size / (1024 * 1024)).toFixed(2)} MB`)
console.log(`GitHub Pages copy ready · docs/index.html`)
