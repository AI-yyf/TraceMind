import { buildAgentEnvelope } from './shared.ts'

import type { SkillExecutionPlan } from '../../../../skills-backend/runtime/contracts.ts'

export function buildClaudeCodeSkillEnvelope(plan: SkillExecutionPlan) {
  return buildAgentEnvelope({
    connectorId: 'claude-code',
    agentLabel: 'Claude Code',
    adapterNote:
      '把任务组织成清晰的执行简报，优先遵守 schema 输出、canonical 产物边界，并在失败时给出简洁重试指引。',
    plan,
  })
}
