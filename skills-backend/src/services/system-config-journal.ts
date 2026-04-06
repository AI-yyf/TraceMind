import { createHash } from 'node:crypto'

import { prisma } from '../lib/prisma'

const CONFIG_ENVELOPE_SCHEMA_VERSION = 'system-config-envelope-v1'
const CONFIG_HISTORY_SCHEMA_VERSION = 'system-config-history-v1'
const CONFIG_HISTORY_KEY_PREFIX = 'system-config-history:v1:'
const MAX_CONFIG_HISTORY_ENTRIES = 16

export interface VersionedSystemConfigMeta {
  key: string
  revision: number
  hash: string
  updatedAt: string | null
  source: string
  actor: string | null
  sizeBytes: number
  topLevelKeys: string[]
  legacy: boolean
}

export interface VersionedSystemConfigRecord<T> {
  value: T
  meta: VersionedSystemConfigMeta
}

export interface VersionedSystemConfigHistoryEntry extends VersionedSystemConfigMeta {
  previousHash: string | null
  warnings: string[]
}

interface VersionedSystemConfigEnvelope<T> {
  schemaVersion: typeof CONFIG_ENVELOPE_SCHEMA_VERSION
  key: string
  revision: number
  hash: string
  updatedAt: string
  source: string
  actor: string | null
  topLevelKeys: string[]
  value: T
}

interface VersionedSystemConfigHistoryState {
  schemaVersion: typeof CONFIG_HISTORY_SCHEMA_VERSION
  key: string
  updatedAt: string
  entries: VersionedSystemConfigHistoryEntry[]
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
    .join(',')}}`
}

function buildHash(value: unknown) {
  return createHash('sha1').update(stableStringify(value)).digest('hex')
}

function topLevelKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.keys(value as Record<string, unknown>).sort((left, right) =>
    left.localeCompare(right),
  )
}

function historyKey(key: string) {
  return `${CONFIG_HISTORY_KEY_PREFIX}${key}`
}

function parseJson(value: string | null | undefined) {
  if (!value) return null

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function isEnvelope(value: unknown): value is VersionedSystemConfigEnvelope<unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as { schemaVersion?: unknown }).schemaVersion === CONFIG_ENVELOPE_SCHEMA_VERSION &&
      typeof (value as { key?: unknown }).key === 'string' &&
      typeof (value as { revision?: unknown }).revision === 'number' &&
      typeof (value as { hash?: unknown }).hash === 'string',
  )
}

function parseHistoryState(value: string | null | undefined, key: string): VersionedSystemConfigHistoryState {
  const parsed = parseJson(value)
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (parsed as { schemaVersion?: unknown }).schemaVersion === CONFIG_HISTORY_SCHEMA_VERSION &&
    Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    return {
      schemaVersion: CONFIG_HISTORY_SCHEMA_VERSION,
      key,
      updatedAt:
        typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
          ? (parsed as { updatedAt: string }).updatedAt
          : new Date().toISOString(),
      entries: ((parsed as { entries: unknown[] }).entries ?? []).filter(
        (entry): entry is VersionedSystemConfigHistoryEntry =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof (entry as { hash?: unknown }).hash === 'string',
      ),
    }
  }

  return {
    schemaVersion: CONFIG_HISTORY_SCHEMA_VERSION,
    key,
    updatedAt: new Date().toISOString(),
    entries: [],
  }
}

function buildWarnings(
  previous: VersionedSystemConfigMeta | null,
  next: VersionedSystemConfigMeta,
) {
  if (!previous) return []

  const warnings: string[] = []
  if (previous.sizeBytes >= 512 && next.sizeBytes < Math.max(1, Math.floor(previous.sizeBytes / 2))) {
    warnings.push(`size-drop:${previous.sizeBytes}->${next.sizeBytes}`)
  }

  if (
    previous.topLevelKeys.length >= 4 &&
    next.topLevelKeys.length > 0 &&
    next.topLevelKeys.length < Math.max(1, Math.floor(previous.topLevelKeys.length / 2))
  ) {
    warnings.push(`key-drop:${previous.topLevelKeys.length}->${next.topLevelKeys.length}`)
  }

  return warnings
}

function buildMetaFromEnvelope<T>(
  key: string,
  envelope: VersionedSystemConfigEnvelope<T>,
  serialized: string,
): VersionedSystemConfigMeta {
  return {
    key,
    revision: envelope.revision,
    hash: envelope.hash,
    updatedAt: envelope.updatedAt,
    source: envelope.source,
    actor: envelope.actor,
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    topLevelKeys: envelope.topLevelKeys,
    legacy: false,
  }
}

function buildLegacyMeta(key: string, value: unknown, serialized: string | null): VersionedSystemConfigMeta {
  return {
    key,
    revision: 0,
    hash: buildHash(value),
    updatedAt: null,
    source: 'legacy',
    actor: null,
    sizeBytes: Buffer.byteLength(serialized ?? '', 'utf8'),
    topLevelKeys: topLevelKeys(value),
    legacy: true,
  }
}

export async function readVersionedSystemConfig<T>(options: {
  key: string
  parse: (value: unknown) => T | null
  fallback: T
}): Promise<VersionedSystemConfigRecord<T>> {
  const record = await prisma.systemConfig.findUnique({
    where: { key: options.key },
  })

  const parsed = parseJson(record?.value)
  if (isEnvelope(parsed)) {
    const value = options.parse(parsed.value)
    if (value !== null) {
      return {
        value,
        meta: buildMetaFromEnvelope(options.key, parsed, record?.value ?? ''),
      }
    }
  }

  const legacyValue = options.parse(parsed)
  if (legacyValue !== null) {
    return {
      value: legacyValue,
      meta: buildLegacyMeta(options.key, legacyValue, record?.value ?? null),
    }
  }

  return {
    value: options.fallback,
    meta: {
      key: options.key,
      revision: 0,
      hash: buildHash(options.fallback),
      updatedAt: null,
      source: 'default',
      actor: null,
      sizeBytes: 0,
      topLevelKeys: topLevelKeys(options.fallback),
      legacy: false,
    },
  }
}

export async function listVersionedSystemConfigHistory(
  key: string,
  limit = MAX_CONFIG_HISTORY_ENTRIES,
): Promise<VersionedSystemConfigHistoryEntry[]> {
  const record = await prisma.systemConfig.findUnique({
    where: { key: historyKey(key) },
  })

  return parseHistoryState(record?.value, key).entries.slice(0, Math.max(1, limit))
}

export async function writeVersionedSystemConfig<T>(options: {
  key: string
  value: T
  parse: (value: unknown) => T | null
  fallback: T
  source: string
  actor?: string | null
}): Promise<VersionedSystemConfigRecord<T>> {
  const previous = await readVersionedSystemConfig({
    key: options.key,
    parse: options.parse,
    fallback: options.fallback,
  })

  const now = new Date().toISOString()
  const envelope: VersionedSystemConfigEnvelope<T> = {
    schemaVersion: CONFIG_ENVELOPE_SCHEMA_VERSION,
    key: options.key,
    revision: previous.meta.revision + 1,
    hash: buildHash(options.value),
    updatedAt: now,
    source: options.source,
    actor: options.actor ?? null,
    topLevelKeys: topLevelKeys(options.value),
    value: options.value,
  }
  const serialized = JSON.stringify(envelope)
  const meta = buildMetaFromEnvelope(options.key, envelope, serialized)
  const historyEntry: VersionedSystemConfigHistoryEntry = {
    ...meta,
    previousHash: previous.meta.hash || null,
    warnings: buildWarnings(previous.meta.revision > 0 || previous.meta.legacy ? previous.meta : null, meta),
  }

  const history = await listVersionedSystemConfigHistory(options.key, MAX_CONFIG_HISTORY_ENTRIES)
  const historyState: VersionedSystemConfigHistoryState = {
    schemaVersion: CONFIG_HISTORY_SCHEMA_VERSION,
    key: options.key,
    updatedAt: now,
    entries: [historyEntry, ...history].slice(0, MAX_CONFIG_HISTORY_ENTRIES),
  }

  await Promise.all([
    prisma.systemConfig.upsert({
      where: { key: options.key },
      update: { value: serialized },
      create: { key: options.key, value: serialized },
    }),
    prisma.systemConfig.upsert({
      where: { key: historyKey(options.key) },
      update: { value: JSON.stringify(historyState) },
      create: {
        key: historyKey(options.key),
        value: JSON.stringify(historyState),
      },
    }),
  ])

  return {
    value: options.value,
    meta,
  }
}

export const __testing = {
  buildWarnings,
  topLevelKeys,
  isEnvelope,
}
