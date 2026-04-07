import { executeTopicVisualizer } from './executor'

import type { SkillDefinition } from '../../../engine/contracts'

export const topicVisualizerSkill: SkillDefinition = {
  manifest: {
    id: 'topic-visualizer',
    title: '主题展示投影',
    summary: '把 canonical topic memory 投影成前端直接可读的多线阶段展示结构。',
    description:
      '基于 topic memory、论文元数据与已生成内容，构建分支时间线、引用关系图和前台展示投影，并刷新可视化构建时间。',
    recommendedAgentTarget: 'codex',
    defaultMode: 'agent-prompt',
    inputSchema: [
      { key: 'topicId', type: 'string', required: true, description: '要生成展示投影的主题 id。' },
      { key: 'paperIds', type: 'string[]', required: false, description: '可选的论文范围，用于局部重建视图。' },
      { key: 'rebuildMode', type: 'string', required: false, description: '增量重建或全量重建模式。' },
    ],
    outputSchema: {
      branchTimeline: 'object',
      citationGraph: 'object',
      convergences: 'object[]',
      mergeEvents: 'object[]',
      activeBranches: 'object[]',
      dormantBranches: 'object[]',
      stageWindows: 'object[]',
      topicStats: 'object',
      viewModelPatch: 'object',
      topicDisplayPatch: 'object',
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
        id: 'topic-display',
        label: '主题展示投影',
        relativePath: 'workflow/topic-display.json',
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
    localCommand: ['npx', 'ts-node', 'skills-backend/cli.ts', 'skill:run', 'topic-visualizer'],
  },
  execute: executeTopicVisualizer,
}
