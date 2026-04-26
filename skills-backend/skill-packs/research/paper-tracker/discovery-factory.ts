/**
 * 发现引擎工厂
 * 创建配置好的发现引擎，整合 ArXiv 和 OpenAlex 搜索提供者
 */

import { DiscoveryEngine } from './discovery-engine'
import { createArxivSearchProvider } from './providers/arxiv-provider'
import { createOpenAlexSearchProvider } from './providers/openalex-provider'
import type { SystemConfig } from '../../../shared/config'
import type { StageContext, CapabilityContext } from '../../../shared/stage-context'

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
 * 构建简化的 StageContext 用于直接发现
 */
function buildSimpleStageContext(
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
  }
): StageContext {
  const capabilityContext: CapabilityContext = {
    availableCapabilities: stageContext.capabilityContext.availableCapabilities,
    requiredCapabilities: [],
    gapCapabilities: stageContext.capabilityContext.gapCapabilities,
  }

  return {
    contextId: `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    topicId: stageContext.topicId,
    stageIndex: stageContext.stageIndex,
    sourceBranchIds: stageContext.sourceBranchIds,
    sourceProblemNodeIds: stageContext.sourceProblemNodeIds,
    sourceAnchorPaperIds: [],
    sourceNodeIds: stageContext.sourceProblemNodeIds,
    windowStart: stageContext.windowStart,
    windowEnd: stageContext.windowEnd,
    windowMonths: stageContext.windowMonths,
    decisionSignals: stageContext.decisionSignals.map((signal) => ({
      type: signal.type as StageContext['decisionSignals'][number]['type'],
      source: stageContext.topicId,
      description: signal.description,
      confidence: 0.5,
      timestamp: new Date().toISOString(),
    })),
    timelineContext: {
      previousNodes: [],
      originPaper: { paperId: '', published: stageContext.windowStart },
      stageBoundaries: [],
    },
    capabilityContext,
    createdAt: new Date().toISOString(),
  }
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
  const maxCandidatesPerRound = options?.maxCandidates ?? 200
  const config: SystemConfig = {
    discovery: {
      enableRound2: options?.enableRound2 ?? true,
      minConfidenceThreshold: 0.3,
      minCandidatesThreshold: 5,
      maxCandidatesPerRound: Math.min(maxCandidatesPerRound, 200),
      defaultWindowMonths: [2, 4, 6, 8, 12],
      maxRounds: 2,
    },
    nodeMerge: {
      maxPapersPerNode: 20,
      maxTimeSpanMonths: 12,
      enableCrossBranchMerge: true,
      enableSameBranchMerge: true,
      confidenceThreshold: 0.7,
    },
    contentGen: {
      minWordCount: 2000,
      maxWordCount: 3000,
      enableMultimodal: true,
      coverageThreshold: 0.8,
      maxRetryAttempts: 3,
    },
    display: {
      maxNodesPerStage: 20,
      maxPapersPerNode: 20,
      enableLazyLoad: true,
      cacheExpiryMinutes: 60,
    },
    multimodal: {
      models: [],
      taskMapping: {
        figureAnalysis: '',
        contentGeneration: '',
        formulaRecognition: '',
        ocr: '',
        tableExtraction: '',
      },
      fallbackStrategy: { enabled: false, retryCount: 0 },
    },
  }

  const engine = createDiscoveryEngineInstance(config, llmClient)

  const fullStageContext = buildSimpleStageContext(stageContext)
  const result = await engine.discover(fullStageContext)

  return result.candidates.slice(0, maxCandidatesPerRound).map(c => ({
    paperId: c.paperId,
    title: c.title,
    abstract: c.abstract,
    published: c.published,
    authors: c.authors,
    confidence: c.confidence,
    source: c.discoveryChannels[0] || 'unknown',
  }))
}
