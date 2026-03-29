import { buildClaudeCodeSkillEnvelope } from './claude-code.ts'
import { buildCodexSkillEnvelope } from './codex.ts'
import { buildGenericAgentSkillEnvelope } from './generic-agent.ts'

import type { SkillExecutionPlan } from '../../../../skills-backend/runtime/contracts.ts'

export function buildAgentSkillEnvelope(plan: SkillExecutionPlan) {
  if (plan.agentTarget === 'codex') {
    return buildCodexSkillEnvelope(plan)
  }

  if (plan.agentTarget === 'claude-code') {
    return buildClaudeCodeSkillEnvelope(plan)
  }

  return buildGenericAgentSkillEnvelope(plan)
}

export * from './claude-code.ts'
export * from './codex.ts'
export * from './generic-agent.ts'
