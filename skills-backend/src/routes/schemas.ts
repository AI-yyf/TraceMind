import { z } from 'zod'

import { RESEARCH_ROLE_IDS, allTaskRouteTargets } from '../services/omni/routing'

// Validation wrapper helper - wrap body schemas for validate middleware
const bodySchema = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ body: z.object(shape) })

const MAX_MULTI_TOPIC_RESEARCH_TOPICS = 5

// Config schemas
export const UpdateConfigSchema = bodySchema({
  value: z.unknown(),
})

// Chat schemas
const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().optional(),
  attachments: z.array(z.object({
    type: z.enum(['image', 'pdf', 'file']),
    url: z.string().optional(),
    base64: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
  })).optional(),
})

export const ChatCompleteSchema = bodySchema({
  messages: z.array(ChatMessageSchema).min(1, 'messages must contain at least one message'),
  topicId: z.string().optional(),
  task: z.enum([
    'general_chat',
    'topic_chat',
    'topic_chat_vision',
  ]).optional(),
  attachments: z.array(z.object({
    type: z.enum(['image', 'pdf', 'file']),
    url: z.string().optional(),
    base64: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
  })).optional(),
  userId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
})

// Topic schemas
export const CreateTopicSchema = bodySchema({
  nameZh: z.string().min(1, 'nameZh is required'),
  nameEn: z.string().optional(),
  focusLabel: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
})

export const UpdateTopicSchema = bodySchema({
  nameZh: z.string().optional(),
  nameEn: z.string().optional(),
  focusLabel: z.string().optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'archived', 'draft']).optional(),
})

// Node schemas
export const CreateNodeSchema = bodySchema({
  topicId: z.string().uuid('topicId must be a valid UUID'),
  stageIndex: z.number().int().optional(),
  nodeLabel: z.string().optional(),
  nodeSubtitle: z.string().optional(),
  nodeSummary: z.string().optional(),
  nodeExplanation: z.string().optional(),
  nodeCoverImage: z.string().nullable().optional(),
  paperIds: z.array(z.string().uuid()).min(1, 'paperIds must contain at least one paper'),
  primaryPaperId: z.string().uuid().optional(),
  isMergeNode: z.boolean().optional(),
  fullContent: z.unknown().optional(),
})

export const UpdateNodeSchema = bodySchema({
  nodeLabel: z.string().optional(),
  nodeSubtitle: z.string().optional(),
  nodeSummary: z.string().optional(),
  nodeExplanation: z.string().optional(),
  nodeCoverImage: z.string().nullable().optional(),
  stageIndex: z.number().int().optional(),
  status: z.enum(['canonical', 'provisional', 'deprecated']).optional(),
  fullContent: z.unknown().optional(),
})

// Paper schemas
export const CreatePaperSchema = bodySchema({
  topicId: z.string().uuid().optional(),
  title: z.string().min(1, 'title is required'),
  titleZh: z.string().optional(),
  titleEn: z.string().optional(),
  authors: z.array(z.string()).optional(),
  published: z.string().or(z.date()).optional(),
  summary: z.string().optional(),
  explanation: z.string().optional(),
  arxivUrl: z.string().url().optional().or(z.literal('')),
  pdfUrl: z.string().url().optional().or(z.literal('')),
  pdfPath: z.string().optional(),
  citationCount: z.number().int().optional(),
  coverPath: z.string().optional(),
  figurePaths: z.array(z.string()).optional(),
  tablePaths: z.array(z.string()).optional(),
  status: z.enum(['candidate', 'canonical', 'rejected']).optional(),
  tags: z.array(z.string()).optional(),
  contentMode: z.enum(['editorial', 'raw']).optional(),
})

// Sync schema
export const SyncDataSchema = bodySchema({
  topics: z.array(z.object({
    id: z.string().uuid(),
    nameZh: z.string().optional(),
    nameEn: z.string().optional(),
    focusLabel: z.string().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'archived', 'draft']).optional(),
  })).optional(),
  papers: z.array(z.object({
    id: z.string().uuid(),
    topicId: z.string().uuid().optional(),
    title: z.string().optional(),
    titleZh: z.string().optional(),
    titleEn: z.string().optional(),
    authors: z.array(z.string()).optional(),
    published: z.string().optional(),
    summary: z.string().optional(),
    explanation: z.string().optional(),
    arxivUrl: z.string().url().optional().or(z.literal('')),
    pdfUrl: z.string().url().optional().or(z.literal('')),
    pdfPath: z.string().optional(),
    citationCount: z.number().int().optional(),
    coverPath: z.string().optional(),
    figurePaths: z.array(z.string()).optional(),
    tablePaths: z.array(z.string()).optional(),
    status: z.enum(['candidate', 'canonical', 'rejected']).optional(),
    tags: z.array(z.string()).optional(),
    contentMode: z.enum(['editorial', 'raw']).optional(),
  })).optional(),
  nodes: z.array(z.object({
    nodeId: z.string().uuid(),
    topicId: z.string().uuid(),
    stageIndex: z.number().int().optional(),
    nodeLabel: z.string().optional(),
    nodeSubtitle: z.string().optional(),
    nodeSummary: z.string().optional(),
    nodeExplanation: z.string().optional(),
    nodeCoverImage: z.string().optional(),
    primaryPaperId: z.string().uuid().optional(),
    isMergeNode: z.boolean().optional(),
    provisional: z.boolean().optional(),
    status: z.enum(['canonical', 'provisional', 'deprecated']).optional(),
    fullContent: z.unknown().optional(),
  })).optional(),
})

// Omni complete request schema
const OmniMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().optional(),
  attachments: z.array(z.object({
    type: z.enum(['image', 'pdf', 'file']),
    url: z.string().optional(),
    base64: z.string().optional(),
    mimeType: z.string().optional(),
    filename: z.string().optional(),
  })).optional(),
})

export const OmniCompleteSchema = bodySchema({
  task: z.enum([
    'general_chat',
    'topic_chat',
    'topic_chat_vision',
    'topic_summary',
    'document_parse',
    'figure_analysis',
    'formula_recognition',
    'table_extraction',
    'evidence_explainer',
  ]).optional(),
  messages: z.array(OmniMessageSchema).min(1, 'messages must contain at least one message'),
  json: z.boolean().optional(),
  stream: z.boolean().optional(),
  modelOverride: z.string().optional(),
  slotOverride: z.enum(['language', 'multimodal']).optional(),
  roleOverride: z.string().optional(),
  userId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
})

// Research session schemas
export const CreateResearchSessionSchema = z.object({
  body: z.object({
    topicIds: z
      .array(z.string().trim().min(1))
      .min(1, 'topicIds must contain at least one topic ID')
      .max(MAX_MULTI_TOPIC_RESEARCH_TOPICS, `topicIds must contain at most ${MAX_MULTI_TOPIC_RESEARCH_TOPICS} topic IDs`),
    mode: z.literal('full').optional(),
    durationHours: z.number().min(1).max(24 * 365).optional(),
    stageDurationDays: z.number().min(7).max(365).optional(),
  }).strict(),
})

// PDF extraction schemas
export const PdfExtractFromUrlSchema = bodySchema({
  paperId: z.string().min(1, 'paperId is required'),
  paperTitle: z.string().optional(),
  pdfUrl: z.string().url('pdfUrl must be a valid URL'),
})

// Zotero config schemas
export const ZoteroConfigSchema = bodySchema({
  userId: z.string().min(1, 'userId is required'),
  apiKey: z.string().min(1, 'apiKey is required'),
  username: z.string().optional(),
  enabled: z.boolean().optional(),
})

export const ZoteroTestSchema = bodySchema({
  userId: z.string().min(1, 'userId is required'),
  apiKey: z.string().min(1, 'apiKey is required'),
})

export const ZoteroExportTopicSchema = bodySchema({
  collectionName: z.string().optional(),
  collectionKey: z.string().optional(),
  paperIds: z.array(z.string().uuid()).optional(),
})

export const ZoteroExportNodeSchema = bodySchema({
  collectionName: z.string().optional(),
  collectionKey: z.string().optional(),
})

export const ZoteroExportPapersSchema = bodySchema({
  paperIds: z.array(z.string().uuid()).min(1, 'paperIds must contain at least one paper'),
  collectionName: z.string().optional(),
  collectionKey: z.string().optional(),
})

// Topic alpha schemas
export const TopicExportBundlesSchema = bodySchema({
  topicIds: z.array(z.string()).min(1, 'topicIds must contain at least one topic'),
})

const TopicChatWorkbenchMaterialSchema = z.object({
  id: z.string().trim().min(1).max(120),
  kind: z.enum(['image', 'pdf', 'text']),
  name: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(600),
  highlights: z.array(z.string().trim().min(1).max(180)).max(6).optional(),
  status: z.enum(['parsing', 'ready', 'vision-only', 'error']).optional(),
}).strict()

const TopicChatAttachmentSchema = z.object({
  type: z.enum(['image', 'pdf', 'file']),
  url: z.string().trim().url().max(2000).optional(),
  base64: z.string().trim().min(1).max(9_000_000).optional(),
  mimeType: z.string().trim().min(1).max(120).optional(),
  filename: z.string().trim().min(1).max(260).optional(),
})
  .strict()
  .refine((value) => Boolean(value.url || value.base64), {
    message: 'attachments must include a url or base64 payload',
  })

const TopicChatWorkbenchSchema = z.object({
  controls: z.object({
    responseStyle: z.enum(['brief', 'balanced', 'deep']).optional(),
    reasoningEnabled: z.boolean().optional(),
    retrievalEnabled: z.boolean().optional(),
  }).strict().optional(),
  contextItems: z.array(z.string().trim().min(1).max(180)).max(8).optional(),
  agentBrief: z.string().trim().min(1).max(600).optional(),
  materials: z.array(TopicChatWorkbenchMaterialSchema).max(4).optional(),
}).strict().optional()

export const TopicChatSchema = bodySchema({
  question: z.string().trim().min(1, 'question is required').max(4000),
  attachments: z.array(TopicChatAttachmentSchema).max(4).optional(),
  workbench: TopicChatWorkbenchSchema,
})

export const TopicResearchSessionSchema = bodySchema({
  durationHours: z.number().min(1).max(24 * 365).optional(),
  stageDurationDays: z.number().min(7).max(365).optional(),
})

export const MultiTopicResearchSessionSchema = bodySchema({
  topicIds: z
    .array(z.string().trim().min(1))
    .min(1, 'topicIds must contain at least one topic ID')
    .max(MAX_MULTI_TOPIC_RESEARCH_TOPICS, `topicIds must contain at most ${MAX_MULTI_TOPIC_RESEARCH_TOPICS} topic IDs`),
  durationHours: z.number().min(1).max(24 * 365).optional(),
  stageDurationDays: z.number().min(7).max(365).optional(),
})

// Task schemas (for validate middleware)
export const TaskConfigBodySchema = bodySchema({
  id: z.string().min(1),
  name: z.string().min(1),
  cronExpression: z.string().min(1),
  enabled: z.boolean(),
  topicId: z.string().optional(),
  action: z.enum(['discover', 'refresh', 'sync']),
  researchMode: z.enum(['stage-rounds', 'duration']).optional(),
  options: z.object({
    maxResults: z.number().optional(),
    stageIndex: z.number().optional(),
    maxIterations: z.number().int().min(1).optional(),
    stageDurationDays: z.number().int().min(1).max(365).optional(),
    durationHours: z.number().min(1).max(24 * 365).optional(),
    cycleDelayMs: z.number().int().min(250).max(15000).optional(),
    stageRounds: z.array(z.object({
      stageIndex: z.number().int().min(1),
      rounds: z.number().int().min(1).max(12),
    })).optional(),
  }).optional(),
})

export const TaskToggleSchema = bodySchema({
  enabled: z.boolean(),
})

export const TaskRunSchema = bodySchema({
  forceStage: z.number().int().min(1).optional(),
  mode: z.enum(['full', 'discover-only', 'duration']).optional(),
})

export const TaskJumpSchema = bodySchema({
  stageIndex: z.number().int().min(1),
})

// Model config schema (for validate middleware)
const providerSchema = z.enum([
  'nvidia',
  'openai_compatible',
  'openai',
  'anthropic',
  'google',
  'dashscope',
  'bigmodel',
  'ark',
  'hunyuan',
  'deepseek',
])

const slotOptionsSchema = z.object({
  thinking: z.enum(['on', 'off', 'auto']).optional(),
  citations: z.enum(['native', 'backend']).optional(),
  parser: z.enum(['native', 'backend']).optional(),
  temperature: z.number().finite().optional(),
  maxTokens: z.number().int().positive().optional(),
}).optional()

const slotConfigSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKeyRef: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  providerOptions: z.record(z.unknown()).optional(),
  options: slotOptionsSchema,
}).nullable().optional()

const taskSchema = z.enum([
  'general_chat',
  'topic_chat',
  'topic_chat_vision',
  'topic_summary',
  'document_parse',
  'figure_analysis',
  'formula_recognition',
  'table_extraction',
  'evidence_explainer',
])

const slotRefSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1),
})

const researchRoleSchema = z.enum(RESEARCH_ROLE_IDS as [string, ...string[]])

const taskRouteTargetSchema = z.enum(allTaskRouteTargets() as [string, ...string[]])

export const ModelConfigBodySchema = bodySchema({
  language: slotConfigSchema,
  multimodal: slotConfigSchema,
  roles: z.record(researchRoleSchema, slotConfigSchema).optional(),
  taskOverrides: z.record(taskSchema, slotRefSchema).optional(),
  taskRouting: z.record(taskSchema, taskRouteTargetSchema).optional(),
}).extend({
  body: z.object({
    language: slotConfigSchema,
    multimodal: slotConfigSchema,
    roles: z.record(researchRoleSchema, slotConfigSchema).optional(),
    taskOverrides: z.record(taskSchema, slotRefSchema).optional(),
    taskRouting: z.record(taskSchema, taskRouteTargetSchema).optional(),
  }).strict(),
})

// Prompt templates schemas (for validate middleware)
const promptLanguageSchema = z.enum(['zh', 'en', 'ja', 'ko', 'de', 'fr', 'es', 'ru'])

const promptIdSchema = z.string()

const productCopyIdSchema = z.string()

const externalAgentAssetIdSchema = z.enum(['readme', 'promptGuide', 'superPrompt', 'configExample'])

const promptLanguageContentSchema = z.object({
  system: z.string().optional(),
  user: z.string().optional(),
  notes: z.string().optional(),
}).strict()

const promptPatchBodySchema = z.object({
  id: promptIdSchema,
  languageContents: z.record(promptLanguageSchema, promptLanguageContentSchema).default({}),
}).strict()

export const PromptPatchSchema = z.object({
  body: promptPatchBodySchema,
})

const productCopyPatchBodySchema = z.object({
  id: productCopyIdSchema,
  languageContents: z.record(promptLanguageSchema, z.string()).default({}),
}).strict()

export const ProductCopyPatchSchema = z.object({
  body: productCopyPatchBodySchema,
})

const promptStudioSaveBodySchema = z.object({
  templates: z.array(promptPatchBodySchema).optional(),
  productCopies: z.array(productCopyPatchBodySchema).optional(),
  externalAgentAssets: z.array(z.object({
    id: externalAgentAssetIdSchema,
    content: z.string().min(1),
  }).strict()).optional(),
  runtime: z.object({
    defaultLanguage: promptLanguageSchema.optional(),
    unlimitedMemoryMode: z.boolean().optional(),
    cacheGeneratedOutputs: z.boolean().optional(),
    contextAwareCacheReuse: z.boolean().optional(),
    staleContextRefinePasses: z.number().int().optional(),
    useTopicMemory: z.boolean().optional(),
    usePreviousPassOutputs: z.boolean().optional(),
    preferMultimodalEvidence: z.boolean().optional(),
    maxRetriesPerPass: z.number().int().optional(),
    topicPreviewPasses: z.number().int().optional(),
    topicBlueprintPasses: z.number().int().optional(),
    topicLocalizationPasses: z.number().int().optional(),
    topicChatPasses: z.number().int().optional(),
    stageNamingPasses: z.number().int().optional(),
    nodeArticlePasses: z.number().int().optional(),
    paperArticlePasses: z.number().int().optional(),
    selfRefinePasses: z.number().int().optional(),
    researchOrchestrationPasses: z.number().int().optional(),
    researchReportPasses: z.number().int().optional(),
    researchCycleDelayMs: z.number().int().optional(),
    researchStageStallLimit: z.number().int().optional(),
    researchStagePaperLimit: z.number().int().optional(),
    researchArtifactRebuildLimit: z.number().int().optional(),
    nodeCardFigureCandidateLimit: z.number().int().optional(),
    topicSessionMemoryEnabled: z.boolean().optional(),
    topicSessionMemoryInitEventCount: z.number().int().optional(),
    topicSessionMemoryChatTurnsBetweenCompaction: z.number().int().optional(),
    topicSessionMemoryResearchCyclesBetweenCompaction: z.number().int().optional(),
    topicSessionMemoryTokenThreshold: z.number().int().optional(),
    topicSessionMemoryRecentEventLimit: z.number().int().optional(),
    topicSessionMemoryRecallEnabled: z.boolean().optional(),
    topicSessionMemoryRecallLimit: z.number().int().optional(),
    topicSessionMemoryRecallLookbackLimit: z.number().int().optional(),
    topicSessionMemoryRecallRecencyBias: z.number().optional(),
    languageTemperature: z.number().optional(),
    multimodalTemperature: z.number().optional(),
    maxEvidencePerArticle: z.number().int().optional(),
    contextWindowStages: z.number().int().optional(),
    contextWindowNodes: z.number().int().optional(),
    editorialPolicies: z.record(promptLanguageSchema, z.object({
      identity: z.string().optional(),
      mission: z.string().optional(),
      reasoning: z.string().optional(),
      style: z.string().optional(),
      evidence: z.string().optional(),
      industryLens: z.string().optional(),
      continuity: z.string().optional(),
      refinement: z.string().optional(),
    }).strict()).optional(),
  }).strict().optional(),
}).strict()

export const PromptStudioSaveSchema = z.object({
  body: promptStudioSaveBodySchema,
})

const promptStudioResetBodySchema = z.object({
  templateId: promptIdSchema.optional(),
  productCopyId: productCopyIdSchema.optional(),
  language: promptLanguageSchema.optional(),
  runtime: z.boolean().optional(),
}).strict()

export const PromptStudioResetSchema = z.object({
  body: promptStudioResetBodySchema,
})
