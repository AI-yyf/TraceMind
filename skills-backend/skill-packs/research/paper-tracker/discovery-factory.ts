/**
 * 发现引擎工厂
 * 创建配置好的发现引擎，整合 ArXiv 和 OpenAlex 搜索提供者
 */

import { DiscoveryEngine } from './discovery-engine'
import { createArxivSearchProvider } from './providers/arxiv-provider'
import { createOpenAlexSearchProvider } from './providers/openalex-provider'
import type { SystemConfig } from '../../../shared/config'

export interface LLMClient {
  generate: (params: {
    prompt: string
    temperature: number
    maxTokens: number
  }) => Promise<{ text: string }>
}

/**
 * 创建默认搜索提供者
 */
export function createDefaultSearchProviders() {
  return [
    createArxivSearchProvider(),
    createOpenAlexSearchProvider(),
  ]
}

/**
 * 创建发现引擎实例
 */
export function createDiscoveryEngineInstance(
  config: SystemConfig,
  llmClient: LLMClient,
  providers = createDefaultSearchProviders()
): DiscoveryEngine {
  return new DiscoveryEngine(config, llmClient, providers)
}

/**
 * 直接执行论文发现（简化用法）
 */
export async function discoverPapers(
  stageContext: {
    topicId: string
    stageIndex: number
    windowStart: string
    windowEnd: string
    windowMonths: number
    sourceProblemNodeIds: string[]
    sourceBranchIds: string[]
    decisionSignals: Array<{ type: string; description: string }>
    capabilityContext: {
      availableCapabilities: string[]
      gapCapabilities: string[]
    }
  },
  llmClient: LLMClient,
  options?: {
    maxCandidates?: number
    enableRound2?: boolean
  }
): Promise<{
  paperId: string
  title: string
  abstract: string
  published: string
  authors: string[]
  confidence: number
  source: string
}[]> {
  const config: SystemConfig = {
    discovery: {
      enableRound2: options?.enableRound2 ?? true,
      minConfidenceThreshold: 0.3,
      minCandidatesThreshold: 5,
      maxCandidatesPerRound: 20,
      defaultWindowMonths: [2, 4, 6, 8, 12],
    },
  } as SystemConfig

  const engine = createDiscoveryEngineInstance(config, llmClient)

  const result = await engine.discover(stageContext as any)

  return result.candidates.slice(0, options?.maxCandidates ?? 20).map(c => ({
    paperId: c.paperId,
    title: c.title,
    abstract: c.abstract,
    published: c.published,
    authors: c.authors,
    confidence: c.confidence,
    source: c.discoveryChannels[0] || 'unknown',
  }))
}
