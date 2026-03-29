import { buildAgentEnvelope } from './shared.ts'

import type { SkillExecutionPlan } from '../../../../skills-backend/runtime/contracts.ts'

export function buildCodexSkillEnvelope(plan: SkillExecutionPlan) {
  return buildAgentEnvelope({
    connectorId: 'codex',
    agentLabel: 'Codex',
    adapterNote:
      '优先使用可复现的补丁、明确的文件路径、默认只写 canonical 产物，并为每个产物附上简短验收检查。',
    plan,
  })
}
