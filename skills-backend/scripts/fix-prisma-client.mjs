import fs from 'node:fs'
import path from 'node:path'

const clientEntry = path.resolve(process.cwd(), 'node_modules/.prisma/client/index.js')

if (!fs.existsSync(clientEntry)) {
  process.exit(0)
}

const raw = fs.readFileSync(clientEntry, 'utf8')
const fixed = raw.replace(/^\s*\/client\/schema\.prisma"\)\s*$/gmu, '')

if (fixed !== raw) {
  fs.writeFileSync(clientEntry, fixed, 'utf8')
  console.log('[fix-prisma-client] patched malformed generated client entry')
}
