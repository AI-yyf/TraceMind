import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, AppError } from '../middleware/errorHandler'
import {
  EXTERNAL_AGENT_ASSET_IDS,
  exportPromptStudioBundle,
  getBuiltInPromptDefinitions,
  getBuiltInProductCopyDefinitions,
  getGenerationRuntimeConfig,
  getGenerationRuntimeConfigRecord,
  getPromptStudioBundle,
  getProductCopy,
  getPromptTemplate,
  listPromptLanguages,
  listProductCopies,
  listPromptTemplates,
  PROMPT_LANGUAGES,
  PRODUCT_COPY_IDS,
  PROMPT_TEMPLATE_IDS,
  resetPromptStudio,
  saveProductCopyPatch,
  savePromptStudioBundle,
  savePromptTemplatePatch,
  type ExternalAgentAssetId,
  type PromptLanguage,
  type ProductCopyId,
  type PromptTemplateId,
} from '../services/generation/prompt-registry'
import { buildExternalAgentJobPackage } from '../services/external-agents/job-builder'

const router = Router()

const promptIdSet = new Set(Object.values(PROMPT_TEMPLATE_IDS))
const productCopyIdSet = new Set(Object.values(PRODUCT_COPY_IDS))
const externalAgentAssetIdSet = new Set(Object.values(EXTERNAL_AGENT_ASSET_IDS))
const languageSet = new Set(PROMPT_LANGUAGES.map((item) => item.code))

const languageSchema = z.string().refine(
  (value): value is PromptLanguage => languageSet.has(value as PromptLanguage),
  'Unsupported language.',
)

const promptIdSchema = z.string().refine(
  (value): value is PromptTemplateId => promptIdSet.has(value as PromptTemplateId),
  'Unsupported prompt template id.',
)

const productCopyIdSchema = z.string().refine(
  (value): value is ProductCopyId => productCopyIdSet.has(value as ProductCopyId),
  'Unsupported product copy id.',
)

const externalAgentAssetIdSchema = z.custom<ExternalAgentAssetId>(
  (value) =>
    typeof value === 'string' &&
    externalAgentAssetIdSet.has(value as ExternalAgentAssetId),
  'Unsupported external agent asset id.',
)

const patchSchema = z.object({
  id: promptIdSchema,
  languageContents: z
    .record(
      languageSchema,
      z.object({
        system: z.string().optional(),
        user: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .default({}),
})

const productCopyPatchSchema = z.object({
  id: productCopyIdSchema,
  languageContents: z.record(languageSchema, z.string()).default({}),
})

const externalAgentAssetPatchSchema = z.object({
  id: externalAgentAssetIdSchema,
  content: z.string().min(1),
})

const externalAgentJobSchema = z
  .object({
    templateId: promptIdSchema,
    language: languageSchema.optional(),
    topicId: z.string().trim().min(1).optional(),
    subjectType: z.enum(['generic', 'topic', 'node', 'paper']).default('generic'),
    subjectId: z.string().trim().min(1).optional(),
    input: z.unknown().optional(),
    memoryContext: z.unknown().optional(),
    outputContract: z.unknown().optional(),
    persist: z.boolean().optional(),
    fileName: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.subjectType === 'topic' && !value.subjectId && !value.topicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Topic subject requires topicId or subjectId.',
        path: ['topicId'],
      })
    }

    if ((value.subjectType === 'node' || value.subjectType === 'paper') && !value.subjectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.subjectType} subject requires subjectId.`,
        path: ['subjectId'],
      })
    }
  })

const runtimeSchema = z.object({
  defaultLanguage: languageSchema.optional(),
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
  editorialPolicies: z
    .record(
      languageSchema,
      z.object({
        identity: z.string().optional(),
        mission: z.string().optional(),
        reasoning: z.string().optional(),
        style: z.string().optional(),
        evidence: z.string().optional(),
        industryLens: z.string().optional(),
        continuity: z.string().optional(),
        refinement: z.string().optional(),
      }),
    )
    .optional(),
})

const studioSaveSchema = z.object({
  templates: z.array(patchSchema).optional(),
  productCopies: z.array(productCopyPatchSchema).optional(),
  externalAgentAssets: z.array(externalAgentAssetPatchSchema).optional(),
  runtime: runtimeSchema.optional(),
})

const studioResetSchema = z.object({
  templateId: promptIdSchema.optional(),
  productCopyId: productCopyIdSchema.optional(),
  language: languageSchema.optional(),
  runtime: z.boolean().optional(),
})

router.get(
  '/languages',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: listPromptLanguages(),
    })
  }),
)

router.get(
  '/studio',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await getPromptStudioBundle(),
    })
  }),
)

router.get(
  '/runtime',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await getGenerationRuntimeConfig(),
    })
  }),
)

router.get(
  '/runtime-record',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await getGenerationRuntimeConfigRecord(),
    })
  }),
)

router.post(
  '/studio',
  asyncHandler(async (req, res) => {
    const payload = studioSaveSchema.parse(req.body)
    res.json({
      success: true,
      data: await savePromptStudioBundle(payload),
    })
  }),
)

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    const payload = studioResetSchema.parse(req.body)
    res.json({
      success: true,
      data: await resetPromptStudio(payload),
    })
  }),
)

router.get(
  '/export',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await exportPromptStudioBundle(),
    })
  }),
)

router.post(
  '/external-agents/job',
  asyncHandler(async (req, res) => {
    const payload = externalAgentJobSchema.parse(req.body)
    res.json({
      success: true,
      data: await buildExternalAgentJobPackage(payload),
    })
  }),
)

router.post(
  '/import',
  asyncHandler(async (req, res) => {
    const payload = studioSaveSchema.parse(req.body)
    res.json({
      success: true,
      data: await savePromptStudioBundle(payload),
    })
  }),
)

router.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await listPromptTemplates(),
    })
  }),
)

router.get(
  '/templates/defaults',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: getBuiltInPromptDefinitions(),
    })
  }),
)

router.get(
  '/copies',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: await listProductCopies(),
    })
  }),
)

router.get(
  '/copies/defaults',
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: getBuiltInProductCopyDefinitions(),
    })
  }),
)

router.get(
  '/copies/:id',
  asyncHandler(async (req, res) => {
    const id = productCopyIdSchema.parse(req.params.id)
    res.json({
      success: true,
      data: await getProductCopy(id),
    })
  }),
)

router.post(
  '/copies',
  asyncHandler(async (req, res) => {
    const payload = productCopyPatchSchema.parse(req.body)
    res.json({
      success: true,
      data: await saveProductCopyPatch(payload),
    })
  }),
)

router.get(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const id = promptIdSchema.parse(req.params.id)
    res.json({
      success: true,
      data: await getPromptTemplate(id),
    })
  }),
)

router.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const payload = patchSchema.parse(req.body)
    res.json({
      success: true,
      data: await savePromptTemplatePatch(payload),
    })
  }),
)

router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const id = promptIdSchema.parse(req.params.id)
    res.json({
      success: true,
      data: await resetPromptStudio({ templateId: id }),
    })
  }),
)

router.post(
  '/templates/reset/:language',
  asyncHandler(async (req, res) => {
    const language = languageSchema.parse(req.params.language)
    res.json({
      success: true,
      data: await resetPromptStudio({ language, runtime: false }),
    })
  }),
)

router.use((error: unknown, _req: unknown, _res: unknown, next: (error: unknown) => void) => {
  if (error instanceof z.ZodError) {
    return next(new AppError(400, error.issues.map((item) => item.message).join(' ')))
  }
  return next(error)
})

export default router
