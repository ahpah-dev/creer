import fs from 'node:fs'
import path from 'node:path'

const source = path.resolve('standalone/index.html')
const target = path.resolve('Creer.html')
if (!fs.existsSync(source)) {
  throw new Error(`Standalone build not found at ${source}`)
}
fs.copyFileSync(source, target)
const size = fs.statSync(target).size
console.log(`Creer.html ready · ${(size / (1024 * 1024)).toFixed(2)} MB`)
