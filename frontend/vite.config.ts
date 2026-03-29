import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

const frontendRoot = fileURLToPath(new URL('./', import.meta.url))
const generatedDataRoot = fileURLToPath(new URL('../generated-data', import.meta.url))
const topicRegistryPath = fileURLToPath(
  new URL('../generated-data/app-data/workflow/active-topics.json', import.meta.url),
)

function topicRegistryApi(): Plugin {
  return {
    name: 'topic-registry-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__topic-registry')) {
          next()
          return
        }

        if (req.method === 'GET') {
          sendJson(res, readTopicRegistry())
          return
        }

        if (req.method === 'POST') {
          try {
            const body = await readBody(req)
            const payload = JSON.parse(body || '[]')
            const entries = normalizeTopicRegistry(Array.isArray(payload) ? payload : payload.entries)
            const current = readTopicRegistry()
            if (JSON.stringify(current) !== JSON.stringify(entries)) {
              fs.writeFileSync(topicRegistryPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
            }
            sendJson(res, entries)
          } catch (error) {
            sendJson(
              res,
              { error: error instanceof Error ? error.message : 'Invalid topic registry payload.' },
              400,
            )
          }
          return
        }

        sendJson(res, { error: 'Method not allowed.' }, 405)
      })
    },
  }
}

export default defineConfig({
  root: frontendRoot,
  publicDir: fileURLToPath(new URL('../generated-data/public', import.meta.url)),
  plugins: [topicRegistryApi(), react()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)),
        }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@generated': fileURLToPath(new URL('../generated-data/app-data', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')

          if (normalized.includes('/generated-data/app-data/') || normalized.includes('/src/data/tracker.ts')) {
            return 'tracker-data'
          }

          if (normalized.includes('/node_modules/')) {
            if (normalized.includes('framer-motion')) return 'framer-motion'
            if (normalized.includes('lucide-react')) return 'lucide'
            if (normalized.includes('react-router')) return 'router'
            return 'vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    fs: {
      allow: [frontendRoot, generatedDataRoot],
    },
    host: '0.0.0.0',
    allowedHosts: true,
  },
})

function readTopicRegistry() {
  try {
    const raw = fs.readFileSync(topicRegistryPath, 'utf8')
    return normalizeTopicRegistry(JSON.parse(raw))
  } catch {
    return []
  }
}

function normalizeTopicRegistry(value: unknown) {
  if (!Array.isArray(value)) return []

  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()

  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry, index) => {
      const status = entry.status === 'archived' ? 'archived' : 'active'
      const archivedAt = typeof entry.archivedAt === 'string' ? entry.archivedAt : null

      return {
        topicId: typeof entry.topicId === 'string' ? entry.topicId : '',
        status,
        displayOrder: index,
        activatedAt: typeof entry.activatedAt === 'string' ? entry.activatedAt : today,
        archivedAt: status === 'archived' ? archivedAt ?? today : null,
      }
    })
    .filter((entry) => {
      if (!entry.topicId || seen.has(entry.topicId)) return false
      seen.add(entry.topicId)
      return true
    })
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = ''

    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}
