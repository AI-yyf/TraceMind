import { buildSkillExecutionPlan } from '../../../skills-backend/runtime/skill-runner.ts'
import { buildAgentSkillEnvelope } from '../connectors/agents/index.ts'
import { runAnthropicConnector, runOpenAICompatibleConnector } from '../connectors/api/index.ts'
import { listProviderConfigs, resolveProviderConfig } from '../config.ts'

import type {
  RuntimeContentPart,
  RuntimeMessage,
  RuntimePromptRequest,
  RuntimeProviderId,
  RuntimeResponse,
  SkillRunRequest,
} from '../types.ts'

function normalizeAttachment(part: {
  kind: string
  name: string
  url?: string
  path?: string
  mimeType?: string
  text?: string
}): RuntimeContentPart {
  if ((part.kind === 'image' || part.kind === 'figure') && typeof part.url === 'string') {
    return {
      type: 'image',
      imageUrl: part.url,
      detail: 'auto',
    }
  }

  return {
    type: 'file',
    fileName: part.name,
    mimeType: part.mimeType,
    url: part.url,
    localPath: part.path,
    text: part.text,
  }
}

function buildSkillMessages(plan: ReturnType<typeof buildSkillExecutionPlan>): RuntimeMessage[] {
  const userContent: RuntimeContentPart[] = [{ type: 'text', text: plan.userPrompt }]

  for (const attachment of plan.attachments) {
    userContent.push(normalizeAttachment(attachment))
  }

  return [
    { role: 'system', content: [{ type: 'text', text: plan.systemPrompt }] },
    { role: 'user', content: userContent },
  ]
}

export class ModelRuntimeClient {
  listProviders() {
    return listProviderConfigs()
  }

  async runPrompt(request: RuntimePromptRequest): Promise<RuntimeResponse> {
    const config = resolveProviderConfig(request.providerId)

    if (request.providerId === 'openai-compatible') {
      return runOpenAICompatibleConnector(config, request)
    }

    if (request.providerId === 'anthropic') {
      return runAnthropicConnector(config, request)
    }

    throw new Error('agent-skill does not support direct prompt execution. Use runSkill instead.')
  }

  async runSkill(request: SkillRunRequest) {
    const providerId = request.providerId ?? 'agent-skill'
    const plan = buildSkillExecutionPlan({
      skillId: request.skillId,
      input: request.input,
      agentTarget: request.agentTarget,
      storageMode: request.storageMode,
    })

    if (providerId === 'agent-skill') {
      return buildAgentSkillEnvelope(plan)
    }

    const config = resolveProviderConfig(providerId)
    const model = request.model ?? config.model
    const messages = buildSkillMessages(plan)

    return this.runPrompt({
      providerId,
      model,
      messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    })
  }
}

export function isRuntimeProviderId(value: string): value is RuntimeProviderId {
  return value === 'openai-compatible' || value === 'anthropic' || value === 'agent-skill'
}
