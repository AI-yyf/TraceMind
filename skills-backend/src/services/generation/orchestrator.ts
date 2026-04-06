import { omniGateway } from '../omni/gateway'
import { getModelConfigFingerprint } from '../omni/config-store'
import { inferResearchRoleForTemplate } from '../omni/routing'
import type { ModelSlot, OmniIssue, OmniTask, ResearchRoleId } from '../omni/types'
import {
  getGenerationRuntimeConfig,
  getPromptTemplate,
  renderPromptVariables,
  type GenerationEditorialPolicy,
  type PromptLanguage,
  type PromptTemplateId,
} from './prompt-registry'
import {
  buildGenerationFingerprint,
  loadTopicGenerationMemory,
  writeGenerationPass,
  type GenerationPassRecord,
  type GenerationSubjectType,
} from './memory-store'
import {
  collectTopicGenerationContext,
  persistResearchJudgmentsFromPass,
} from './research-judgment-store'

export interface StructuredGenerationRequest<T> {
  topicId: string
  subjectType: GenerationSubjectType
  subjectId: string
  templateId: PromptTemplateId
  input: Record<string, unknown>
  fallback: T
  outputContract: string
  language?: PromptLanguage
  preferredSlot?: ModelSlot
  role?: ResearchRoleId
  task?: OmniTask
  maxTokens?: number
  temperature?: number
  force?: boolean
  memoryContext?: Record<string, unknown>
  summaryHint?: string
  variableContext?: Record<string, string | number | null | undefined>
}

export interface StructuredGenerationResult<T> {
  output: T
  fromCache: boolean
  usedFallback: boolean
  issue?: OmniIssue | null
  record: GenerationPassRecord<T>
}

type RuntimeConfig = Awaited<ReturnType<typeof getGenerationRuntimeConfig>>
type TopicGenerationContext = Awaited<ReturnType<typeof collectTopicGenerationContext>>
type GenerationCacheMatch = 'exact' | 'stale-context' | 'miss'

function safeParseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T
  } catch {
    const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/iu)
    const extracted =
      fencedMatch?.[1] ??
      value.match(/\{[\s\S]*\}/u)?.[0] ??
      value.match(/\[[\s\S]*\]/u)?.[0] ??
      null

    if (!extracted) return null

    try {
      return JSON.parse(extracted) as T
    } catch {
      return null
    }
  }
}

function hasExpectedContractKeys(
  value: unknown,
  outputContract: string,
) {
  const contract = safeParseJson<Record<string, unknown>>(outputContract)
  if (!contract || Array.isArray(contract)) {
    return true
  }
  if (typeof value !== 'object' || !value || Array.isArray(value)) return false

  const expectedKeys = Object.keys(contract)
  if (expectedKeys.length === 0) return true
  return expectedKeys.some((key) => key in (value as Record<string, unknown>))
}

function summarizeOutput(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 240)
  if (Array.isArray(value)) {
    for (const item of value) {
      const summary: string = summarizeOutput(item)
      if (summary) return summary
    }
    return ''
  }
  if (value && typeof value === 'object') {
    for (const key of ['summary', 'title', 'headline', 'standfirst', 'digest', 'content']) {
      const maybe: string = summarizeOutput((value as Record<string, unknown>)[key])
      if (maybe) return maybe
    }
  }
  return ''
}

function resolveTask(slot: ModelSlot, task?: OmniTask): OmniTask {
  if (task) return task
  return slot === 'multimodal' ? 'evidence_explainer' : 'topic_summary'
}

function resolveAttempts(
  runtime: RuntimeConfig,
  templateId: PromptTemplateId,
) {
  if (templateId === 'topic.preview') return runtime.topicPreviewPasses
  if (templateId === 'topic.blueprint') return runtime.topicBlueprintPasses
  if (templateId === 'topic.chat') return runtime.topicChatPasses
  if (templateId === 'topic.researchReport') return runtime.researchReportPasses
  if (templateId === 'topic.stageTimeline') return runtime.stageNamingPasses
  if (templateId === 'topic.researchOrchestration') return runtime.researchOrchestrationPasses
  if (templateId === 'article.node' || templateId === 'article.crossPaper') {
    return runtime.nodeArticlePasses
  }
  if (templateId === 'article.paper') return runtime.paperArticlePasses
  return Math.max(1, runtime.maxRetriesPerPass + 1)
}

function buildPassId(
  templateId: PromptTemplateId,
  subjectType: GenerationSubjectType,
  subjectId: string,
  language: PromptLanguage,
) {
  return `${templateId}:${subjectType}:${subjectId}:${language}`
}

function resolveTemperature(runtime: RuntimeConfig, slot: ModelSlot, override?: number) {
  if (typeof override === 'number') return override
  return slot === 'multimodal' ? runtime.multimodalTemperature : runtime.languageTemperature
}

function resolveEditorialPolicy(runtime: RuntimeConfig, language: PromptLanguage): GenerationEditorialPolicy {
  return runtime.editorialPolicies[language] ?? runtime.editorialPolicies.zh
}

function buildEffectiveTopicMemory(
  runtime: RuntimeConfig,
  topicMemory: Awaited<ReturnType<typeof collectTopicGenerationContext>>,
) {
  if (!runtime.useTopicMemory) {
    return {
      topicSnapshot: null,
      recentPasses: [],
      sameSubjectPasses: [],
      anchorPasses: [],
      artifactIndex: [],
      judgmentLedger: [],
      openQuestions: [],
      reviewerWatchpoints: [],
      evidenceWatchpoints: [],
      continuityThreads: [],
      evolutionChains: [],
      researchJudgments: [],
      sameScopeJudgments: [],
    }
  }

  return {
    ...topicMemory,
    recentPasses: runtime.usePreviousPassOutputs ? topicMemory.recentPasses : [],
    sameSubjectPasses: runtime.usePreviousPassOutputs ? topicMemory.sameSubjectPasses : [],
    anchorPasses: runtime.usePreviousPassOutputs ? topicMemory.anchorPasses : [],
  }
}

function buildStableGenerationFingerprintPayload(options: {
  request: StructuredGenerationRequest<unknown>
  language: PromptLanguage
  templateContent: unknown
  editorialPolicy: GenerationEditorialPolicy
  runtime: RuntimeConfig
  modelConfigFingerprint: string
}) {
  return {
    templateId: options.request.templateId,
    language: options.language,
    templateContent: options.templateContent,
    editorialPolicy: options.editorialPolicy,
    runtime: options.runtime,
    modelConfigFingerprint: options.modelConfigFingerprint,
    input: options.request.input,
    memoryContext: options.request.memoryContext,
  }
}

function buildInputFingerprintPayload(options: {
  request: StructuredGenerationRequest<unknown>
  language: PromptLanguage
  templateContent: unknown
  editorialPolicy: GenerationEditorialPolicy
  runtime: RuntimeConfig
  modelConfigFingerprint: string
}) {
  return {
    templateId: options.request.templateId,
    language: options.language,
    templateContent: options.templateContent,
    editorialPolicy: options.editorialPolicy,
    runtime: options.runtime,
    modelConfigFingerprint: options.modelConfigFingerprint,
    input: options.request.input,
  }
}

function buildContextFingerprintPayload(options: {
  memoryContext?: Record<string, unknown>
  continuityFingerprint: string
}) {
  return {
    memoryContext: options.memoryContext ?? null,
    continuityFingerprint: options.continuityFingerprint,
  }
}

function resolveGenerationCacheMatch(options: {
  cached?: GenerationPassRecord<unknown>
  cacheGeneratedOutputs: boolean
  contextAwareCacheReuse?: boolean
  force?: boolean
  fingerprint: string
  inputFingerprint: string
  contextFingerprint: string
  continuityFingerprint: string
}) {
  const cached = options.cached
  if (
    !cached ||
    !options.cacheGeneratedOutputs ||
    options.force ||
    cached.status !== 'ready'
  ) {
    return 'miss' satisfies GenerationCacheMatch
  }

  if (
    cached.fingerprint === options.fingerprint &&
    cached.continuityFingerprint === options.continuityFingerprint
  ) {
    return 'exact' satisfies GenerationCacheMatch
  }

  if (
    cached.inputFingerprint &&
    cached.contextFingerprint &&
    options.contextAwareCacheReuse !== false &&
    cached.inputFingerprint === options.inputFingerprint &&
    cached.contextFingerprint !== options.contextFingerprint
  ) {
    return 'stale-context' satisfies GenerationCacheMatch
  }

  return 'miss' satisfies GenerationCacheMatch
}

function buildContinuityFingerprint(
  subjectType: GenerationSubjectType,
  topicMemory: TopicGenerationContext,
) {
  return buildGenerationFingerprint({
    subjectType,
    sameSubjectPasses: topicMemory.sameSubjectPasses.map((record) => ({
      passId: record.passId,
      templateId: record.templateId,
      subjectId: record.subjectId,
      updatedAt: record.updatedAt,
      summary: record.summary,
    })),
    sameScopeJudgments: topicMemory.sameScopeJudgments.map((judgment) => ({
      id: judgment.id,
      kind: judgment.kind,
      confidence: judgment.confidence,
      scopeId: judgment.scopeId,
      updatedAt: judgment.updatedAt,
    })),
    artifactIndex: (topicMemory.artifactIndex ?? []).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      entityId: entry.entityId,
      stageIndex: entry.stageIndex,
      updatedAt: entry.updatedAt,
      headline: entry.headline,
    })),
    evolutionChains: topicMemory.evolutionChains,
  })
}

function buildSystemPrompt(templateSystemPrompt: string, editorialPolicy: GenerationEditorialPolicy) {
  return [
    editorialPolicy.identity,
    'Global generation charter:',
    `Mission: ${editorialPolicy.mission}`,
    `Reasoning: ${editorialPolicy.reasoning}`,
    `Style: ${editorialPolicy.style}`,
    `Evidence: ${editorialPolicy.evidence}`,
    `Industry lens: ${editorialPolicy.industryLens}`,
    `Continuity: ${editorialPolicy.continuity}`,
    '',
    'Template-specific instruction:',
    templateSystemPrompt,
  ].join('\n')
}

function buildPromptPayload(options: {
  templateUserPrompt: string
  input: Record<string, unknown>
  outputContract: string
  runtime: RuntimeConfig
  editorialPolicy: GenerationEditorialPolicy
  topicMemory: TopicGenerationContext
  memoryContext?: Record<string, unknown>
}) {
  return [
    options.templateUserPrompt,
    '下面是这次生成必须参考的结构化输入。',
    JSON.stringify(
      {
        subject: options.input,
        runtime: {
          useTopicMemory: options.runtime.useTopicMemory,
          usePreviousPassOutputs: options.runtime.usePreviousPassOutputs,
          preferMultimodalEvidence: options.runtime.preferMultimodalEvidence,
          selfRefinePasses: options.runtime.selfRefinePasses,
          maxEvidencePerArticle: options.runtime.maxEvidencePerArticle,
        },
        editorialPolicy: options.editorialPolicy,
        topicMemory: options.topicMemory,
        memoryContext: options.memoryContext ?? null,
        outputContract: options.outputContract,
      },
      null,
      2,
    ),
    '只输出 JSON，不要输出 Markdown，不要解释。',
  ].join('\n\n')
}

function buildRefinementPromptPayload(options: {
  templateUserPrompt: string
  outputContract: string
  editorialPolicy: GenerationEditorialPolicy
  input: Record<string, unknown>
  topicMemory: TopicGenerationContext
  memoryContext?: Record<string, unknown>
  previousDraft: unknown
  round: number
  reuseMode?: 'self-refine' | 'stale-context'
}) {
  const refinementTargets = {
    reviewerWatchpoints: options.topicMemory.reviewerWatchpoints.slice(0, 4),
    establishedJudgments: options.topicMemory.sameScopeJudgments
      .slice(0, 4)
      .map((judgment) => `[${judgment.confidence}] ${judgment.content}`),
    openQuestions: options.topicMemory.openQuestions.slice(0, 3),
    continuityThreads: options.topicMemory.continuityThreads.slice(0, 4),
    evolutionChains: options.topicMemory.evolutionChains.slice(0, 3),
    artifactAnchors: options.topicMemory.artifactIndex.slice(0, 3).map((entry) => ({
      kind: entry.kind,
      entityId: entry.entityId,
      headline: entry.headline,
      summary: entry.summary,
      keyArguments: entry.keyArguments.slice(0, 3),
    })),
  }

  return [
    options.templateUserPrompt,
    options.reuseMode === 'stale-context'
      ? `Stale-context refinement round ${options.round}. The draft was generated earlier for the same subject before local research memory changed. Reconcile it with the current reviewer signals, judgments, open questions, continuity threads, evolution chains, and artifact anchors while keeping the JSON contract exactly the same.`
      : `Self-refinement round ${options.round}. Keep the JSON contract exactly the same, but improve the draft with the specific reviewer signals, established judgments, open questions, continuity threads, and artifact anchors below. Preserve supported claims, remove overreach, and keep the best parts of the previous draft if they are still strongest.`,
    JSON.stringify(
      {
        editorialPolicy: {
          refinement: options.editorialPolicy.refinement,
          evidence: options.editorialPolicy.evidence,
          industryLens: options.editorialPolicy.industryLens,
          continuity: options.editorialPolicy.continuity,
        },
        subject: options.input,
        refinementTargets,
        topicMemory: options.topicMemory,
        memoryContext: options.memoryContext ?? null,
        previousDraft: options.previousDraft,
        outputContract: options.outputContract,
      },
      null,
      2,
    ),
    'Return JSON only.',
  ].join('\n\n')
}

function normalizeScoringText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function flattenOutputText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((item) => flattenOutputText(item)).filter(Boolean).join(' ')
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((item) => flattenOutputText(item))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function collectScoringFragments(
  topicMemory: TopicGenerationContext,
) {
  const fragments = [
    ...topicMemory.sameScopeJudgments.map((judgment) => judgment.content),
    ...topicMemory.reviewerWatchpoints,
    ...topicMemory.openQuestions,
    ...topicMemory.continuityThreads,
    ...topicMemory.evolutionChains,
    ...topicMemory.artifactIndex.flatMap((entry) => [
      entry.headline,
      entry.summary,
      ...entry.keyArguments,
    ]),
  ]

  return Array.from(
    new Set(
      fragments
        .map((item) => normalizeScoringText(item))
        .filter((item) => item.length >= 18),
    ),
  ).slice(0, 16)
}

function scoreOutputQuality(
  output: unknown,
  topicMemory: TopicGenerationContext,
  outputContract: string,
) {
  if (!hasExpectedContractKeys(output, outputContract)) return -1

  const outputText = flattenOutputText(output)
  const normalizedOutput = normalizeScoringText(outputText)
  if (!normalizedOutput) return 0

  let score = Math.min(normalizedOutput.length / 180, 8)

  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const record = output as Record<string, unknown>
    if (
      ['headline', 'title', 'thesis', 'stageThesis', 'summary', 'standfirst', 'digest'].some(
        (key) => typeof record[key] === 'string' && String(record[key]).trim().length > 0,
      )
    ) {
      score += 3
    }

    const structureSignals = ['body', 'sections', 'points', 'bullets', 'evidence', 'lead', 'closing']
    score += structureSignals.reduce((total, key) => {
      const value = record[key]
      if (Array.isArray(value) && value.length > 0) return total + 0.8
      if (typeof value === 'string' && value.trim().length > 0) return total + 0.8
      return total
    }, 0)

    if (typeof record.whyItMatters === 'string' && record.whyItMatters.trim().length > 0) {
      score += 1.5
    }
  }

  const fragmentHits = collectScoringFragments(topicMemory).filter((fragment) =>
    normalizedOutput.includes(fragment),
  ).length

  score += Math.min(fragmentHits, 6) * 0.75
  return score
}

async function runRefinementPasses<T>(options: {
  task: OmniTask
  slot: ModelSlot
  role: ResearchRoleId
  runtime: RuntimeConfig
  temperature?: number
  maxTokens: number
  systemPrompt: string
  renderedUserPrompt: string
  outputContract: string
  editorialPolicy: GenerationEditorialPolicy
  input: Record<string, unknown>
  topicMemory: TopicGenerationContext
  memoryContext?: Record<string, unknown>
  initialDraft: T
  initialIssue?: OmniIssue | null
  rounds: number
  reuseMode: 'self-refine' | 'stale-context'
}) {
  let bestDraft = options.initialDraft
  let bestScore = scoreOutputQuality(
    options.initialDraft,
    options.topicMemory,
    options.outputContract,
  )
  let issue = options.initialIssue ?? null
  let successfulRefinePasses = 0

  for (let refineRound = 1; refineRound <= options.rounds; refineRound += 1) {
    const refinedResult = await omniGateway.complete({
      task: options.task,
      preferredSlot: options.slot,
      role: options.role,
      json: true,
      temperature: resolveTemperature(options.runtime, options.slot, options.temperature),
      maxTokens: options.maxTokens,
      messages: [
        {
          role: 'system',
          content: options.systemPrompt,
        },
        {
          role: 'user',
          content: buildRefinementPromptPayload({
            templateUserPrompt: options.renderedUserPrompt,
            outputContract: options.outputContract,
            editorialPolicy: options.editorialPolicy,
            input: options.input,
            topicMemory: options.topicMemory,
            memoryContext: options.memoryContext,
            previousDraft: bestDraft,
            round: refineRound,
            reuseMode: options.reuseMode,
          }),
        },
      ],
    })

    issue = refinedResult.issue ?? issue
    const refinedParsed = safeParseJson<T>(refinedResult.text)
    if (!refinedParsed) continue
    if (!hasExpectedContractKeys(refinedParsed, options.outputContract)) continue

    const refinedScore = scoreOutputQuality(
      refinedParsed,
      options.topicMemory,
      options.outputContract,
    )

    successfulRefinePasses += 1
    if (refinedScore > bestScore) {
      bestDraft = refinedParsed
      bestScore = refinedScore
    }
  }

  return {
    bestDraft,
    bestScore,
    issue,
    successfulRefinePasses,
  }
}

export async function runStructuredGenerationPass<T>(
  request: StructuredGenerationRequest<T>,
): Promise<StructuredGenerationResult<T>> {
  const [modelConfigFingerprint, runtime, template, memory] = await Promise.all([
    getModelConfigFingerprint(),
    getGenerationRuntimeConfig(),
    getPromptTemplate(request.templateId),
    loadTopicGenerationMemory(request.topicId),
  ])

  const language = request.language ?? runtime.defaultLanguage
  const slot = request.preferredSlot ?? template.slot
  const role = request.role ?? inferResearchRoleForTemplate(request.templateId)
  const task = resolveTask(slot, request.task)
  const templateContent = template.languageContents[language] ?? template.languageContents.zh
  const rawTopicMemory = await collectTopicGenerationContext(request.topicId, memory, {
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    limit: request.subjectType === 'topic' ? runtime.contextWindowStages : runtime.contextWindowNodes,
  })
  const topicMemory = buildEffectiveTopicMemory(runtime, rawTopicMemory)
  const editorialPolicy = resolveEditorialPolicy(runtime, language)

  const continuityFingerprint = buildContinuityFingerprint(request.subjectType, topicMemory)
  const fingerprint = buildGenerationFingerprint(
    buildStableGenerationFingerprintPayload({
      request,
      language,
      templateContent,
      editorialPolicy,
      runtime,
      modelConfigFingerprint,
    }),
  )
  const inputFingerprint = buildGenerationFingerprint(
    buildInputFingerprintPayload({
      request,
      language,
      templateContent,
      editorialPolicy,
      runtime,
      modelConfigFingerprint,
    }),
  )
  const contextFingerprint = buildGenerationFingerprint(
    buildContextFingerprintPayload({
      memoryContext: request.memoryContext,
      continuityFingerprint,
    }),
  )
  const passId = buildPassId(request.templateId, request.subjectType, request.subjectId, language)
  const cached = memory.passRecords[passId] as GenerationPassRecord<T> | undefined
  const cacheMatch = resolveGenerationCacheMatch({
    cached,
    cacheGeneratedOutputs: runtime.cacheGeneratedOutputs,
    contextAwareCacheReuse: runtime.contextAwareCacheReuse,
    force: request.force,
    fingerprint,
    inputFingerprint,
    contextFingerprint,
    continuityFingerprint,
  })

  if (cacheMatch === 'exact' && cached) {
    return {
      output: cached.output,
      fromCache: true,
      usedFallback: false,
      issue: cached.issue ?? null,
      record: {
        ...cached,
        usedCache: true,
      },
    }
  }

  const attemptLimit = resolveAttempts(runtime, request.templateId)
  const systemPrompt = buildSystemPrompt(templateContent.system, editorialPolicy)
  const renderedUserPrompt = renderPromptVariables(
    templateContent.user,
    request.variableContext ?? {},
  )

  if (cacheMatch === 'stale-context' && cached) {
      const reused = await runRefinementPasses<T>({
        task,
        slot,
        role,
        runtime,
      temperature: request.temperature,
      maxTokens: request.maxTokens ?? 1800,
      systemPrompt,
      renderedUserPrompt,
      outputContract: request.outputContract,
      editorialPolicy,
      input: request.input,
      topicMemory,
      memoryContext: request.memoryContext,
      initialDraft: cached.output,
      initialIssue: cached.issue ?? null,
      rounds: Math.max(1, runtime.staleContextRefinePasses),
      reuseMode: 'stale-context',
    })

    if (reused.successfulRefinePasses > 0) {
      const reusedRecord: GenerationPassRecord<T> = {
        passId,
        templateId: request.templateId,
        language,
        subjectType: request.subjectType,
        subjectId: request.subjectId,
        fingerprint,
        inputFingerprint,
        contextFingerprint,
        continuityFingerprint,
        slot,
        status: 'ready',
        usedCache: true,
        attemptCount: reused.successfulRefinePasses,
        issue: reused.issue,
        summary: request.summaryHint ?? summarizeOutput(reused.bestDraft),
        output: reused.bestDraft,
        updatedAt: new Date().toISOString(),
      }

      await Promise.all([
        writeGenerationPass(request.topicId, reusedRecord),
        persistResearchJudgmentsFromPass(request.topicId, reusedRecord),
      ])

      return {
        output: reused.bestDraft,
        fromCache: false,
        usedFallback: false,
        issue: reused.issue,
        record: reusedRecord,
      }
    }
  }

  const userPrompt = buildPromptPayload({
    templateUserPrompt: renderedUserPrompt,
    input: request.input,
    outputContract: request.outputContract,
    runtime,
    editorialPolicy,
    topicMemory,
    memoryContext: request.memoryContext,
  })

  let issue: OmniIssue | null | undefined = null

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const result = await omniGateway.complete({
      task,
      preferredSlot: slot,
      role,
      json: true,
      temperature: resolveTemperature(runtime, slot, request.temperature),
      maxTokens: request.maxTokens ?? 1800,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })

    issue = result.issue
    if (result.usedFallback) {
      break
    }
    let parsed = safeParseJson<T>(result.text)
    if (!parsed) continue
    if (!hasExpectedContractKeys(parsed, request.outputContract)) continue

    let successfulRefinePasses = 0
    if (!result.usedFallback) {
      const refined = await runRefinementPasses<T>({
        task,
        slot,
        role,
        runtime,
        temperature: request.temperature,
        maxTokens: request.maxTokens ?? 1800,
        systemPrompt,
        renderedUserPrompt,
        outputContract: request.outputContract,
        editorialPolicy,
        input: request.input,
        topicMemory,
        memoryContext: request.memoryContext,
        initialDraft: parsed,
        initialIssue: issue,
        rounds: runtime.selfRefinePasses,
        reuseMode: 'self-refine',
      })
      parsed = refined.bestDraft
      issue = refined.issue
      successfulRefinePasses = refined.successfulRefinePasses
    }

    const record: GenerationPassRecord<T> = {
      passId,
      templateId: request.templateId,
      language,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
      fingerprint,
      inputFingerprint,
      contextFingerprint,
      continuityFingerprint,
      slot,
      status: 'ready',
      usedCache: false,
      attemptCount: attempt + successfulRefinePasses,
      issue,
      summary: request.summaryHint ?? summarizeOutput(parsed),
      output: parsed,
      updatedAt: new Date().toISOString(),
    }

    await Promise.all([
      writeGenerationPass(request.topicId, record),
      persistResearchJudgmentsFromPass(request.topicId, record),
    ])

    return {
      output: parsed,
      fromCache: false,
      usedFallback: false,
      issue,
      record,
    }
  }

  const fallbackRecord: GenerationPassRecord<T> = {
    passId,
    templateId: request.templateId,
    language,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    fingerprint,
    inputFingerprint,
    contextFingerprint,
    continuityFingerprint,
    slot,
    status: 'fallback',
    usedCache: false,
    attemptCount: attemptLimit,
    issue,
    summary: request.summaryHint ?? summarizeOutput(request.fallback),
    output: request.fallback,
    updatedAt: new Date().toISOString(),
  }

  await writeGenerationPass(request.topicId, fallbackRecord)

  return {
    output: request.fallback,
    fromCache: false,
    usedFallback: true,
    issue,
    record: fallbackRecord,
  }
}

export const __testing = {
  buildStableGenerationFingerprintPayload,
  buildInputFingerprintPayload,
  buildContextFingerprintPayload,
  buildContinuityFingerprint,
  resolveGenerationCacheMatch,
  buildRefinementPromptPayload,
  scoreOutputQuality,
}
