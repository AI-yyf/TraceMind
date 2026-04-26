import capabilityLibraryJson from '@generated/workflow/capability-library.json'
import topicCatalogJson from '@generated/workflow/topic-catalog.json'
import topicMemoryJson from '@generated/workflow/topic-memory.json'
import paperAssetsJson from '@generated/paper-assets.json'
import paperCatalogJson from '@generated/paper-catalog.json'
import paperMetricsJson from '@generated/paper-metrics.json'

import type {
  CapabilityRef,
  CatalogTopic,
  PaperEditorialMap,
  TopicEditorialSeed,
} from '@/types/tracker'

export type CatalogEntry = {
  title: string
  summary: string
  published: string
  authors: string[]
  arxivUrl?: string
  pdfUrl?: string
}

type MetricsEntry = { citationCount: number | null; source: string; retrievedAt: string }
type AssetsEntry = {
  coverPath: string | null
  coverSource?: string | null
  figurePaths: string[]
}
type PaperCatalogCollection = { version: string; papers: Record<string, CatalogEntry> }
type PaperAssetsCollection = { version: string; papers: Record<string, AssetsEntry> }
type PaperMetricsCollection = { version: string; metrics: Record<string, MetricsEntry> }
type CapabilityLibraryCollection = {
  version: string
  capabilities: Array<{ id: string; name: string; description?: string }>
}
type TopicCatalogSeed = Omit<CatalogTopic, 'focusLabel'> & { focusLabel?: string }
type TopicCatalogCollection = { topics: TopicCatalogSeed[] }
type RawTopicMemory = Record<string, Record<string, unknown>>

export const catalogRecord = (
  (paperCatalogJson as unknown as PaperCatalogCollection).papers ?? {}
) as Record<string, CatalogEntry>

export const metricsRecord = (
  (paperMetricsJson as unknown as PaperMetricsCollection).metrics ?? {}
) as Record<string, MetricsEntry>

export const assetsRecord = (
  (paperAssetsJson as unknown as PaperAssetsCollection).papers ?? {}
) as Record<string, AssetsEntry>

export const capabilityLibrary = (
  (capabilityLibraryJson as unknown as CapabilityLibraryCollection).capabilities ?? []
).map((capability) => ({
  id: capability.id,
  name: capability.name,
  definition: capability.description ?? capability.name,
  mechanism: capability.description ?? capability.name,
  applicabilitySignals: [],
  antiSignals: [],
  typicalTradeoffs: [],
  relatedCapabilities: [],
})) as CapabilityRef[]

export const capabilityMap = Object.fromEntries(
  capabilityLibrary.map((item) => [item.id, item]),
) as Record<string, CapabilityRef>

export const topicCatalog = ((topicCatalogJson as TopicCatalogCollection).topics ?? []).map((seed) => ({
  ...seed,
  focusLabel: seed.focusLabel ?? '',
})) satisfies CatalogTopic[]

export const rawTopicMemory = (
  (topicMemoryJson as unknown as { version: string; topics: RawTopicMemory }).topics ?? {}
) as RawTopicMemory

// Editorial runtime artifacts now live on the backend canonical path and may be absent between runs.
// We expose explicit empty collections here instead of relying on placeholder frontend-generated files.
export const runtimePaperEditorial: PaperEditorialMap = {}
export const runtimeTopicEditorial: TopicEditorialSeed[] = []
