import type { SkillAttachment } from '../../../engine/contracts'

export interface ContentGenesisInput {
  paperId: string
  topicId: string
  branchId?: string
  stageIndex?: number
  problemNodeIds?: string[]
  citeIntent?: 'supporting' | 'contrasting' | 'method-using' | 'background'
  providerId?: 'openai-compatible' | 'anthropic'
  model?: string
  temperature?: number
  maxTokens?: number
  coverageStrict?: boolean
  contentMode?: 'editorial' | 'summary'
  storageMode?: 'canonical-only' | 'debug' | 'dry-run'
  attachments?: SkillAttachment[]
}
