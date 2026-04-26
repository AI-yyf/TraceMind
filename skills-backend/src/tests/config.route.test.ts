import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import { createApp } from '../server'

async function withServer(run: (origin: string) => Promise<void>) {
  const app = createApp()
  const server = createServer(app)

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not resolve test server address.')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('GET /api/config only exposes public keys and tolerates legacy plain-text values', async () => {
  const legacyKey = 'public:test:config:legacy-plain-text'
  const jsonKey = 'public:test:config:json-object'
  const secretKey = 'alpha:secret:model-api-key:test-config-route'

  await prisma.system_configs.deleteMany({
    where: {
      key: {
        in: [legacyKey, jsonKey, secretKey],
      },
    },
  })

  await prisma.system_configs.createMany({
    data: [
      {
        id: crypto.randomUUID(),
        key: legacyKey,
        value: 'legacy-plain-text',
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        key: jsonKey,
        value: JSON.stringify({ enabled: true, provider: 'test' }),
        updatedAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        key: secretKey,
        value: JSON.stringify({ cipherText: 'masked', preview: 'test****test' }),
        updatedAt: new Date(),
      },
    ],
  })

  try {
    await withServer(async (origin) => {
      const response = await fetch(`${origin}/api/config`)
      assert.equal(response.status, 200)

      const payload = (await response.json()) as {
        success: boolean
        data: Record<string, unknown>
      }

      assert.equal(payload.success, true)
      assert.equal(payload.data[legacyKey], 'legacy-plain-text')
      assert.deepEqual(payload.data[jsonKey], { enabled: true, provider: 'test' })
      assert.equal(secretKey in payload.data, false)

      const itemResponse = await fetch(`${origin}/api/config/${legacyKey}`)
      assert.equal(itemResponse.status, 200)

      const itemPayload = (await itemResponse.json()) as {
        success: boolean
        data: unknown
      }

      assert.equal(itemPayload.success, true)
      assert.equal(itemPayload.data, 'legacy-plain-text')

      const secretResponse = await fetch(`${origin}/api/config/${secretKey}`)
      assert.equal(secretResponse.status, 403)

      const secretPayload = (await secretResponse.json()) as {
        error: string
      }

      assert.match(secretPayload.error, /public config route/i)
    })
  } finally {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [legacyKey, jsonKey, secretKey],
        },
      },
    })
  }
})
