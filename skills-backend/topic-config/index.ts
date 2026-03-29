import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import defaultsJson from './defaults.json' with { type: 'json' }
import capabilitiesJson from './capabilities.json' with { type: 'json' }

import {
  assertCapabilityDefinition,
  assertTopicDefaults,
  assertTopicDefinition,
  type CapabilityDefinition,
  type TopicDefaults,
  type TopicDefinition,
} from './schema.ts'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const topicsDir = path.join(currentDir, 'topics')

export function getTopicConfigRoot() {
  return currentDir
}

export function loadTopicDefaults(): TopicDefaults {
  assertTopicDefaults(defaultsJson)
  return defaultsJson
}

export function loadCapabilityDefinitions(): CapabilityDefinition[] {
  if (!Array.isArray(capabilitiesJson)) {
    throw new Error('capabilities.json must be an array.')
  }

  for (const item of capabilitiesJson) {
    assertCapabilityDefinition(item)
  }

  return capabilitiesJson
}

export function loadTopicDefinitions(): TopicDefinition[] {
  const defaults = loadTopicDefaults()
  const files = fs
    .readdirSync(topicsDir)
    .filter((file) => file.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right))

  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(topicsDir, file), 'utf8')) as Record<string, unknown>
    const merged = {
      ...raw,
      defaults: {
        ...defaults,
        ...((raw.defaults as Record<string, unknown> | undefined) ?? {}),
        preferredModels: {
          ...defaults.preferredModels,
          ...(((raw.defaults as Record<string, unknown> | undefined)?.preferredModels as Record<string, unknown> | undefined) ?? {}),
        },
      },
    } as unknown
    assertTopicDefinition(merged)
    return merged
  })
}

export function getTopicDefinition(topicId: string): TopicDefinition {
  const topic = loadTopicDefinitions().find((entry) => entry.id === topicId)
  if (!topic) {
    throw new Error(`Unknown topic id: ${topicId}`)
  }
  return topic
}
