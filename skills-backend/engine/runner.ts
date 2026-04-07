import { buildContextSnapshot, generatedDataRoot, listInputAttachments } from './context/index'
import { persistArtifactChanges } from './storage/index'

import type {
  AgentTarget,
  ArtifactManager,
  SkillDefinition,
  SkillExecutionPlan,
  SkillExecutionRequest,
  SkillExecutionResult,
  SkillExecutorResult,
  SkillOutput,
  SkillStorageMode,
} from './contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function describeValue(value: unknown) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function isAttachmentRecord(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.name === 'string'
}

function validateInput(definition: SkillDefinition, request: SkillExecutionRequest) {
  const errors: string[] = []

  for (const field of definition.manifest.inputSchema) {
    const value = request.input[field.key]
    if (value === undefined || value === null) {
      if (field.required) {
        errors.push(`Missing required input "${field.key}".`)
      }
      continue
    }

    const valid =
      field.type === 'string'
        ? typeof value === 'string'
        : field.type === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : field.type === 'boolean'
            ? typeof value === 'boolean'
            : field.type === 'string[]'
              ? Array.isArray(value) && value.every((item) => typeof item === 'string')
              : field.type === 'object'
                ? isRecord(value)
                : field.type === 'attachment[]'
                  ? Array.isArray(value) && value.every(isAttachmentRecord)
                  : false

    if (!valid) {
      errors.push(`Input "${field.key}" must be ${field.type}, received ${describeValue(value)}.`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid input for ${definition.manifest.id}: ${errors.join(' ')}`)
  }
}

function isOptionalSchema(schema: unknown) {
  return (
    typeof schema === 'string' &&
    (schema.includes('| null') || schema.includes('| undefined') || schema.endsWith('?'))
  )
}

function validateAgainstSchema(args: {
  path: string
  schema: unknown
  value: unknown
  errors: string[]
}) {
  const { path, schema, value, errors } = args

  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`)
      return
    }

    if (schema.length > 0) {
      for (const [index, item] of value.entries()) {
        validateAgainstSchema({
          path: `${path}[${index}]`,
          schema: schema[0],
          value: item,
          errors,
        })
      }
    }
    return
  }

  if (isRecord(schema)) {
    if (!isRecord(value)) {
      errors.push(`${path} must be an object.`)
      return
    }

    for (const [key, childSchema] of Object.entries(schema)) {
      if (!(key in value)) {
        if (!isOptionalSchema(childSchema)) {
          errors.push(`${path}.${key} is missing.`)
        }
        continue
      }

      validateAgainstSchema({
        path: `${path}.${key}`,
        schema: childSchema,
        value: value[key],
        errors,
      })
    }
    return
  }

  if (typeof schema !== 'string') {
    return
  }

  if (value === null || value === undefined) {
    if (!isOptionalSchema(schema)) {
      errors.push(`${path} must not be null or undefined.`)
    }
    return
  }

  const normalized = schema.toLowerCase()

  if (normalized === 'string' && typeof value !== 'string') {
    errors.push(`${path} must be a string.`)
    return
  }

  if (normalized === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(`${path} must be a number.`)
    return
  }

  if (normalized === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean.`)
    return
  }

  if ((normalized === 'object' || normalized === 'object | null') && !isRecord(value)) {
    errors.push(`${path} must be an object.`)
    return
  }

  if ((normalized.includes('string[]') || normalized.startsWith('array<')) && !Array.isArray(value)) {
    errors.push(`${path} must be an array.`)
  }
}

function validateOutput(definition: SkillDefinition, output: Record<string, unknown>) {
  const errors: string[] = []
  validateAgainstSchema({
    path: 'output',
    schema: definition.manifest.outputSchema,
    value: output,
    errors,
  })

  if (errors.length > 0) {
    throw new Error(`Invalid output from ${definition.manifest.id}: ${errors.join(' ')}`)
  }
}

function validateArtifactChanges(definition: SkillDefinition, artifactChanges: Array<Record<string, unknown>>) {
  for (const [index, artifact] of artifactChanges.entries()) {
    if (typeof artifact.relativePath !== 'string' || artifact.relativePath.length === 0) {
      throw new Error(`Artifact change #${index + 1} from ${definition.manifest.id} is missing relativePath.`)
    }

    if (
      artifact.kind !== 'json' &&
      artifact.kind !== 'markdown' &&
      artifact.kind !== 'typescript' &&
      artifact.kind !== 'asset'
    ) {
      throw new Error(`Artifact change #${index + 1} from ${definition.manifest.id} has invalid kind.`)
    }

    if (artifact.retention !== 'canonical' && artifact.retention !== 'ephemeral') {
      throw new Error(`Artifact change #${index + 1} from ${definition.manifest.id} has invalid retention.`)
    }
  }
}

function buildAgentSystemPrompt(agentTarget: AgentTarget, title: string) {
  const agentLine =
    agentTarget === 'codex'
      ? '你正在为 Codex 打包一次 skill 运行。优先提供确定性输出、明确路径和简洁执行步骤。'
      : agentTarget === 'claude-code'
        ? '你正在为 Claude Code 打包一次 skill 运行。优先提供清晰的任务边界、产物预期和验收检查。'
        : '你正在为通用编码代理打包一次 skill 运行。请保持契约精确、结构稳定、便于工具消费。'

  return [
    agentLine,
    `请只使用提供的 canonical 上下文执行「${title}」这个 skill。`,
    '除非存储策略明确允许，否则不要创建额外的持久化存储。',
    '返回结果时必须严格匹配声明的输出 schema。',
  ].join('\n')
}

function buildUserPrompt(plan: SkillExecutionPlan) {
  return [
    `Skill：${plan.manifest.title}`,
    `摘要：${plan.manifest.summary}`,
    '',
    '输入契约：',
    JSON.stringify(plan.input, null, 2),
    '',
    '已解析的项目上下文：',
    JSON.stringify(plan.context, null, 2),
    '',
    '期望输出 schema：',
    JSON.stringify(plan.outputSchema, null, 2),
    '',
    '允许写入的 canonical 产物面：',
    plan.manifest.artifacts
      .map((artifact) => `- ${artifact.label}：${artifact.relativePath}（${artifact.retention}）`)
      .join('\n'),
  ].join('\n')
}

function buildSuggestedCommand(plan: {
  localCommand: string[]
  input: Record<string, unknown>
  storageMode: SkillStorageMode
}) {
  return [
    ...plan.localCommand,
    ...Object.entries(plan.input).flatMap(([key, value]) => [`--${key}`, String(value)]),
    '--storageMode',
    plan.storageMode,
  ]
}

export function buildPlanForSkillDefinition(
  definition: SkillDefinition,
  request: SkillExecutionRequest,
): SkillExecutionPlan {
  validateInput(definition, request)

  const agentTarget = request.agentTarget ?? definition.manifest.recommendedAgentTarget
  const mode = request.mode ?? definition.manifest.defaultMode
  const storageMode = request.storageMode ?? 'canonical-only'
  const context = buildContextSnapshot(request)
  const attachments = listInputAttachments(request.input)

  const plan: SkillExecutionPlan = {
    manifest: definition.manifest,
    mode,
    agentTarget,
    storageMode,
    input: request.input,
    context,
    attachments,
    systemPrompt: buildAgentSystemPrompt(agentTarget, definition.manifest.title),
    userPrompt: '',
    suggestedCommand: [],
    outputSchema: definition.manifest.outputSchema,
    storagePlan: {
      strategy: storageMode,
      root: generatedDataRoot,
      notes: [
        '默认只落 canonical 工作流数据。',
        '只有 debug 模式才会把中间 prompt 或原始模型输出归档到 tmp/skill-runs。',
        '运行记忆和决策痕迹尽量保持结构化，并优先采用追加式写入。',
      ],
    },
  }

  plan.userPrompt = buildUserPrompt(plan)
  plan.suggestedCommand = buildSuggestedCommand({
    localCommand: definition.manifest.localCommand,
    input: request.input,
    storageMode,
  })

  return plan
}

export async function runSkillDefinition(
  definition: SkillDefinition,
  request: SkillExecutionRequest,
): Promise<SkillExecutionResult> {
  const plan = buildPlanForSkillDefinition(definition, request)
  const runId = `${definition.manifest.id}-${Date.now()}`
  const normalizedRequest = {
    ...request,
    agentTarget: plan.agentTarget,
    mode: plan.mode,
    storageMode: plan.storageMode,
  }
  const collectedChanges: NonNullable<SkillExecutorResult['artifactChanges']> = []
  const artifactManager: ArtifactManager = {
    addChange(change) {
      collectedChanges.push(change)
    },
    listChanges() {
      return [...collectedChanges]
    },
  }
  const executeFn = definition.execute as unknown as (...args: unknown[]) => Promise<unknown>
  const rawExecuted =
    executeFn.length >= 2
      ? await executeFn(
          {
            params: normalizedRequest.input,
            request: normalizedRequest,
          },
          plan.context,
          artifactManager,
        )
      : await executeFn({
          request: normalizedRequest,
          context: plan.context,
        })
  const executed = normalizeExecutionResult(rawExecuted, collectedChanges)

  validateOutput(definition, executed.output)
  const artifactChanges = [...(executed.artifactChanges ?? []), ...(executed.debugArtifacts ?? [])]
  validateArtifactChanges(
    definition,
    artifactChanges as unknown as Array<Record<string, unknown>>,
  )
  const persistedArtifacts = persistArtifactChanges({
    runId,
    storageMode: plan.storageMode,
    artifactChanges,
  })

  return {
    runId,
    manifest: definition.manifest,
    mode: plan.mode,
    agentTarget: plan.agentTarget,
    storageMode: plan.storageMode,
    input: request.input,
    context: plan.context,
    output: executed.output,
    artifactChanges,
    persistedArtifacts,
    summary: executed.summary,
  }
}

function normalizeExecutionResult(
  value: unknown,
  artifactChanges: NonNullable<SkillExecutorResult['artifactChanges']>,
): SkillExecutorResult {
  const legacy = value as SkillOutput | null
  if (
    legacy &&
    typeof legacy === 'object' &&
    'success' in legacy &&
    typeof legacy.success === 'boolean'
  ) {
    if (!legacy.success) {
      throw new Error(legacy.error ?? 'Legacy skill execution failed.')
    }
    const output =
      legacy.data && typeof legacy.data === 'object' && !Array.isArray(legacy.data)
        ? (legacy.data as Record<string, unknown>)
        : {}
    return {
      output,
      artifactChanges: [...artifactChanges, ...(legacy.artifacts ?? [])],
      summary:
        typeof output.summary === 'string'
          ? output.summary
          : typeof output.decisionSummary === 'string'
            ? output.decisionSummary
            : 'Legacy skill execution completed.',
    }
  }

  return value as SkillExecutorResult
}
