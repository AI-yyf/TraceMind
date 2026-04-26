import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler, AppError } from '../middleware/errorHandler'
import { validate } from '../middleware/requestValidator'
import {
  PromptPatchSchema,
  ProductCopyPatchSchema,
  PromptStudioSaveSchema,
  PromptStudioResetSchema,
} from './schemas'
import {
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
  type PromptLanguage,
  type ProductCopyId,
  type PromptTemplateId,
  type PromptStudioBundle,
  type GenerationRuntimeConfig,
} from '../services/generation/prompt-registry'
import {
  buildExternalAgentJobPackage,
  type ExternalAgentJobPackage,
} from '../services/external-agents/job-builder'

const router = Router()

function enforceRouteContract<T>(
  value: T,
  validator: (payload: unknown) => void,
  context: string,
) {
  try {
    validator(value)
    return value
  } catch (error) {
    throw new AppError(
      500,
      `${context} ${error instanceof Error ? error.message : 'Unknown contract validation failure.'}`,
    )
  }
}

function assertContract(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  assertContract(isRecord(value), message)
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  assertContract(Array.isArray(value), message)
}

function assertString(
  value: unknown,
  message: string,
  options: { allowEmpty?: boolean } = {},
): asserts value is string {
  assertContract(typeof value === 'string', message)
  if (!options.allowEmpty) {
    assertContract(value.trim().length > 0, message)
  }
}

function assertBoolean(value: unknown, message: string): asserts value is boolean {
  assertContract(typeof value === 'boolean', message)
}

function assertNumber(
  value: unknown,
  message: string,
  options: { integer?: boolean; min?: number } = {},
): asserts value is number {
  assertContract(typeof value === 'number' && Number.isFinite(value), message)
  if (options.integer) {
    assertContract(Number.isInteger(value), message)
  }
  if (typeof options.min === 'number') {
    assertContract(value >= options.min, message)
  }
}

function assertOneOf<const TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
  message: string,
): asserts value is TAllowed[number] {
  assertString(value, message)
  assertContract(allowed.includes(value as TAllowed[number]), message)
}

function assertOptionalString(
  value: unknown,
  message: string,
  options: { allowEmpty?: boolean } = {},
) {
  if (value == null) return
  assertString(value, message, options)
}

function assertStringArray(
  value: unknown,
  message: string,
  options: { allowEmptyStrings?: boolean } = {},
): asserts value is string[] {
  assertArray(value, message)
  value.forEach((entry, index) =>
    assertString(
      entry,
      `${message} (item ${index + 1})`,
      options.allowEmptyStrings ? { allowEmpty: true } : undefined,
    ),
  )
}

function assertGenerationRuntimeConfigContract(value: unknown): asserts value is GenerationRuntimeConfig {
  assertRecord(value, 'Prompt studio runtime is unavailable from the backend contract.')
  assertOneOf(value.defaultLanguage, PROMPT_LANGUAGES.map((item) => item.code) as PromptLanguage[], 'Prompt studio runtime has an unsupported "defaultLanguage".')
  ;[
    'cacheGeneratedOutputs',
    'contextAwareCacheReuse',
    'useTopicMemory',
    'usePreviousPassOutputs',
    'preferMultimodalEvidence',
    'topicSessionMemoryEnabled',
    'topicSessionMemoryRecallEnabled',
  ].forEach((key) => assertBoolean(value[key], `Prompt studio runtime is missing "${key}".`))
  ;[
    'staleContextRefinePasses',
    'maxRetriesPerPass',
    'topicPreviewPasses',
    'topicBlueprintPasses',
    'topicLocalizationPasses',
    'topicChatPasses',
    'stageNamingPasses',
    'nodeArticlePasses',
    'paperArticlePasses',
    'selfRefinePasses',
    'researchOrchestrationPasses',
    'researchReportPasses',
    'researchCycleDelayMs',
    'researchStageStallLimit',
    'researchStagePaperLimit',
    'researchArtifactRebuildLimit',
    'nodeCardFigureCandidateLimit',
    'topicSessionMemoryInitEventCount',
    'topicSessionMemoryChatTurnsBetweenCompaction',
    'topicSessionMemoryResearchCyclesBetweenCompaction',
    'topicSessionMemoryTokenThreshold',
    'topicSessionMemoryRecentEventLimit',
    'topicSessionMemoryRecallLimit',
    'topicSessionMemoryRecallLookbackLimit',
    'maxEvidencePerArticle',
    'contextWindowStages',
    'contextWindowNodes',
  ].forEach((key) => assertNumber(value[key], `Prompt studio runtime is missing "${key}".`, { min: 0 }))
  assertNumber(value.languageTemperature, 'Prompt studio runtime is missing "languageTemperature".')
  assertNumber(value.multimodalTemperature, 'Prompt studio runtime is missing "multimodalTemperature".')
  assertNumber(value.topicSessionMemoryRecallRecencyBias, 'Prompt studio runtime is missing "topicSessionMemoryRecallRecencyBias".')
  assertRecord(value.editorialPolicies, 'Prompt studio runtime is missing "editorialPolicies".')
  const editorialPolicies = value.editorialPolicies
  PROMPT_LANGUAGES.forEach(({ code }) => {
    const policy = editorialPolicies[code]
    assertRecord(policy, `Prompt studio runtime editorial policy "${code}" is invalid.`)
    ;['identity', 'mission', 'reasoning', 'style', 'evidence', 'industryLens', 'continuity', 'refinement'].forEach((key) =>
      assertString(policy[key], `Prompt studio runtime editorialPolicies.${code}.${key} is missing.`, {
        allowEmpty: true,
      }),
    )
  })
}

function assertPromptStudioBundleContract(value: unknown): asserts value is PromptStudioBundle {
  assertRecord(value, 'Prompt studio bundle is unavailable from the backend contract.')
  assertArray(value.languages, 'Prompt studio bundle is missing "languages".')
  value.languages.forEach((language, index) => {
    assertRecord(language, `Prompt studio language ${index + 1} is invalid.`)
    assertOneOf(language.code, PROMPT_LANGUAGES.map((item) => item.code) as PromptLanguage[], `Prompt studio language ${index + 1} has an unsupported "code".`)
    assertString(language.label, `Prompt studio language ${index + 1} is missing "label".`)
    assertString(language.nativeName, `Prompt studio language ${index + 1} is missing "nativeName".`)
    assertBoolean(language.isDefault, `Prompt studio language ${index + 1} is missing "isDefault".`)
  })
  assertArray(value.templates, 'Prompt studio bundle is missing "templates".')
  assertArray(value.productCopies, 'Prompt studio bundle is missing "productCopies".')
  assertGenerationRuntimeConfigContract(value.runtime)
  assertRecord(value.runtimeMeta, 'Prompt studio bundle is missing "runtimeMeta".')
  assertString(value.runtimeMeta.key, 'Prompt studio bundle runtimeMeta is missing "key".')
  assertNumber(value.runtimeMeta.revision, 'Prompt studio bundle runtimeMeta is missing "revision".', {
    integer: true,
    min: 0,
  })
  assertString(value.runtimeMeta.hash, 'Prompt studio bundle runtimeMeta is missing "hash".')
  assertString(value.runtimeMeta.source, 'Prompt studio bundle runtimeMeta is missing "source".', {
    allowEmpty: true,
  })
  assertArray(value.runtimeMeta.topLevelKeys, 'Prompt studio bundle runtimeMeta is missing "topLevelKeys".')
  assertBoolean(value.runtimeMeta.legacy, 'Prompt studio bundle runtimeMeta is missing "legacy".')
  assertArray(value.runtimeHistory, 'Prompt studio bundle is missing "runtimeHistory".')
  value.runtimeHistory.forEach((entry, index) => {
    assertRecord(entry, `Prompt studio runtime history ${index + 1} is invalid.`)
    assertString(entry.key, `Prompt studio runtime history ${index + 1} is missing "key".`)
    assertNumber(entry.revision, `Prompt studio runtime history ${index + 1} is missing "revision".`, {
      integer: true,
      min: 0,
    })
    assertString(entry.hash, `Prompt studio runtime history ${index + 1} is missing "hash".`)
    assertString(entry.source, `Prompt studio runtime history ${index + 1} is missing "source".`, {
      allowEmpty: true,
    })
    assertArray(entry.warnings, `Prompt studio runtime history ${index + 1} is missing "warnings".`)
  })
  assertRecord(value.externalAgents, 'Prompt studio bundle is missing "externalAgents".')
  const externalAgents = value.externalAgents
  ;['rootDir', 'readmePath', 'promptGuidePath', 'superPromptPath', 'configExamplePath'].forEach((key) =>
    assertString(externalAgents[key], `Prompt studio externalAgents is missing "${key}".`),
  )
  assertArray(externalAgents.assets, 'Prompt studio externalAgents is missing "assets".')
}

function assertExternalAgentJobPackageContract(
  value: unknown,
): asserts value is ExternalAgentJobPackage {
  assertRecord(value, 'External agent job package is unavailable from the backend contract.')
  assertContract(
    value.schemaVersion === 'external-agent-job-v2',
    'External agent job package has an unsupported "schemaVersion".',
  )
  assertString(value.jobId, 'External agent job package is missing "jobId".')
  assertString(value.generatedAt, 'External agent job package is missing "generatedAt".')
  assertOneOf(value.language, PROMPT_LANGUAGES.map((item) => item.code) as PromptLanguage[], 'External agent job package has an unsupported "language".')
  assertRecord(value.template, 'External agent job package is missing "template".')
  const template = value.template
  assertString(template.id, 'External agent job package template is missing "id".')
  assertString(template.family, 'External agent job package template is missing "family".')
  assertOneOf(template.slot, ['language', 'multimodal'] as const, 'External agent job package template has an unsupported "slot".')
  ;['title', 'description', 'system', 'user', 'notes'].forEach((key) =>
    assertString(template[key], `External agent job package template is missing "${key}".`, {
      allowEmpty: true,
    }),
  )
  assertStringArray(template.tags, 'External agent job package template is missing "tags".', {
    allowEmptyStrings: true,
  })
  assertGenerationRuntimeConfigContract(value.runtime)
  assertRecord(value.editorialPolicy, 'External agent job package is missing "editorialPolicy".')
  const editorialPolicy = value.editorialPolicy
  ;['identity', 'mission', 'reasoning', 'style', 'evidence', 'industryLens', 'continuity', 'refinement'].forEach((key) =>
    assertString(editorialPolicy[key], `External agent job package editorialPolicy is missing "${key}".`, {
      allowEmpty: true,
    }),
  )
  assertRecord(value.modelTarget, 'External agent job package is missing "modelTarget".')
  assertOneOf(value.modelTarget.slot, ['language', 'multimodal'] as const, 'External agent job package modelTarget has an unsupported "slot".')
  assertBoolean(value.modelTarget.configured, 'External agent job package modelTarget is missing "configured".')
  assertOptionalString(value.modelTarget.provider, 'External agent job package modelTarget has an invalid "provider".', { allowEmpty: true })
  assertOptionalString(value.modelTarget.model, 'External agent job package modelTarget has an invalid "model".', { allowEmpty: true })
  assertOptionalString(value.modelTarget.baseUrl, 'External agent job package modelTarget has an invalid "baseUrl".', { allowEmpty: true })
  assertOneOf(value.modelTarget.apiKeyStatus, ['configured', 'missing'] as const, 'External agent job package modelTarget has an unsupported "apiKeyStatus".')
  assertRecord(value.subject, 'External agent job package is missing "subject".')
  assertOneOf(value.subject.type, ['generic', 'topic', 'node'] as const, 'External agent job package subject has an unsupported "type".')
  if (value.subject.id != null) assertString(value.subject.id, 'External agent job package subject has an invalid "id".')
  if (value.subject.topicId != null) assertString(value.subject.topicId, 'External agent job package subject has an invalid "topicId".')
  assertString(value.subject.title, 'External agent job package subject is missing "title".', { allowEmpty: true })
  assertOptionalString(value.subject.route, 'External agent job package subject has an invalid "route".', { allowEmpty: true })
  assertString(value.subject.summary, 'External agent job package subject is missing "summary".', { allowEmpty: true })
  assertRecord(value.scaffold, 'External agent job package is missing "scaffold".')
  const scaffold = value.scaffold
  ;['rootDir', 'readmePath', 'promptGuidePath', 'superPromptPath', 'configExamplePath'].forEach((key) =>
    assertString(scaffold[key], `External agent job package scaffold is missing "${key}".`),
  )
  assertArray(scaffold.assets, 'External agent job package scaffold is missing "assets".')
  assertStringArray(scaffold.supportedAgents, 'External agent job package scaffold is missing "supportedAgents".', {
    allowEmptyStrings: true,
  })
  assertStringArray(scaffold.workflow, 'External agent job package scaffold is missing "workflow".', {
    allowEmptyStrings: true,
  })
  assertOptionalString(value.savedPath, 'External agent job package has an invalid "savedPath".', { allowEmpty: true })
}

const promptIdSet = new Set(Object.values(PROMPT_TEMPLATE_IDS))
const productCopyIdSet = new Set(Object.values(PRODUCT_COPY_IDS))
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
    const bundle = enforceRouteContract(
      await getPromptStudioBundle(),
      assertPromptStudioBundleContract,
      'Prompt studio bundle contract drifted before reaching the client.',
    )
    res.json({
      success: true,
      data: bundle,
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
  validate(PromptStudioSaveSchema),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await savePromptStudioBundle(req.body),
    })
  }),
)

router.post(
  '/reset',
  validate(PromptStudioResetSchema),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await resetPromptStudio(req.body),
    })
  }),
)

router.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const bundle = enforceRouteContract(
      await exportPromptStudioBundle(),
      assertPromptStudioBundleContract,
      'Prompt studio export bundle contract drifted before reaching the client.',
    )
    res.json({
      success: true,
      data: bundle,
    })
  }),
)

router.post(
  '/external-agents/job',
  asyncHandler(async (req, res) => {
    const payload = externalAgentJobSchema.parse(req.body)
    const jobPackage = enforceRouteContract(
      await buildExternalAgentJobPackage(payload),
      assertExternalAgentJobPackageContract,
      'External agent job package contract drifted before reaching the client.',
    )
    res.json({
      success: true,
      data: jobPackage,
    })
  }),
)

router.post(
  '/import',
  validate(PromptStudioSaveSchema),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await savePromptStudioBundle(req.body),
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
  validate(ProductCopyPatchSchema),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await saveProductCopyPatch(req.body),
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
  validate(PromptPatchSchema),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: await savePromptTemplatePatch(req.body),
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
