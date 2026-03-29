import type { SkillExecutionPlan } from '../../../../skills-backend/runtime/contracts.ts'
import type { AgentSkillEnvelope, AgentSkillPacket } from '../../types.ts'

function buildAgentSkillPacket(plan: SkillExecutionPlan): AgentSkillPacket {
  return {
    skillManifest: plan.manifest,
    input: plan.input,
    contextSnapshot: plan.context,
    allowedArtifacts: plan.manifest.artifacts,
    expectedOutputSchema: plan.outputSchema,
    storagePolicy: plan.storagePlan,
  }
}

function buildPromptMarkdown(args: {
  plan: SkillExecutionPlan
  agentLabel: string
  adapterNote: string
  packet: AgentSkillPacket
}) {
  return [
    `# ${args.plan.manifest.title}`,
    '',
    `适配器：${args.agentLabel}`,
    `模式：${args.plan.mode}`,
    `存储策略：${args.plan.storageMode}`,
    '',
    '## 适配说明',
    '',
    args.adapterNote,
    '',
    '## Skill 清单',
    '',
    '```json',
    JSON.stringify(args.packet.skillManifest, null, 2),
    '```',
    '',
    '## 输入',
    '',
    '```json',
    JSON.stringify(args.packet.input, null, 2),
    '```',
    '',
    '## 上下文快照',
    '',
    '```json',
    JSON.stringify(args.packet.contextSnapshot, null, 2),
    '```',
    '',
    '## 允许写入的产物',
    '',
    '```json',
    JSON.stringify(args.packet.allowedArtifacts, null, 2),
    '```',
    '',
    '## 期望输出 Schema',
    '',
    '```json',
    JSON.stringify(args.packet.expectedOutputSchema, null, 2),
    '```',
    '',
    '## 存储策略',
    '',
    '```json',
    JSON.stringify(args.packet.storagePolicy, null, 2),
    '```',
    '',
    '## 系统提示词',
    '',
    args.plan.systemPrompt,
    '',
    '## 用户提示词',
    '',
    args.plan.userPrompt,
    '',
    '## 建议命令',
    '',
    `\`${args.plan.suggestedCommand.join(' ')}\``,
  ].join('\n')
}

export function buildAgentEnvelope(args: {
  connectorId: AgentSkillEnvelope['connectorId']
  agentLabel: string
  adapterNote: string
  plan: SkillExecutionPlan
}): AgentSkillEnvelope {
  const packet = buildAgentSkillPacket(args.plan)

  return {
    providerId: 'agent-skill',
    connectorId: args.connectorId,
    agentTarget: args.plan.agentTarget,
    skillId: args.plan.manifest.id,
    model: 'agent-native',
    plan: args.plan,
    packet,
    promptMarkdown: buildPromptMarkdown({
      plan: args.plan,
      agentLabel: args.agentLabel,
      adapterNote: args.adapterNote,
      packet,
    }),
  }
}
