import { executeOrchestrator } from './executor'

import type { SkillDefinition } from '../../../engine/contracts'

export const orchestratorSkill: SkillDefinition = {
  manifest: {
    id: 'orchestrator',
    title: '研究编排',
    summary: '把发现、内容生成、推进提交和展示刷新编排成一次完整 skill 工作流。',
    description:
      '按受控顺序运行研究 skill 包，隔离失败、稳妥持久化 canonical 产物，并汇总本轮真正发生的变化。',
    recommendedAgentTarget: 'generic',
    defaultMode: 'json-contract',
    inputSchema: [
      { key: 'topicId', type: 'string', required: true, description: '要编排的主题 id。' },
      {
        key: 'workflowMode',
        type: 'string',
        required: false,
        description: '执行模式：discover-only、content-only、visualize-only、full-cycle 或 rebuild。',
      },
      { key: 'paperId', type: 'string', required: false, description: 'content-only 或 rebuild 使用的论文 id。' },
      { key: 'paperIds', type: 'string[]', required: false, description: 'visualize-only 或 rebuild 使用的论文范围。' },
      { key: 'branchId', type: 'string', required: false, description: '要显式推进的分支 id。' },
      { key: 'stageIndex', type: 'number', required: false, description: '选中分支的显式 stage 索引。' },
      { key: 'providerId', type: 'string', required: false, description: '外部 runtime 的 provider 提示。' },
      { key: 'model', type: 'string', required: false, description: '下游 content skill 要使用的模型名。' },
      { key: 'temperature', type: 'number', required: false, description: '下游 content skill 的生成温度。' },
      { key: 'maxTokens', type: 'number', required: false, description: '下游 content skill 的最大输出 token 数。' },
      { key: 'maxIterations', type: 'number', required: false, description: 'discover -> content 最大循环次数。', example: 1 },
      { key: 'attachments', type: 'attachment[]', required: false, description: '传递给下游 skill 的多模态附件。' },
    ],
    outputSchema: {
      steps: 'Array<{id: string; skillId: string; status: string; summary: string; persistedArtifacts: string[]}>',
      artifactsChanged: 'string[]',
      selectedPaper: 'object | null',
      summary: 'string',
      failures: 'Array<{step: string; message: string}>',
      retryHints: 'string[]',
    },
    artifacts: [
      {
        id: 'topic-memory',
        label: '主题运行记忆',
        relativePath: 'workflow/topic-memory.json',
        kind: 'json',
        retention: 'canonical',
      },
      {
        id: 'paper-editorial-store',
        label: '论文生成内容',
        relativePath: 'tracker-content/paper-editorial.json',
        kind: 'json',
        retention: 'canonical',
      },
      {
        id: 'topic-editorial-store',
        label: '主题生成内容',
        relativePath: 'tracker-content/topic-editorial.json',
        kind: 'json',
        retention: 'canonical',
      },
      {
        id: 'decision-memory',
        label: '决策记忆',
        relativePath: 'workflow/decision-memory.json',
        kind: 'json',
        retention: 'canonical',
      },
      {
        id: 'execution-memory',
        label: '执行记忆',
        relativePath: 'workflow/execution-memory.json',
        kind: 'json',
        retention: 'canonical',
      },
    ],
    localCommand: ['npx', 'ts-node', 'skills-backend/cli.ts', 'skill:run', 'orchestrator'],
  },
  execute: executeOrchestrator,
}
