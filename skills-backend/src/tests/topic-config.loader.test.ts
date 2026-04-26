import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { __testing, getTopicConfigRoot, getTopicDefinition } from '../../topic-config'

test('topic config loader falls back from dist output to the source config root', () => {
  const missingDistTopicConfigRoot = path.resolve(process.cwd(), 'dist', 'topic-config-missing')
  const sourceTopicConfigRoot = path.resolve(process.cwd(), 'topic-config')

  const resolvedRoot = __testing.resolveTopicConfigRoot([
    missingDistTopicConfigRoot,
    sourceTopicConfigRoot,
  ])

  assert.equal(resolvedRoot, sourceTopicConfigRoot)
})

test('topic config loader exposes the configured topic catalog at runtime', () => {
  const root = getTopicConfigRoot()
  assert.ok(__testing.isTopicConfigRoot(root))
  assert.equal(getTopicDefinition('autonomous-driving').id, 'autonomous-driving')
})
