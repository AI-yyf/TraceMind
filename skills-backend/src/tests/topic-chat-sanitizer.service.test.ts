import assert from 'node:assert/strict'
import test from 'node:test'

import { __testing } from '../services/topics/alpha-topic'

test('topic chat sanitizer rejects leaked reasoning traces from compatible models', () => {
  const leaked = `authorContext and selectedEvidence are available.
First, let's analyze the key constraints.
Let me organize the answer before I respond.`

  assert.equal(__testing.looksLikeReasoningLeak(leaked), true)
  assert.equal(__testing.normalizeChatAnswerText(leaked), '')
})

test('topic chat sanitizer preserves clean final answers', () => {
  const answer = `Answer: the mainline moves from end-to-end driving, to world models, and then to unified frameworks.
The main unresolved boundary is still the quality of the evidence index.`

  assert.equal(
    __testing.normalizeChatAnswerText(answer),
    `the mainline moves from end-to-end driving, to world models, and then to unified frameworks.
The main unresolved boundary is still the quality of the evidence index.`,
  )
})

test('topic chat author context drops failed zero-yield research reports so they do not dominate answers', () => {
  const report = __testing.compactTopicChatResearchReport({
    schemaVersion: 'topic-research-report-v1',
    reportId: 'report-1',
    taskId: 'task-1',
    topicId: 'topic-1',
    topicName: 'Topic',
    researchMode: 'duration',
    trigger: 'manual',
    status: 'paused',
    durationHours: 1,
    startedAt: '2026-04-02T12:18:02.833Z',
    deadlineAt: '2026-04-02T13:18:02.833Z',
    completedAt: '2026-04-02T12:26:56.246Z',
    updatedAt: '2026-04-02T13:30:35.685Z',
    currentStage: 1,
    totalStages: 5,
    completedStageCycles: 0,
    totalRuns: 1,
    successfulRuns: 0,
    failedRuns: 1,
    discoveredPapers: 0,
    admittedPapers: 0,
    generatedContents: 0,
    latestStageSummary: 'args.orchestration.nodeActions is not iterable',
    headline: 'Execution fault',
    dek: 'Internal error',
    summary: 'This stale failure report should not dominate topic chat.',
    paragraphs: ['Old failure paragraph'],
    keyMoves: ['Old failure move'],
    openQuestions: ['Old failure question'],
    latestNodeActions: [],
  })

  assert.equal(report, null)
})

test('topic chat request parser strips workbench controls and preserves grounded context', () => {
  const parsed = __testing.parseTopicChatRequest(`Workbench context:
- node: 世界模型的引入
- paper: GAIA-1

这个主题当前沿主线展示的论文有多少篇？请直接回答。

Workbench controls:
response_style=brief
reasoning=enabled
retrieval=disabled`)

  assert.equal(parsed.userQuestion, '这个主题当前沿主线展示的论文有多少篇？请直接回答。')
  assert.deepEqual(parsed.contextItems, ['node: 世界模型的引入', 'paper: GAIA-1'])
  assert.equal(parsed.controls.responseStyle, 'brief')
  assert.equal(parsed.controls.reasoningEnabled, true)
  assert.equal(parsed.controls.retrievalEnabled, false)
  assert.equal(parsed.retrievalQuery.includes('GAIA-1'), true)
})

test('topic chat can answer current mainline paper counts without deferring to the model', () => {
  const catalog: Parameters<typeof __testing.buildDirectTopicChatResponse>[1] = {
    topicId: 'topic-1',
    topicTitle: '自动驾驶世界模型',
    stageCount: 5,
    nodeCount: 5,
    paperCount: 5,
    papers: [
      {
        paperId: 'paper-1',
        anchorId: 'paper:paper-1',
        route: '/paper/paper-1',
        title: '通过不确定性实现端到端自动驾驶',
        titleEn: 'End-to-End Driving Through Uncertainty',
        summary: '早期工作',
        explanation: '验证端到端可行性',
        aliases: ['通过不确定性实现端到端自动驾驶', 'End-to-End Driving Through Uncertainty'],
        stageIndex: 1,
        stageTitle: '问题提出',
        nodeId: 'node-1',
        nodeTitle: '端到端自动驾驶的诞生',
        nodeSummary: '阶段起点',
      },
      {
        paperId: 'paper-5',
        anchorId: 'paper:paper-5',
        route: '/paper/paper-5',
        title: 'LMDrive：语言增强的端到端驾驶',
        titleEn: 'LMDrive',
        summary: '最新阶段',
        explanation: '语言模型增强驾驶',
        aliases: ['LMDrive：语言增强的端到端驾驶', 'LMDrive'],
        stageIndex: 5,
        stageTitle: '综合分析',
        nodeId: 'node-5',
        nodeTitle: '多模态大模型赋能',
        nodeSummary: '当前主线末端',
      },
    ],
  }

  const response = __testing.buildDirectTopicChatResponse(
    '这个主题当前沿主线展示的论文有多少篇？请直接回答。',
    catalog,
  )

  assert.equal(Boolean(response), true)
  assert.match(response?.answer ?? '', /5 篇论文/u)
})

test('topic chat clearly says when a named paper is not part of the current mainline', () => {
  const catalog: Parameters<typeof __testing.buildDirectTopicChatResponse>[1] = {
    topicId: 'topic-1',
    topicTitle: '自动驾驶世界模型',
    stageCount: 5,
    nodeCount: 5,
    paperCount: 5,
    papers: [
      {
        paperId: 'paper-3',
        anchorId: 'paper:paper-3',
        route: '/paper/paper-3',
        title: 'UniAD：统一自动驾驶框架',
        titleEn: 'UniAD',
        summary: '统一框架',
        explanation: '整合感知、预测和规划',
        aliases: ['UniAD：统一自动驾驶框架', 'UniAD'],
        stageIndex: 3,
        stageTitle: '统一框架的涌现',
        nodeId: 'node-3',
        nodeTitle: '统一框架的突破',
        nodeSummary: '主题主线核心节点',
      },
    ],
  }

  const response = __testing.buildDirectTopicChatResponse(
    'YC-Bench 这篇论文在这个主题里扮演什么角色？',
    catalog,
  )

  assert.equal(Boolean(response), true)
  assert.match(response?.answer ?? '', /不在当前主题主线展示/u)
})
