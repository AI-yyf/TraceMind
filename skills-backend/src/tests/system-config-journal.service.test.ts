import assert from 'node:assert/strict'
import test from 'node:test'

import { prisma } from '../lib/prisma'
import {
  listVersionedSystemConfigHistory,
  readVersionedSystemConfig,
  writeVersionedSystemConfig,
} from '../services/system-config-journal'

function parseRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

test('system config journal versions records and flags abrupt config shrinkage', async () => {
  const key = `test:system-config-journal:${Date.now()}`
  const historyKey = `system-config-history:v1:${key}`

  try {
    const firstValue = {
      alpha: 'A'.repeat(320),
      beta: 'B'.repeat(320),
      gamma: 'C'.repeat(320),
      delta: 'D'.repeat(320),
    }
    const secondValue = {
      alpha: 'trimmed',
    }

    const first = await writeVersionedSystemConfig({
      key,
      value: firstValue,
      parse: parseRecord,
      fallback: {},
      source: 'test-suite',
      actor: 'system-config-journal-test',
    })
    const second = await writeVersionedSystemConfig({
      key,
      value: secondValue,
      parse: parseRecord,
      fallback: {},
      source: 'test-suite',
      actor: 'system-config-journal-test',
    })

    assert.equal(first.meta.revision, 1)
    assert.equal(second.meta.revision, 2)
    assert.equal(second.meta.source, 'test-suite')

    const current = await readVersionedSystemConfig({
      key,
      parse: parseRecord,
      fallback: {},
    })
    const history = await listVersionedSystemConfigHistory(key, 4)

    assert.deepEqual(current.value, secondValue)
    assert.equal(current.meta.revision, 2)
    assert.equal(history.length, 2)
    assert.equal(history[0]?.revision, 2)
    assert.equal(history[1]?.revision, 1)
    assert.equal(history[0]?.previousHash, first.meta.hash)
    assert.equal(history[0]?.warnings.some((item) => item.startsWith('size-drop:')), true)
    assert.equal(history[0]?.warnings.some((item) => item.startsWith('key-drop:')), true)
  } finally {
    await prisma.system_configs.deleteMany({
      where: {
        key: {
          in: [key, historyKey],
        },
      },
    })
  }
})
