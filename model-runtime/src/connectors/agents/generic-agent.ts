import { buildAgentEnvelope } from './shared.ts'

import type { SkillExecutionPlan } from '../../../../skills-backend/runtime/contracts.ts'

export function buildGenericAgentSkillEnvelope(plan: SkillExecutionPlan) {
  return buildAgentEnvelope({
    connectorId: 'generic-agent',
    agentLabel: '通用智能体',
    adapterNote:
      '把它视为一份可直接执行的 skill 包：严格遵守输入契约，只在允许的产物范围内工作，并返回完全匹配的输出 schema。',
    plan,
  })
}
