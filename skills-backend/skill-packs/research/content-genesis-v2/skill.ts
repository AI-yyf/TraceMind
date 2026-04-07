import { executeContentGenesis } from './executor'

import type { SkillDefinition } from '../../../engine/contracts'

export const contentGenesisSkill: SkillDefinition = {
  manifest: {
    id: 'content-genesis-v2',
    title: '内容生成',
    summary: '通过直连 LLM 把已追踪论文写成结构化研究内容，并附带多模态覆盖报告。',
    description:
      '继承最初版本的中文研究叙事风格，并结合当前分支、阶段和汇流上下文，直连模型生成正式论文内容。',
    recommendedAgentTarget: 'claude-code',
    defaultMode: 'agent-prompt',
    inputSchema: [
      { key: 'paperId', type: 'string', required: true, description: '要生成内容的论文 id。' },
      { key: 'topicId', type: 'string', required: true, description: '所属主题 id。' },
      { key: 'branchId', type: 'string', required: false, description: '这篇论文推进的分支 id。' },
      { key: 'stageIndex', type: 'number', required: false, description: '对应的分支 stage 索引。' },
      { key: 'problemNodeIds', type: 'string[]', required: false, description: '可选的 problem node 范围。' },
      { key: 'citeIntent', type: 'string', required: false, description: '来自 paper-tracker 的引用意图判断。' },
      { key: 'coverageStrict', type: 'boolean', required: false, description: '是否要求严格的多模态覆盖报告。', example: true },
      { key: 'contentMode', type: 'string', required: false, description: '生成模式，例如 editorial 或 summary。' },
      { key: 'providerId', type: 'string', required: false, description: '直连模型 provider，可选 openai-compatible 或 anthropic。' },
      { key: 'model', type: 'string', required: false, description: '可选的模型名；不传则按主题默认配置或 provider 默认值选择。' },
      { key: 'temperature', type: 'number', required: false, description: '可选的生成温度。' },
      { key: 'maxTokens', type: 'number', required: false, description: '可选的最大输出 token 数。' },
      { key: 'attachments', type: 'attachment[]', required: false, description: '可选的图片、图表、PDF 或表格附件。' },
    ],
    outputSchema: {
      paperEditorial: {
        titleZh: 'string',
        highlight: 'string',
        openingStandfirst: 'string',
        sections: 'Array<{id: string; editorialTitle: string; paragraphs: string[]; evidence: object[]}>',
        evidenceBlocks: 'object[]',
        closingHandoff: 'string[]',
        problemsOut: 'object[]',
        coverCaption: 'string',
      },
      topicEditorialDelta: 'object',
      cardDigest: 'string',
      timelineDigest: 'string',
      problemsOut: 'object[]',
      contextUpdateProposal: 'object',
      coverageReport: {
        coveredAssets: 'string[]',
        uncoveredAssets: 'string[]',
        inferenceWarnings: 'string[]',
        coverageScore: 'number',
      },
    },
    artifacts: [
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
        id: 'execution-memory',
        label: '执行记忆',
        relativePath: 'workflow/execution-memory.json',
        kind: 'json',
        retention: 'canonical',
      },
    ],
    localCommand: ['npx', 'ts-node', 'skills-backend/cli.ts', 'skill:run', 'content-genesis-v2'],
  },
  execute: executeContentGenesis,
}
