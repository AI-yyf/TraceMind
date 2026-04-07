import type { SkillAttachment } from '../../../engine/contracts'

export interface PaperTrackerInput {
  topicId: string
  branchId?: string
  stageIndex?: number
  problemNodeId?: string
  stageMode?: 'next-stage'
  discoverySource?: 'external-only'
  recalibrate?: boolean
  providerId?: 'openai-compatible' | 'anthropic'
  model?: string
  temperature?: number
  maxTokens?: number
  windowPolicy?: 'auto' | 'fixed' | 'hybrid-auto-5m'
  allowMerge?: boolean
  windowMonths?: number
  maxCandidates?: number
  mode?: 'dry-run' | 'inspect' | 'commit'
  storageMode?: 'canonical-only' | 'debug' | 'dry-run'
  agentTarget?: 'codex' | 'claude-code' | 'generic'
  attachments?: SkillAttachment[]
}

export interface PaperTrackerCandidate {
  paperId: string
  title: string
  published: string
  authors: string[]
  candidateType: 'direct' | 'branch' | 'transfer'
  confidence: number
  status: string
  why: string
  derivedFromProblemIds: string[]
  supportedCapabilityIds: string[]
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  branchAction?: 'stay' | 'split' | 'merge' | 'watch' | 'no-candidate'
  stageBucket?: 'current-stage' | 'next-stage'
  branchIds?: string[]
  mergeTargetBranchIds?: string[]
  memorySignal?: string
  historyHits?: number
  queryHits?: string[]
  discoveryChannels?: string[]
  discoveryRounds?: number[]
}

export interface PaperTrackerNode {
  nodeId: string
  stageIndex: number
  paperIds: string[]
  primaryPaperId: string
  sourceBranchIds: string[]
  sourceProblemNodeIds: string[]
  status: 'selected' | 'committed' | 'provisional' | 'merged'
  nodeLabel: string
  nodeSummary: string
  isMergeNode: boolean
  provisional: boolean
}

export interface PaperTrackerBranchOutcome {
  branchId: string
  stageIndex: number
  action: 'stay' | 'split' | 'merge' | 'watch' | 'no-candidate'
  selectedNodeId: string | null
  selectedPaperIds: string[]
  mergeTargetBranchIds: string[]
  summary: string
}

export interface PaperTrackerDiscoveryRound {
  round: 1 | 2
  summary: string
  queries: Array<{
    query: string
    rationale: string
    focus: 'problem' | 'method' | 'citation' | 'merge'
    targetProblemIds: string[]
    targetBranchIds?: string[]
  }>
  candidatePaperIds: string[]
}
